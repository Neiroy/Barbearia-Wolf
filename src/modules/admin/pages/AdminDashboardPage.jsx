import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { BadgeDollarSign, CalendarCheck2, Download, Landmark, TrendingUp, Users, Wallet } from 'lucide-react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { PageFrame } from '../../../components/ui/PageFrame'
import { PageHeader } from '../../../components/ui/PageHeader'
import { StatCard } from '../../../components/ui/StatCard'
import { CurrencyCard, SummaryGrid } from '../../../components/ui/SummaryGrid'
import { SectionCard } from '../../../components/ui/SectionCard'
import { DataTable } from '../../../components/ui/DataTable'
import { ErrorState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PrimaryKpiCard } from '../components/PrimaryKpiCard'
import { QuickActionLinks } from '../components/QuickActionLinks'
import { getAdminDashboardSnapshot, groupAttendancesByCombo, listAttendances, listExpenses, listWeeklyClosures } from '../../../services/supabase'
import { getBarberWeekRange } from '../../../utils/dateRanges'
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
  const [weekClosures, setWeekClosures] = useState([])
  const [recentAttendances, setRecentAttendances] = useState([])
  const [monthExpenses, setMonthExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedCombos, setExpandedCombos] = useState({})
  const currentWeekRange = useMemo(() => getBarberWeekRange(), [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const startDate = dayjs().startOf('month').format('YYYY-MM-DD')
        const endDate = dayjs().endOf('month').format('YYYY-MM-DD')

        const [dashboardSnapshot, attendances, expenses, weeklyRows] = await Promise.all([
          getAdminDashboardSnapshot(),
          listAttendances({ startDate, endDate }),
          listExpenses(startDate),
          listWeeklyClosures(currentWeekRange.startDate, currentWeekRange.endDate, { sync: true }),
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
            venda: source?.venda || null,
            servicoResumo: matchingRows.map((row) => row.servico?.nome || '-'),
            servicoValores: matchingRows.map((row) => Number(row.valor_servico || 0)),
          }
        })
        setSnapshot(dashboardSnapshot)
        setMonthAttendances(attendances)
        setWeekClosures(weeklyRows)
        setRecentAttendances(groupedAttendances.slice(0, 8))
        setMonthExpenses(expenses)
      } catch (loadError) {
        setError(loadError.message || 'Falha ao carregar dashboard')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [currentWeekRange.endDate, currentWeekRange.startDate])

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

  const revenueSourceData = useMemo(
    () => [
      {
        name: 'Equipe',
        valor: Number(snapshot?.monthEmployeeRevenue || 0),
        color: '#0ea5e9',
      },
      {
        name: 'Dono/Admin',
        valor: Number(snapshot?.monthOwnerRevenue || 0),
        color: '#6366f1',
      },
    ],
    [snapshot],
  )

  const commissionByEmployeeData = useMemo(() => {
    const grouped = monthAttendances.reduce((acc, row) => {
      if (!row.usuario?.recebe_comissao) return acc
      const name = row.usuario?.nome || 'Sem nome'
      acc[name] = (acc[name] || 0) + Number(row.valor_comissao || 0)
      return acc
    }, {})
    return Object.entries(grouped)
      .map(([name, valor]) => ({ name, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)
  }, [monthAttendances])

  const weeklyClosingSummary = useMemo(() => {
    const totals = weekClosures.reduce(
      (acc, row) => {
        if (!row.usuario?.recebe_comissao) return acc
        const commission = Number(row.total_comissao || 0)
        if (!commission) return acc
        const status = row.status_pagamento || 'aberto'
        acc.total += commission
        if (status === 'pago') {
          acc.paid += commission
        } else {
          acc.open += commission
          acc.pendingEmployees.add(row.usuario?.nome || 'Sem nome')
        }
        return acc
      },
      { total: 0, paid: 0, open: 0, pendingEmployees: new Set() },
    )

    const pendingCount = totals.pendingEmployees.size
    const statusText =
      totals.total <= 0
        ? 'Sem comissão em aberto na semana'
        : pendingCount === 0
          ? 'Fechamento em dia'
          : `${pendingCount} funcionário(s) com pendência`

    return {
      total: totals.total,
      paid: totals.paid,
      open: totals.open,
      pendingCount,
      statusText,
    }
  }, [weekClosures])

  const revenueSourceShareData = useMemo(() => {
    const total = revenueSourceData.reduce((sum, item) => sum + item.valor, 0)
    return revenueSourceData.map((item) => ({
      ...item,
      percent: total > 0 ? (item.valor / total) * 100 : 0,
    }))
  }, [revenueSourceData])

  const quickActions = [
    { label: 'Novo atendimento', to: '/admin/atendimentos', icon: CalendarCheck2 },
    { label: 'Ver fechamento semanal', to: '/admin/relatorios-semanais', icon: TrendingUp },
    { label: 'Financeiro mensal', to: '/admin/financeiro-mensal', icon: Landmark },
    { label: 'Exportar relatório', to: '/admin/atendimentos', icon: Download },
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
    <PageFrame>
      <PageHeader
        eyebrow="Admin"
        title="Centro de gestão"
        description="Visão executiva de faturamento, produtividade e resultado do negócio."
        actions={<QuickActionLinks actions={quickActions} />}
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <PrimaryKpiCard
          title="Realizado no mês"
          value={formatCurrency(snapshot.monthRevenue)}
          subtitle="Produção registrada (inclui vendas pendentes)"
          icon={<BadgeDollarSign size={18} />}
          variant="highlight"
        />
        <PrimaryKpiCard
          title="Recebido no mês (caixa)"
          value={formatCurrency(snapshot.monthReceived)}
          subtitle="Vendas já pagas pelo cliente"
          icon={<BadgeDollarSign size={18} />}
          variant="highlight"
        />
        <PrimaryKpiCard
          title="Pendente de recebimento"
          value={formatCurrency(snapshot.monthPending)}
          subtitle="Ainda não quitado pelo cliente"
          icon={<Landmark size={18} />}
          variant="highlight"
        />
        <PrimaryKpiCard
          title="Lucro líquido do mês"
          value={formatCurrency(snapshot.monthNetProfit)}
          subtitle="Sobre caixa recebido, após gastos e comissões válidas"
          icon={<TrendingUp size={18} />}
          variant="highlight"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <PrimaryKpiCard
          title="Gastos no mês"
          value={formatCurrency(snapshot.monthExpenses)}
          subtitle="Custos operacionais e despesas totais"
          icon={<Wallet size={18} />}
        />
        <PrimaryKpiCard
          title="Comissão gerada (sobre pago)"
          value={formatCurrency(snapshot.monthCommissionsGenerated)}
          subtitle="Somente serviços com venda quitada"
          icon={<Users size={18} />}
        />
        <PrimaryKpiCard
          title="Comissão paga (equipe)"
          value={formatCurrency(snapshot.monthCommissionsPaid)}
          subtitle="Fechamento semanal quitado"
          icon={<CalendarCheck2 size={18} />}
        />
        <PrimaryKpiCard
          title="Comissão pendente (equipe)"
          value={formatCurrency(snapshot.monthCommissionsPending)}
          subtitle="A pagar aos funcionários"
          icon={<Landmark size={18} />}
        />
      </div>

      <SectionCard
        title="Origem da receita"
        subtitle="Composição do faturamento mensal entre equipe comissionada e dono/admin."
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <SummaryGrid columns={3}>
            <CurrencyCard
              label="Receita gerada pela equipe"
              value={formatCurrency(snapshot.monthEmployeeRevenue)}
              hint="Serviços executados por funcionários comissionados"
            />
            <CurrencyCard
              label="Receita gerada pelo dono/admin"
              value={formatCurrency(snapshot.monthOwnerRevenue)}
              hint="Produção operacional sem custo de comissão"
            />
            <CurrencyCard
              label="Participação da equipe"
              value={`${revenueSourceShareData[0]?.percent.toFixed(1) || 0}%`}
              hint="Percentual da equipe no faturamento mensal"
            />
          </SummaryGrid>
          <div className="h-64 rounded-xl border border-slate-800 bg-slate-950/60 p-2">
            {revenueSourceData.some((item) => item.valor > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={revenueSourceData}
                    dataKey="valor"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={88}
                    innerRadius={52}
                    paddingAngle={3}
                  >
                    {revenueSourceData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                    formatter={(value) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Sem dados de faturamento para o período.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Operação do período" subtitle="Indicadores operacionais para leitura rápida da performance.">
        <SummaryGrid columns={4}>
          <StatCard label="Realizado hoje" value={formatCurrency(snapshot.todayRevenue)} />
          <StatCard label="Recebido hoje (caixa)" value={formatCurrency(snapshot.todayReceived)} />
          <StatCard label="Realizado na semana" value={formatCurrency(snapshot.weekRevenue)} />
          <StatCard label="Recebido na semana" value={formatCurrency(snapshot.weekReceived)} />
        </SummaryGrid>
        <SummaryGrid columns={4}>
          <StatCard label="Ticket médio (mês)" value={formatCurrency(snapshot.ticketMedio)} />
          <StatCard label="Atendimentos no mês" value={snapshot.totalAttendances} />
          <StatCard label="Pendente hoje" value={formatCurrency(snapshot.todayPending)} />
          <StatCard label="Pendente na semana" value={formatCurrency(snapshot.weekPending)} />
        </SummaryGrid>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <SectionCard title="Faturamento por semana do mês" subtitle="Leitura estratégica da evolução semanal.">
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

        <SectionCard title="Gastos por categoria" subtitle="Distribuição das despesas do mês.">
          <div className="h-72">
            {expenseByCategoryData.length > 0 ? (
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
                    formatter={(value) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Nenhum gasto cadastrado no período.
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Comissão por funcionário" subtitle="Quem mais concentra pagamento de comissão no mês.">
          <div className="h-72">
            {commissionByEmployeeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={commissionByEmployeeData}>
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                    }}
                    formatter={(value) => formatCurrency(value)}
                  />
                  <Bar dataKey="valor" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Sem comissões registradas no período.
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Comissões e fechamento"
        subtitle={`Leitura da semana atual (${currentWeekRange.start.format('DD/MM')} – ${currentWeekRange.end.format('DD/MM')}). Comissão válida somente sobre vendas pagas pelo cliente.`}
      >
        <SummaryGrid columns={4}>
          <StatCard label="Semana: comissão consolidada" value={formatCurrency(weeklyClosingSummary.total)} />
          <StatCard label="Semana: já paga ao funcionário" value={formatCurrency(weeklyClosingSummary.paid)} />
          <StatCard label="Semana: em aberto (equipe)" value={formatCurrency(weeklyClosingSummary.open)} />
          <StatCard label="Funcionários pendentes" value={weeklyClosingSummary.pendingCount} hint={weeklyClosingSummary.statusText} />
        </SummaryGrid>
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
          <p className="inline-flex items-center gap-2">
            <Users size={14} className="text-sky-300" />
            <span>Status do fechamento semanal:</span>
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-300">
              {weeklyClosingSummary.statusText}
            </span>
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Atendimentos recentes"
        subtitle="Movimentações mais recentes para acompanhamento rápido da operação."
      >
        <DataTable
          columns={[
            { key: 'data_hora', label: 'Horário/data', render: (row) => formatDateTime(row.data_hora) },
            { key: 'cliente_nome', label: 'Cliente' },
            {
              key: 'pagamento',
              label: 'Pagamento',
              render: (row) => {
                const st = row.venda?.status_pagamento || 'pago'
                const label =
                  st === 'pago'
                    ? 'Pago'
                    : st === 'pendente'
                      ? 'Pendente'
                      : st === 'parcial'
                        ? 'Parcial'
                        : st === 'cancelado'
                          ? 'Cancelado'
                          : st
                return <StatusBadge value={label} />
              },
            },
            {
              key: 'servico',
              label: 'Serviço(s)',
              render: (row) => (
                <div className="space-y-1">
                  {row.servicoResumo?.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20"
                        onClick={() => toggleComboDetails(row.id)}
                      >
                        Combo ({row.servicoResumo.length} serviços)
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
            { key: 'usuario', label: 'Funcionário', render: (row) => row.usuario?.nome || '-' },
            { key: 'valor_servico', label: 'Valor total', render: (row) => formatCurrency(row.valor_servico) },
          ]}
          rows={recentAttendances}
          empty="Nenhuma movimentação recente encontrada."
        />
      </SectionCard>
    </PageFrame>
  )
}
