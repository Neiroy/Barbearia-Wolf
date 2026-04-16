import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { BadgeDollarSign, CalendarCheck2, Download, Landmark, TrendingUp, Wallet } from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageHeader } from '../../../components/ui/PageHeader'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { SectionCard } from '../../../components/ui/SectionCard'
import { DataTable } from '../../../components/ui/DataTable'
import { ErrorState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PrimaryKpiCard } from '../components/PrimaryKpiCard'
import { QuickActionLinks } from '../components/QuickActionLinks'
import { getAdminDashboardSnapshot, groupAttendancesByCombo, listAttendances, listExpenses } from '../../../services/supabase'
import { formatCurrency, formatDateTime } from '../../../utils/formatters'

const expenseColorMap = {
  fixo: '#0ea5e9',
  variavel: '#6366f1',
  produto: '#22c55e',
  manutencao: '#38bdf8',
  operacao: '#f97316',
  outros: '#a78bfa',
}

export function AdminDashboardPage() {
  const [snapshot, setSnapshot] = useState(null)
  const [monthAttendances, setMonthAttendances] = useState([])
  const [recentAttendances, setRecentAttendances] = useState([])
  const [monthExpenses, setMonthExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedCombos, setExpandedCombos] = useState({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const startDate = dayjs().startOf('month').format('YYYY-MM-DD')
        const endDate = dayjs().endOf('month').format('YYYY-MM-DD')

        const [dashboardSnapshot, attendances, expenses] = await Promise.all([
          getAdminDashboardSnapshot(),
          listAttendances({ startDate, endDate }),
          listExpenses(startDate),
        ])
        const groupedAttendances = groupAttendancesByCombo(attendances).map((group) => {
          const matchingRows = attendances.filter((row) => {
            if (group.venda_id) {
              return row.venda_id === group.venda_id
            }
            return (
              row.usuario_id === group.usuario_id &&
              (row.cliente_nome || '').trim().toLowerCase() ===
                (group.cliente_nome || '').trim().toLowerCase() &&
              dayjs(row.data_hora).format('YYYY-MM-DD HH:mm') ===
                dayjs(group.data_hora).format('YYYY-MM-DD HH:mm')
            )
          })
          const source = matchingRows[0]
          return {
            ...group,
            usuario: source?.usuario,
            servicoResumo: matchingRows.map((row) => row.servico?.nome || '-'),
            servicoValores: matchingRows.map((row) => Number(row.valor_servico || 0)),
          }
        })
        setSnapshot(dashboardSnapshot)
        setMonthAttendances(attendances)
        setRecentAttendances(groupedAttendances.slice(0, 8))
        setMonthExpenses(expenses)
      } catch (loadError) {
        setError(loadError.message || 'Falha ao carregar dashboard')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const weeklyRevenueData = useMemo(() => {
    const weeks = [1, 2, 3, 4, 5].map((week) => ({ name: `S${week}`, valor: 0 }))
    monthAttendances.forEach((attendance) => {
      const day = dayjs(attendance.data_hora).date()
      const weekIndex = Math.min(Math.floor((day - 1) / 7), 4)
      weeks[weekIndex].valor += Number(attendance.valor_servico)
    })
    return weeks
  }, [monthAttendances])

  const expenseByCategoryData = useMemo(() => {
    const grouped = monthExpenses.reduce((acc, expense) => {
      const type = expense.tipo || 'outros'
      acc[type] = (acc[type] || 0) + Number(expense.valor)
      return acc
    }, {})
    return Object.entries(grouped).map(([name, valor]) => ({
      name,
      valor,
      color: expenseColorMap[name] || '#94a3b8',
    }))
  }, [monthExpenses])

  const quickActions = [
    { label: 'Novo atendimento', to: '/admin/atendimentos', icon: CalendarCheck2 },
    { label: 'Ver fechamento semanal', to: '/admin/relatorios-semanais', icon: TrendingUp },
    { label: 'Financeiro mensal', to: '/admin/financeiro-mensal', icon: Landmark },
    { label: 'Exportar relatorio', to: '/admin/atendimentos', icon: Download },
  ]

  function toggleComboDetails(comboId) {
    setExpandedCombos((old) => ({
      ...old,
      [comboId]: !old[comboId],
    }))
  }

  if (loading) return <LoadingState label="Carregando indicadores do dashboard..." />
  if (error) return <ErrorState message={error} />

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Centro de Gestao"
        description="Visao executiva de faturamento, produtividade e resultado do negocio."
        actions={<QuickActionLinks actions={quickActions} />}
      />

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-6">
        <PrimaryKpiCard
          title="Faturamento do mes"
          value={formatCurrency(snapshot.monthRevenue)}
          subtitle="Receita consolidada no periodo atual"
          icon={<BadgeDollarSign size={18} />}
        />
        <PrimaryKpiCard
          title="Lucro liquido do mes"
          value={formatCurrency(snapshot.monthNetProfit)}
          subtitle="Resultado apos gastos e comissoes"
          icon={<TrendingUp size={18} />}
        />
        <PrimaryKpiCard
          title="Gastos no mes"
          value={formatCurrency(snapshot.monthExpenses)}
          subtitle="Custos operacionais e despesas totais"
          icon={<Wallet size={18} />}
        />
        <PrimaryKpiCard
          title="Comissoes no mes"
          value={formatCurrency(snapshot.monthCommissions)}
          subtitle="Somente equipe comissionada"
          icon={<Landmark size={18} />}
        />
        <PrimaryKpiCard
          title="Receita dos funcionarios"
          value={formatCurrency(snapshot.monthEmployeeRevenue)}
          subtitle="Faturamento da equipe comissionada"
          icon={<TrendingUp size={18} />}
        />
        <PrimaryKpiCard
          title="Receita do dono/admin"
          value={formatCurrency(snapshot.monthOwnerRevenue)}
          subtitle="Producao operacional sem custo de comissao"
          icon={<BadgeDollarSign size={18} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Faturamento por semana do mes" subtitle="Leitura estrategica da evolucao semanal.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyRevenueData}>
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                  }}
                />
                <Bar dataKey="valor" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Gastos por categoria" subtitle="Distribuicao das despesas do mes.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenseByCategoryData}
                  dataKey="valor"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={55}
                  paddingAngle={2}
                >
                  {expenseByCategoryData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Atendimentos recentes"
        subtitle="Movimentacoes mais recentes para acompanhamento rapido da operacao."
      >
        <DataTable
          columns={[
            { key: 'data_hora', label: 'Horario/Data', render: (row) => formatDateTime(row.data_hora) },
            { key: 'cliente_nome', label: 'Cliente' },
            {
              key: 'servico',
              label: 'Servico(s)',
              render: (row) => (
                <div className="space-y-1">
                  {row.servicoResumo?.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20"
                        onClick={() => toggleComboDetails(row.id)}
                      >
                        Combo ({row.servicoResumo.length} servicos)
                      </button>
                      {expandedCombos[row.id] ? (
                        <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-[11px] text-slate-200">
                          {row.servicoResumo.map((serviceName, index) => (
                            <p
                              key={`${row.id}-${serviceName}-${index}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span>{serviceName}</span>
                              <span className="font-semibold text-sky-300">
                                {formatCurrency(row.servicoValores?.[index] || 0)}
                              </span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <span>{row.servicoResumo?.[0] || '-'}</span>
                  )}
                </div>
              ),
            },
            { key: 'usuario', label: 'Funcionario', render: (row) => row.usuario?.nome || '-' },
            { key: 'valor_servico', label: 'Valor total', render: (row) => formatCurrency(row.valor_servico) },
          ]}
          rows={recentAttendances}
          empty="Nenhuma movimentacao recente encontrada."
        />
      </SectionCard>

      <SectionCard title="Indicadores complementares" subtitle="Camada secundaria de apoio a gestao.">
        <SummaryGrid columns={4}>
          <StatCard label="Faturamento de hoje" value={formatCurrency(snapshot.todayRevenue)} />
          <StatCard label="Faturamento da semana" value={formatCurrency(snapshot.weekRevenue)} />
          <StatCard label="Ticket medio" value={formatCurrency(snapshot.ticketMedio)} />
          <StatCard label="Atendimentos no mes" value={snapshot.totalAttendances} />
          <StatCard label="Funcionario destaque" value={snapshot.highlightEmployee} />
          <StatCard label="Servico mais realizado" value={snapshot.mostUsedService} />
          <StatCard label="Atalho para fechamento" value="Ver agora" hint="Acesse o fechamento semanal" />
          <StatCard label="Atalho para operacao" value="Novo lancamento" hint="Registre atendimentos rapidamente" />
        </SummaryGrid>
      </SectionCard>
    </section>
  )
}
