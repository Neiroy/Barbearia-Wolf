import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { DataTable } from '../../../components/ui/DataTable'
import { listCommissionPaymentsHistory, listMonthlyClosuresHistory, listWeeklyClosuresHistory } from '../../../services/supabase'
import { formatCurrency } from '../../../utils/formatters'
import { captureAppError } from '../../../lib/observability'
import { useToast } from '../../../context/ToastContext'

export function AdminHistoriesPage() {
  const { showToast } = useToast()
  const [weeklyRows, setWeeklyRows] = useState([])
  const [monthlyRows, setMonthlyRows] = useState([])
  const [paymentRows, setPaymentRows] = useState([])

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const [weekly, monthly, payments] = await Promise.all([
          listWeeklyClosuresHistory(120),
          listMonthlyClosuresHistory(36),
          listCommissionPaymentsHistory(180),
        ])
        if (!mounted) return
        setWeeklyRows(weekly)
        setMonthlyRows(monthly)
        setPaymentRows(payments)
      } catch (error) {
        captureAppError(error, { source: 'AdminHistoriesPage.load' })
        showToast({ tone: 'error', title: 'Falha ao carregar historicos', description: error.message || 'Tente novamente.' })
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [showToast])

  return (
    <section className="space-y-5 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Historicos"
        description="Visao unificada de fechamentos semanais, mensais e pagamentos de comissao."
      />

      <SectionCard title="Historico semanal congelado" subtitle="Fechamentos semanais salvos no momento do pagamento.">
        <DataTable
          columns={[
            { key: 'funcionario', label: 'Funcionario', render: (row) => row.usuario?.nome || 'Sem nome' },
            {
              key: 'periodo',
              label: 'Periodo',
              render: (row) => `${dayjs(row.semana_inicio).format('DD/MM/YYYY')} ate ${dayjs(row.semana_fim).format('DD/MM/YYYY')}`,
            },
            { key: 'total_servicos', label: 'Atendimentos' },
            { key: 'total_vendido', label: 'Realizado', render: (row) => formatCurrency(row.total_vendido) },
            {
              key: 'total_recebido',
              label: 'Recebido',
              render: (row) => formatCurrency(row.total_recebido ?? 0),
            },
            {
              key: 'total_pendente',
              label: 'Pendente',
              render: (row) => formatCurrency(row.total_pendente ?? 0),
            },
            { key: 'total_comissao', label: 'Comissao valida', render: (row) => formatCurrency(row.total_comissao) },
            { key: 'pago_em', label: 'Pago em', render: (row) => (row.pago_em ? dayjs(row.pago_em).format('DD/MM/YYYY') : '-') },
            { key: 'status_pagamento', label: 'Status', render: (row) => (row.status_pagamento === 'pago' ? 'Pago' : 'Pendente') },
          ]}
          rows={weeklyRows}
          empty="Nenhum historico semanal encontrado."
        />
      </SectionCard>

      <SectionCard title="Historico mensal congelado" subtitle="Snapshots financeiros fechados por mes.">
        <DataTable
          columns={[
            { key: 'referencia_mes', label: 'Mes/ano', render: (row) => dayjs(row.referencia_mes).format('MM/YYYY') },
            { key: 'total_entradas', label: 'Realizado', render: (row) => formatCurrency(row.total_entradas) },
            {
              key: 'total_recebido',
              label: 'Recebido',
              render: (row) => formatCurrency(row.total_recebido != null ? row.total_recebido : row.total_entradas),
            },
            { key: 'total_pendente', label: 'Pendente', render: (row) => formatCurrency(row.total_pendente ?? 0) },
            { key: 'faturamento_equipe', label: 'Equipe', render: (row) => formatCurrency(row.faturamento_equipe || 0) },
            { key: 'faturamento_admin', label: 'Admin/Dono', render: (row) => formatCurrency(row.faturamento_admin || 0) },
            { key: 'total_gastos', label: 'Gastos', render: (row) => formatCurrency(row.total_gastos) },
            { key: 'comissao_paga', label: 'Comissao paga', render: (row) => formatCurrency(row.comissao_paga || 0) },
            { key: 'comissao_pendente', label: 'Comissao pendente', render: (row) => formatCurrency(row.comissao_pendente || 0) },
            { key: 'lucro_liquido', label: 'Lucro liquido', render: (row) => formatCurrency(row.lucro_liquido) },
          ]}
          rows={monthlyRows}
          empty="Nenhum historico mensal encontrado."
        />
      </SectionCard>

      <SectionCard title="Historico de pagamentos de comissao" subtitle="Rastreabilidade de quem marcou pagamento e quando.">
        <DataTable
          columns={[
            { key: 'funcionario', label: 'Funcionario', render: (row) => row.usuario?.nome || 'Sem nome' },
            { key: 'periodo', label: 'Periodo pago', render: (row) => `${dayjs(row.semana_inicio).format('DD/MM/YYYY')} ate ${dayjs(row.semana_fim).format('DD/MM/YYYY')}` },
            {
              key: 'snapshot',
              label: 'Snapshot semana',
              render: (row) => (
                <span className="text-xs text-slate-400">
                  R {formatCurrency(row.snapshot_total_realizado ?? 0)} /{' '}
                  {formatCurrency(row.snapshot_total_recebido ?? 0)} / P {formatCurrency(row.snapshot_total_pendente ?? 0)}
                </span>
              ),
            },
            { key: 'valor_pago', label: 'Comissao paga', render: (row) => formatCurrency(row.valor_pago) },
            { key: 'pago_em', label: 'Data do pagamento', render: (row) => dayjs(row.pago_em).format('DD/MM/YYYY') },
            { key: 'marcado_por', label: 'Marcado por', render: (row) => row.marcado_por_usuario?.nome || '-' },
            { key: 'status_registro', label: 'Status', render: (row) => (row.status_registro === 'pago' ? 'Pago' : 'Reaberto') },
          ]}
          rows={paymentRows}
          empty="Nenhum pagamento registrado."
        />
      </SectionCard>
    </section>
  )
}
