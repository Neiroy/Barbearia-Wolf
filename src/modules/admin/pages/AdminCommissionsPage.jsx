import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { StatCard } from '../../../components/ui/StatCard'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState } from '../../../components/ui/FeedbackStates'
import { useToast } from '../../../context/ToastContext'
import { useAuth } from '../../../context/AuthContext'
import {
  getCommissionByEmployeeInMonth,
  getCommissionMonthlySummary,
  listCommissionPaymentsHistory,
  listWeeklyClosures,
  updateWeeklyClosureStatus,
} from '../../../services/supabase'
import { getBarberWeekRange } from '../../../utils/dateRanges'
import { formatCurrency } from '../../../utils/formatters'
import { captureAppError } from '../../../lib/observability'

export function AdminCommissionsPage() {
  const { showToast } = useToast()
  const { profile } = useAuth()
  const [month, setMonth] = useState(dayjs().format('YYYY-MM-01'))
  const [monthlySummary, setMonthlySummary] = useState({ gerada: 0, paga: 0, pendente: 0 })
  const [employeeRows, setEmployeeRows] = useState([])
  const [weeklyRows, setWeeklyRows] = useState([])
  const [paymentRows, setPaymentRows] = useState([])
  const [savingId, setSavingId] = useState('')
  const currentWeek = useMemo(() => getBarberWeekRange(), [])

  const pendingCount = useMemo(() => weeklyRows.filter((row) => row.status_pagamento !== 'pago').length, [weeklyRows])

  const reload = useCallback(async () => {
    try {
      const [summary, employees, weekRows, payments] = await Promise.all([
        getCommissionMonthlySummary(month),
        getCommissionByEmployeeInMonth(month),
        listWeeklyClosures(currentWeek.startDate, currentWeek.endDate),
        listCommissionPaymentsHistory(120),
      ])
      setMonthlySummary(summary)
      setEmployeeRows(employees)
      setWeeklyRows(weekRows)
      setPaymentRows(payments)
    } catch (error) {
      captureAppError(error, { source: 'AdminCommissionsPage.reload' })
      showToast({ tone: 'error', title: 'Falha ao carregar comissoes', description: error.message || 'Tente novamente.' })
    }
  }, [currentWeek.endDate, currentWeek.startDate, month, showToast])

  useEffect(() => {
    reload()
  }, [reload])

  async function markAsPaid(closureId) {
    setSavingId(closureId)
    try {
      await updateWeeklyClosureStatus(closureId, 'pago', { userId: profile?.id })
      showToast({ tone: 'success', title: 'Comissao marcada como paga' })
      await reload()
    } catch (error) {
      captureAppError(error, { source: 'AdminCommissionsPage.markAsPaid', closureId })
      showToast({ tone: 'error', title: 'Falha ao marcar pagamento', description: error.message || 'Tente novamente.' })
    } finally {
      setSavingId('')
    }
  }

  return (
    <section className="space-y-5 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Comissões"
        description="Gestao completa da comissao gerada, paga e pendente."
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
        <StatCard label="Comissao gerada no mes" value={formatCurrency(monthlySummary.gerada)} />
        <StatCard label="Comissao paga no mes" value={formatCurrency(monthlySummary.paga)} />
        <StatCard label="Comissao pendente no mes" value={formatCurrency(monthlySummary.pendente)} />
        <StatCard
          label="Pendentes da semana atual"
          value={pendingCount}
          hint={`${dayjs(currentWeek.startDate).format('DD/MM')} ate ${dayjs(currentWeek.endDate).format('DD/MM')}`}
        />
      </SummaryGrid>

      <SectionCard
        title="Fechamento semanal atual"
        subtitle={`Ciclo fixo de comissao (${dayjs(currentWeek.startDate).format('DD/MM')} - ${dayjs(currentWeek.endDate).format('DD/MM')}).`}
      >
        {weeklyRows.length === 0 ? (
          <EmptyState title="Sem fechamento semanal" description="Nao ha comissao semanal registrada para este ciclo." />
        ) : (
          <DataTable
            columns={[
              { key: 'funcionario', label: 'Funcionario', render: (row) => row.usuario?.nome || 'Sem nome' },
              { key: 'total_servicos', label: 'Atendimentos' },
              { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
              { key: 'total_comissao', label: 'Comissao', render: (row) => formatCurrency(row.total_comissao) },
              {
                key: 'status_pagamento',
                label: 'Status',
                render: (row) => (row.status_pagamento === 'pago' ? 'Pago' : 'Pendente'),
              },
              {
                key: 'acao',
                label: 'Acao',
                render: (row) =>
                  row.status_pagamento === 'pago' ? (
                    <span className="text-xs text-slate-500">Pago</span>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={savingId === row.id}
                      onClick={() => markAsPaid(row.id)}
                    >
                      Marcar como pago
                    </button>
                  ),
              },
            ]}
            rows={weeklyRows}
          />
        )}
      </SectionCard>

      <SectionCard title="Comissao por funcionario no mes" subtitle="Separacao de gerada, paga e pendente por colaborador.">
        <DataTable
          columns={[
            { key: 'funcionario', label: 'Funcionario' },
            { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
            { key: 'comissao_gerada', label: 'Gerada', render: (row) => formatCurrency(row.comissao_gerada) },
            { key: 'comissao_paga', label: 'Paga', render: (row) => formatCurrency(row.comissao_paga) },
            { key: 'comissao_pendente', label: 'Pendente', render: (row) => formatCurrency(row.comissao_pendente) },
            {
              key: 'ultimo_pagamento',
              label: 'Ultimo pagamento',
              render: (row) => (row.ultimo_pagamento ? dayjs(row.ultimo_pagamento).format('DD/MM/YYYY') : '-'),
            },
          ]}
          rows={employeeRows}
          empty="Sem comissoes de funcionarios no mes selecionado."
        />
      </SectionCard>

      <SectionCard title="Historico de pagamentos" subtitle="Rastreabilidade de pagamentos marcados no fechamento semanal.">
        <DataTable
          columns={[
            { key: 'funcionario', label: 'Funcionario', render: (row) => row.usuario?.nome || 'Sem nome' },
            {
              key: 'periodo',
              label: 'Periodo pago',
              render: (row) => `${dayjs(row.semana_inicio).format('DD/MM/YYYY')} ate ${dayjs(row.semana_fim).format('DD/MM/YYYY')}`,
            },
            { key: 'valor_pago', label: 'Valor pago', render: (row) => formatCurrency(row.valor_pago) },
            { key: 'pago_em', label: 'Pago em', render: (row) => dayjs(row.pago_em).format('DD/MM/YYYY') },
            { key: 'marcado_por', label: 'Marcado por', render: (row) => row.marcado_por_usuario?.nome || '-' },
            { key: 'status_registro', label: 'Status', render: (row) => (row.status_registro === 'pago' ? 'Pago' : 'Reaberto') },
          ]}
          rows={paymentRows}
          empty="Nenhum pagamento de comissao registrado."
        />
      </SectionCard>
    </section>
  )
}
