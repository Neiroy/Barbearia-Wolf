import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarRange, CalendarSearch, DollarSign, Receipt, Scissors, TrendingUp, Wallet } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../../context/AuthContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { PerformanceKpiCard } from '../components/PerformanceKpiCard'
import { QuickActionLinks } from '../components/QuickActionLinks'
import { calculateWeeklySummary, groupAttendancesByCombo, listAttendances } from '../../../services/supabase'
import { formatCurrency } from '../../../utils/formatters'

export function EmployeeWeeklySummaryPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!profile?.id) return
    listAttendances({
      usuarioId: profile.id,
      startDate: dayjs().startOf('week').format('YYYY-MM-DD'),
      endDate: dayjs().endOf('week').format('YYYY-MM-DD'),
    }).then(setRows)
  }, [profile?.id])

  const totals = useMemo(() => calculateWeeklySummary(rows), [rows])
  const groupedRows = useMemo(() => groupAttendancesByCombo(rows), [rows])
  const weekRange = `${dayjs().startOf('week').format('DD/MM')} - ${dayjs().endOf('week').format('DD/MM')}`
  const ticketMedio = totals.totalServicos ? totals.totalVendido / totals.totalServicos : 0
  const topService = useMemo(() => {
    const grouped = rows.reduce((acc, row) => {
      const key = row.servico?.nome || 'Nao informado'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return Object.entries(grouped).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sem dados'
  }, [rows])

  const weekByDayData = useMemo(() => {
    const grouped = groupedRows.reduce((acc, row) => {
      const key = dayjs(row.data_hora).format('ddd')
      if (!acc[key]) acc[key] = { dia: key, atendimentos: 0, vendas: 0, comissao: 0 }
      acc[key].atendimentos += 1
      acc[key].vendas += Number(row.valor_servico)
      acc[key].comissao += Number(row.valor_comissao)
      return acc
    }, {})
    return Object.values(grouped)
  }, [groupedRows])

  const quickActions = [
    { label: 'Ver meus atendimentos', to: '/funcionario/meus-atendimentos', icon: Receipt },
    { label: 'Novo atendimento', to: '/funcionario/novo-atendimento', icon: CalendarSearch },
  ]

  const insight =
    totals.totalServicos === 0
      ? 'Nenhum atendimento registrado nesta semana. Registre os atendimentos para acompanhar seu desempenho.'
      : totals.totalComissao >= totals.totalVendido * 0.35
        ? 'Semana forte: sua comissao acompanha bem o volume vendido. Continue mantendo o ritmo.'
        : 'Boa semana de operacao. Foque em servicos de maior ticket para elevar a comissao.'

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Funcionario"
        title="Resumo semanal"
        description={`Acompanhe sua semana com clareza e foco em produtividade. Periodo: ${weekRange}`}
        actions={<QuickActionLinks actions={quickActions} />}
      />

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <PerformanceKpiCard
          title="Atendimentos da semana"
          value={totals.totalServicos}
          subtitle="Servicos concluidos no periodo"
          icon={<Scissors size={18} />}
        />
        <PerformanceKpiCard
          title="Total vendido"
          value={formatCurrency(totals.totalVendido)}
          subtitle="Receita gerada nesta semana"
          icon={<DollarSign size={18} />}
        />
        <PerformanceKpiCard
          title="Comissao total"
          value={formatCurrency(totals.totalComissao)}
          subtitle="Acumulado de comissao semanal"
          icon={<Wallet size={18} />}
        />
        <PerformanceKpiCard
          title="Ticket medio"
          value={formatCurrency(ticketMedio)}
          subtitle="Media por atendimento realizado"
          icon={<TrendingUp size={18} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Evolucao semanal" subtitle="Visualize sua performance por dia da semana.">
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
                <Area type="monotone" dataKey="vendas" stroke="#38bdf8" fill="rgba(56,189,248,0.14)" />
                <Area type="monotone" dataKey="comissao" stroke="#0ea5e9" fill="rgba(56,189,248,0.12)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Visao da semana" subtitle="Resumo estrategico para acompanhamento rapido.">
          <SummaryGrid columns={3}>
            <StatCard label="Atendimentos" value={totals.totalServicos} />
            <StatCard label="Total vendido" value={formatCurrency(totals.totalVendido)} />
            <StatCard label="Comissao" value={formatCurrency(totals.totalComissao)} />
          </SummaryGrid>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <CalendarRange size={13} />
                Periodo analisado
              </p>
              <p className="mt-1 text-sm font-medium text-slate-100">{weekRange}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Servico mais realizado</p>
              <p className="mt-1 text-sm font-medium text-slate-100">{topService}</p>
            </div>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
              <p className="text-xs uppercase tracking-wide text-sky-300">Resumo do periodo</p>
              <p className="mt-1 text-sm text-slate-200">{insight}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Observacoes da semana" subtitle="Leitura final da sua performance no periodo atual.">
        <p className="text-sm text-slate-300">
          Este resumo considera os atendimentos da semana atual respeitando seu perfil de acesso.
          Mantenha os lancamentos em dia para ter uma visao precisa de produtividade e comissao.
        </p>
      </SectionCard>
    </section>
  )
}
