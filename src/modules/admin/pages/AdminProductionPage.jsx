import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
        showToast({ tone: 'error', title: 'Falha ao carregar producao', description: error.message || 'Tente novamente.' })
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
      const key = row.servico?.nome || 'Sem servico'
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
    <section className="space-y-5 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Producao"
        description="Separacao operacional da producao da equipe e do admin/dono."
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
        <StatCard label="Producao da equipe" value={formatCurrency(summary.team)} />
        <StatCard label="Producao do admin/dono" value={formatCurrency(summary.owner)} />
        <StatCard
          label="Atendimentos no mes (por servico individual)"
          value={summary.totalAttendances}
          hint="Cada servico registrado conta como 1 atendimento"
        />
      </SummaryGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Composicao da producao" subtitle="Comparativo entre equipe e admin/dono no periodo.">
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

        <SectionCard title="Ranking de funcionarios" subtitle="Desempenho por total vendido no mes.">
          <DataTable
            columns={[
              { key: 'funcionario', label: 'Funcionario' },
              { key: 'tipo', label: 'Tipo' },
              { key: 'atendimentos', label: 'Atendimentos' },
              { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
            ]}
            rows={rankingRows}
            empty="Sem dados de producao no periodo."
          />
        </SectionCard>
      </div>

      <SectionCard title="Servicos mais realizados" subtitle="Leitura de volume e receita por servico.">
        {serviceRows.length === 0 ? (
          <EmptyState title="Sem servicos no periodo" description="Nenhum atendimento registrado para o mes selecionado." />
        ) : (
          <DataTable
            columns={[
              { key: 'servico', label: 'Servico' },
              { key: 'quantidade', label: 'Quantidade' },
              { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
            ]}
            rows={serviceRows}
          />
        )}
      </SectionCard>
    </section>
  )
}
