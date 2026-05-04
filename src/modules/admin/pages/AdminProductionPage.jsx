import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PageFrame } from '../../../components/ui/PageFrame'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { StatCard } from '../../../components/ui/StatCard'
import { SectionCard } from '../../../components/ui/SectionCard'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState } from '../../../components/ui/FeedbackStates'
import { listAttendances } from '../../../services/supabase'
import { formatCurrency } from '../../../utils/formatters'
import { captureAppError } from '../../../lib/observability'
import { useToast } from '../../../context/ToastContext'

export function AdminProductionPage() {
  const { showToast } = useToast()
  const [month, setMonth] = useState(dayjs().format('YYYY-MM-01'))
  const [attendances, setAttendances] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const startDate = dayjs(month).startOf('month').format('YYYY-MM-DD')
        const endDate = dayjs(month).endOf('month').format('YYYY-MM-DD')
        const rows = await listAttendances({ startDate, endDate })
        setAttendances(rows)
      } catch (error) {
        captureAppError(error, { source: 'AdminProductionPage.load' })
        showToast({ tone: 'error', title: 'Falha ao carregar produção', description: error.message || 'Tente novamente.' })
      }
    }

    load()
  }, [month, showToast])

  const summary = useMemo(() => {
    const total = attendances.reduce((sum, row) => sum + Number(row.valor_servico || 0), 0)
    const team = attendances.reduce(
      (sum, row) => (row.usuario?.recebe_comissao ? sum + Number(row.valor_servico || 0) : sum),
      0,
    )
    const owner = attendances.reduce(
      (sum, row) => (!row.usuario?.recebe_comissao ? sum + Number(row.valor_servico || 0) : sum),
      0,
    )
    return { total, team, owner, totalAttendances: attendances.length }
  }, [attendances])

  const rankingRows = useMemo(() => {
    const grouped = attendances.reduce((acc, row) => {
      const key = row.usuario_id || 'sem-usuario'
      if (!acc[key]) {
        acc[key] = {
          usuario_id: key,
          funcionario: row.usuario?.nome || 'Sem nome',
          total_vendido: 0,
          atendimentos: 0,
          tipo: row.usuario?.recebe_comissao ? 'Equipe' : 'Admin/Dono',
        }
      }
      acc[key].total_vendido += Number(row.valor_servico || 0)
      acc[key].atendimentos += 1
      return acc
    }, {})
    return Object.values(grouped).sort((a, b) => b.total_vendido - a.total_vendido)
  }, [attendances])

  const serviceRows = useMemo(() => {
    const grouped = attendances.reduce((acc, row) => {
      const key = row.servico?.nome || 'Sem serviço'
      if (!acc[key]) {
        acc[key] = { servico: key, quantidade: 0, total_vendido: 0 }
      }
      acc[key].quantidade += 1
      acc[key].total_vendido += Number(row.valor_servico || 0)
      return acc
    }, {})
    return Object.values(grouped).sort((a, b) => b.quantidade - a.quantidade).slice(0, 12)
  }, [attendances])

  const chartData = useMemo(
    () => [
      { origem: 'Equipe', valor: summary.team },
      { origem: 'Admin/Dono', valor: summary.owner },
    ],
    [summary.owner, summary.team],
  )

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Admin"
        title="Produção"
        description="Separação operacional da produção da equipe e do admin/dono."
        actions={
          <input
            type="month"
            className="input w-full sm:w-44"
            value={dayjs(month).format('YYYY-MM')}
            onChange={(event) => setMonth(`${event.target.value}-01`)}
          />
        }
      />

      <SummaryGrid columns={4}>
        <StatCard label="Faturamento total" value={formatCurrency(summary.total)} />
        <StatCard label="Produção da equipe" value={formatCurrency(summary.team)} />
        <StatCard label="Produção do admin/dono" value={formatCurrency(summary.owner)} />
        <StatCard
          label="Atendimentos no mês (por serviço individual)"
          value={summary.totalAttendances}
          hint="Cada serviço registrado conta como 1 atendimento"
        />
      </SummaryGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Composição da produção" subtitle="Comparativo entre equipe e admin/dono no período.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="origem" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                  }}
                  formatter={(value) => formatCurrency(value)}
                />
                <Bar dataKey="valor" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Ranking de funcionários" subtitle="Desempenho por total vendido no mês.">
          <DataTable
            columns={[
              { key: 'funcionario', label: 'Funcionário' },
              { key: 'tipo', label: 'Tipo' },
              { key: 'atendimentos', label: 'Atendimentos' },
              { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
            ]}
            rows={rankingRows}
            empty="Sem dados de produção no período."
          />
        </SectionCard>
      </div>

      <SectionCard title="Serviços mais realizados" subtitle="Leitura de volume e receita por serviço.">
        {serviceRows.length === 0 ? (
          <EmptyState title="Sem serviços no período" description="Nenhum atendimento registrado para o mês selecionado." />
        ) : (
          <DataTable
            columns={[
              { key: 'servico', label: 'Serviço' },
              { key: 'quantidade', label: 'Quantidade' },
              { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
            ]}
            rows={serviceRows}
          />
        )}
      </SectionCard>
    </PageFrame>
  )
}
