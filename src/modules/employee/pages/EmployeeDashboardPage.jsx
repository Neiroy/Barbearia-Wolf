import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarCheck2, DollarSign, Receipt, Scissors, TrendingUp, Wallet } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../../context/AuthContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { PerformanceKpiCard } from '../components/PerformanceKpiCard'
import { QuickActionLinks } from '../components/QuickActionLinks'
import { calculateWeeklySummary, groupAttendancesByCombo, listAttendances } from '../../../services/supabase'
import { formatCurrency, formatDateTime } from '../../../utils/formatters'
import { getBarberWeekRange } from '../../../utils/dateRanges'

export function EmployeeDashboardPage() {
  const { profile } = useAuth()
  const receivesCommission = Boolean(profile?.recebe_comissao)
  const [rows, setRows] = useState([])
  const [expandedCombos, setExpandedCombos] = useState({})

  useEffect(() => {
    if (!profile?.id) return
    listAttendances({ usuarioId: profile.id }).then(setRows)
  }, [profile?.id])

  const weekly = useMemo(() => {
    const weekRange = getBarberWeekRange()
    return calculateWeeklySummary(
      rows.filter((row) => {
        const date = dayjs(row.data_hora)
        return (date.isAfter(weekRange.start) || date.isSame(weekRange.start)) && (date.isBefore(weekRange.end) || date.isSame(weekRange.end))
      }),
    )
  }, [rows])

  const monthRows = useMemo(
    () => rows.filter((row) => dayjs(row.data_hora).isAfter(dayjs().startOf('month'))),
    [rows],
  )
  const groupedMonthRows = useMemo(() => groupAttendancesByCombo(monthRows), [monthRows])
  const monthSummary = useMemo(() => calculateWeeklySummary(monthRows), [monthRows])
  const monthByDayData = useMemo(() => {
    const grouped = groupedMonthRows.reduce((acc, row) => {
      const key = dayjs(row.data_hora).format('DD/MM')
      if (!acc[key]) acc[key] = { dia: key, vendas: 0, comissao: 0, atendimentos: 0 }
      acc[key].vendas += Number(row.valor_servico)
      acc[key].comissao += Number(row.valor_comissao)
      acc[key].atendimentos += 1
      return acc
    }, {})
    return Object.values(grouped).slice(-12)
  }, [groupedMonthRows])

  const weekByDayData = useMemo(() => {
    const weekRange = getBarberWeekRange()
    const weekRows = rows.filter((row) => {
      const date = dayjs(row.data_hora)
      return (date.isAfter(weekRange.start) || date.isSame(weekRange.start)) && (date.isBefore(weekRange.end) || date.isSame(weekRange.end))
    })
    const groupedWeekRows = groupAttendancesByCombo(weekRows)
    const grouped = groupedWeekRows.reduce((acc, row) => {
      const key = dayjs(row.data_hora).format('ddd')
      if (!acc[key]) acc[key] = { dia: key, atendimentos: 0, vendas: 0 }
      acc[key].atendimentos += 1
      acc[key].vendas += Number(row.valor_servico)
      return acc
    }, {})
    return Object.values(grouped)
  }, [rows])

  const quickActions = [
    { label: 'Novo atendimento', to: '/funcionario/novo-atendimento', icon: CalendarCheck2 },
    { label: 'Ver meus atendimentos', to: '/funcionario/meus-atendimentos', icon: Receipt },
    { label: 'Resumo semanal', to: '/funcionario/resumo-semanal', icon: TrendingUp },
  ]

  const currentPeriod = `${dayjs().startOf('month').format('DD/MM')} - ${dayjs().format('DD/MM')}`
  const recentGroupedAttendances = useMemo(() => {
    const groups = rows.reduce((acc, row) => {
      const comboKey =
        row.venda_id ||
        `${row.usuario_id}|${(row.cliente_nome || '').trim().toLowerCase()}|${dayjs(row.data_hora).format('YYYY-MM-DD HH:mm')}`

      if (!acc[comboKey]) {
        acc[comboKey] = {
          id: comboKey,
          cliente_nome: row.cliente_nome,
          data_hora: row.data_hora,
          valor_servico: 0,
          servicos: [],
        }
      }

      acc[comboKey].valor_servico += Number(row.valor_servico || 0)
      acc[comboKey].servicos.push({
        nome: row.servico?.nome || '-',
        valor: Number(row.valor_servico || 0),
      })

      return acc
    }, {})

    return Object.values(groups).slice(0, 5)
  }, [rows])

  function toggleComboDetails(comboId) {
    setExpandedCombos((old) => ({
      ...old,
      [comboId]: !old[comboId],
    }))
  }

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Funcionario"
        title="Meu desempenho"
        description={`Resumo rapido da sua performance. Periodo atual: ${currentPeriod}`}
        actions={<QuickActionLinks actions={quickActions} />}
      />

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <PerformanceKpiCard
          title="Atendimentos na semana"
          value={weekly.totalServicos}
          subtitle="Quantidade de servicos finalizados"
          icon={<Scissors size={18} />}
        />
        <PerformanceKpiCard
          title="Valor vendido na semana"
          value={formatCurrency(weekly.totalVendido)}
          subtitle="Receita gerada na semana atual"
          icon={<DollarSign size={18} />}
        />
        <PerformanceKpiCard
          title={receivesCommission ? 'Comissao da semana' : 'Comissao da semana (nao aplicavel)'}
          value={formatCurrency(weekly.totalComissao)}
          subtitle={receivesCommission ? 'Acumulado de comissao semanal' : 'Perfil sem recebimento de comissao'}
          icon={<Wallet size={18} />}
        />
        <PerformanceKpiCard
          title={receivesCommission ? 'Comissao do mes' : 'Comissao do mes (nao aplicavel)'}
          value={formatCurrency(monthSummary.totalComissao)}
          subtitle={receivesCommission ? 'Total de comissao no periodo mensal' : 'Perfil sem recebimento de comissao'}
          icon={<TrendingUp size={18} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Visao semanal" subtitle="Panorama da sua produtividade na semana atual.">
          <SummaryGrid columns={3}>
            <StatCard label="Atendimentos na semana" value={weekly.totalServicos} />
            <StatCard label="Valor vendido na semana" value={formatCurrency(weekly.totalVendido)} />
            <StatCard
              label={receivesCommission ? 'Comissao acumulada' : 'Comissao (nao aplicavel)'}
              value={formatCurrency(weekly.totalComissao)}
            />
          </SummaryGrid>
        </SectionCard>

        <SectionCard title="Visao mensal" subtitle="Consolidado de desempenho no mes corrente.">
          <SummaryGrid columns={3}>
            <StatCard label="Atendimentos no mes" value={monthSummary.totalServicos} />
            <StatCard label="Total vendido no mes" value={formatCurrency(monthSummary.totalVendido)} />
            <StatCard
              label={receivesCommission ? 'Comissao do mes' : 'Comissao do mes (nao aplicavel)'}
              value={formatCurrency(monthSummary.totalComissao)}
            />
          </SummaryGrid>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Atendimentos por dia da semana" subtitle="Leitura rapida da sua frequencia semanal.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weekByDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="dia" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                  }}
                />
                <Area type="monotone" dataKey="atendimentos" stroke="#0ea5e9" fill="rgba(56,189,248,0.18)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Evolucao de vendas e comissao" subtitle="Comparativo diario no mes atual.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthByDayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="dia" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                  }}
                />
                <Area type="monotone" dataKey="vendas" stroke="#38bdf8" fill="rgba(56,189,248,0.12)" />
                <Area type="monotone" dataKey="comissao" stroke="#0ea5e9" fill="rgba(56,189,248,0.12)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Historico recente"
        subtitle="Seus atendimentos mais recentes para acompanhamento rapido."
      >
        <div className="space-y-3">
          {recentGroupedAttendances.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 transition hover:border-sky-500/30"
            >
              <div>
                <p className="text-sm font-semibold text-slate-100">{row.cliente_nome}</p>
                {row.servicos.length > 1 ? (
                  <div className="mt-1 space-y-1">
                    <button
                      type="button"
                      className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20"
                      onClick={() => toggleComboDetails(row.id)}
                    >
                      Combo ({row.servicos.length} servicos)
                    </button>
                    {expandedCombos[row.id] ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-[11px] text-slate-200">
                        {row.servicos.map((service, index) => (
                          <p
                            key={`${row.id}-${service.nome}-${index}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <span>{service.nome}</span>
                            <span className="font-semibold text-sky-300">
                              {formatCurrency(service.valor)}
                            </span>
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <span className="mt-1 inline-flex rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1 text-xs text-slate-300">
                    {row.servicos[0]?.nome || '-'}
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-base font-semibold text-sky-300">{formatCurrency(row.valor_servico)}</p>
                <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(row.data_hora)}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </section>
  )
}
