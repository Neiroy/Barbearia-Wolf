import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, Download, Filter, Search, SlidersHorizontal, UserRound, Wallet } from 'lucide-react'
import { DataTable } from '../../../components/ui/DataTable'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import {
  groupAttendancesByCombo,
  listAttendances,
  settlePastWeeklyClosures,
  listWeeklyClosures,
  listWeeklyClosuresHistory,
  updateWeeklyClosureStatus,
} from '../../../services/supabase'
import { formatCurrency } from '../../../utils/formatters'
import { Link } from 'react-router-dom'
import { useToast } from '../../../context/ToastContext'
import { captureAppError } from '../../../lib/observability'
import { useAuth } from '../../../context/AuthContext'
import { getBarberWeekRange } from '../../../utils/dateRanges'
import { supabase } from '../../../lib/supabase'

export function AdminWeeklyReportsPage() {
  const currentBarberWeek = getBarberWeekRange()
  const [rows, setRows] = useState([])
  const [historyRows, setHistoryRows] = useState([])
  const [ownerProductionRows, setOwnerProductionRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [targetToPay, setTargetToPay] = useState(null)
  const [bulkPayConfirmOpen, setBulkPayConfirmOpen] = useState(false)
  const [weekStart, setWeekStart] = useState(currentBarberWeek.startDate)
  const [weekEnd, setWeekEnd] = useState(currentBarberWeek.endDate)
  const [weekReferenceDate, setWeekReferenceDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const { showToast } = useToast()
  const { profile } = useAuth()

  const loadWeeklyClosures = useCallback(async () => {
    setLoading(true)
    try {
      const safeRange = getBarberWeekRange(weekReferenceDate || weekStart)
      const safeStart = safeRange.startDate
      const safeEnd = safeRange.endDate
      if (safeStart !== weekStart) setWeekStart(safeStart)
      if (safeEnd !== weekEnd) setWeekEnd(safeEnd)

      const currentWeekStart = getBarberWeekRange().startDate
      await settlePastWeeklyClosures(currentWeekStart, profile?.id)

      const [closureRows, attendances, closureHistory] = await Promise.all([
        listWeeklyClosures(safeStart, safeEnd),
        listAttendances({ startDate: safeStart, endDate: safeEnd }),
        listWeeklyClosuresHistory(80),
      ])
      const groupedByCombo = groupAttendancesByCombo(attendances)
      const ownerGroups = groupedByCombo
        .map((group) => {
          const source = attendances.find((row) => row.venda_id === group.venda_id) || null
          return { ...group, funcionario: source?.usuario?.nome || 'Sem nome', recebeComissao: Boolean(source?.usuario?.recebe_comissao) }
        })
        .filter((row) => !row.recebeComissao)
        .sort((a, b) => Number(b.valor_servico) - Number(a.valor_servico))
      setRows(closureRows)
      setOwnerProductionRows(ownerGroups)
      setHistoryRows(closureHistory)
      setLastSyncAt(new Date())
    } catch (error) {
      captureAppError(error, {
        source: 'AdminWeeklyReportsPage.loadWeeklyClosures',
        weekStart: getBarberWeekRange(weekReferenceDate || weekStart).startDate,
        weekEnd: getBarberWeekRange(weekReferenceDate || weekStart).endDate,
      })
      showToast({
        tone: 'error',
        title: 'Falha ao carregar fechamento',
        description: error?.message || 'Nao foi possivel carregar o fechamento semanal.',
      })
    } finally {
      setLoading(false)
    }
  }, [profile?.id, showToast, weekReferenceDate, weekStart, weekEnd])

  useEffect(() => {
    loadWeeklyClosures()
  }, [loadWeeklyClosures])

  useEffect(() => {
    let refreshTimeoutId = null
    const scheduleReload = () => {
      if (refreshTimeoutId) window.clearTimeout(refreshTimeoutId)
      refreshTimeoutId = window.setTimeout(() => loadWeeklyClosures(), 300)
    }

    const channel = supabase
      .channel(`admin-weekly-live-${weekStart}-${weekEnd}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fechamentos_semanais' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, scheduleReload)
      .subscribe()

    return () => {
      if (refreshTimeoutId) window.clearTimeout(refreshTimeoutId)
      supabase.removeChannel(channel)
    }
  }, [loadWeeklyClosures, weekEnd, weekStart])

  const grouped = useMemo(() => {
    return rows.map((row) => ({
      id: row.id,
      funcionario: row.usuario?.nome || 'Sem nome',
      tipoRemuneracao: row.usuario?.tipo_remuneracao || 'nao_informado',
      participaFechamentoComissao: Boolean(row.usuario?.participa_fechamento_comissao),
      totalServicos: Number(row.total_servicos || 0),
      totalVendido: Number(row.total_vendido || 0),
      totalComissao: Number(row.total_comissao || 0),
      status: row.status_pagamento || 'aberto',
      usuarioId: row.usuario_id,
    }))
  }, [rows])

  const employees = useMemo(
    () => Array.from(new Set(grouped.map((row) => row.funcionario))).filter(Boolean),
    [grouped],
  )

  const filteredRows = useMemo(() => {
    let list = grouped.filter((row) => row.funcionario.toLowerCase().includes(search.trim().toLowerCase()))
    if (employeeFilter !== 'all') list = list.filter((row) => row.funcionario === employeeFilter)
    if (statusFilter !== 'all') list = list.filter((row) => row.status === statusFilter)
    return list.sort((a, b) => b.totalVendido - a.totalVendido)
  }, [grouped, search, employeeFilter, statusFilter])

  const totals = useMemo(() => {
    const totalFuncionarios = filteredRows.length
    const totalAtendimentos = filteredRows.reduce((sum, row) => sum + Number(row.totalServicos), 0)
    const totalVendido = filteredRows.reduce((sum, row) => sum + Number(row.totalVendido), 0)
    const totalComissao = filteredRows.reduce((sum, row) => sum + Number(row.totalComissao), 0)
    const ticketMedio = totalAtendimentos ? totalVendido / totalAtendimentos : 0
    const totalPago = filteredRows
      .filter((row) => row.status === 'pago')
      .reduce((sum, row) => sum + Number(row.totalComissao), 0)
    const totalPendente = totalComissao - totalPago
    return {
      totalFuncionarios,
      totalAtendimentos,
      totalVendido,
      totalComissao,
      ticketMedio,
      totalPago,
      totalPendente,
    }
  }, [filteredRows])
  const ownerTotals = useMemo(() => {
    const totalAtendimentos = ownerProductionRows.length
    const totalVendido = ownerProductionRows.reduce((sum, row) => sum + Number(row.valor_servico || 0), 0)
    return { totalAtendimentos, totalVendido }
  }, [ownerProductionRows])

  const destaque = filteredRows[0]?.funcionario || 'Sem dados'

  function openNativeDatePicker(event) {
    if (typeof event.currentTarget.showPicker === 'function') {
      event.currentTarget.showPicker()
    }
  }

  function clearFilters() {
    setSearch('')
    setEmployeeFilter('all')
    setStatusFilter('all')
    const range = getBarberWeekRange()
    setWeekReferenceDate(dayjs().format('YYYY-MM-DD'))
    setWeekStart(range.startDate)
    setWeekEnd(range.endDate)
  }

  function applyBarberWeekByReferenceDate(value) {
    const range = getBarberWeekRange(value)
    setWeekReferenceDate(dayjs(value).format('YYYY-MM-DD'))
    setWeekStart(range.startDate)
    setWeekEnd(range.endDate)
  }

  function exportCsv() {
    const header = [
      'Funcionario',
      'Tipo remuneracao',
      'Participa fechamento comissao',
      'Atendimentos',
      'Total vendido',
      'Comissao',
      'Status',
    ]
    const lines = filteredRows.map((row) => [
      row.funcionario,
      row.tipoRemuneracao,
      row.participaFechamentoComissao ? 'sim' : 'nao',
      row.totalServicos,
      Number(row.totalVendido || 0).toFixed(2),
      Number(row.totalComissao || 0).toFixed(2),
      row.status,
    ])
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fechamento_semanal_${dayjs().format('YYYY-MM-DD')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function markEmployeeAsPaid(row) {
    setSaving(true)
    try {
      await updateWeeklyClosureStatus(row.id, 'pago', { userId: profile?.id })
      await loadWeeklyClosures()
      showToast({
        tone: 'success',
        title: 'Pagamento atualizado',
        description: `Fechamento de ${row.funcionario} marcado como pago.`,
      })
    } catch (error) {
      captureAppError(error, {
        source: 'AdminWeeklyReportsPage.markEmployeeAsPaid',
        closureId: row?.id,
      })
      showToast({
        tone: 'error',
        title: 'Falha ao atualizar pagamento',
        description: `Nao foi possivel atualizar o pagamento de ${row.funcionario}.`,
      })
    } finally {
      setSaving(false)
    }
  }

  async function markVisibleRowsAsPaid() {
    const pendingRows = filteredRows.filter((row) => row.status !== 'pago')
    if (!pendingRows.length) {
      showToast({
        tone: 'info',
        title: 'Sem pendencias',
        description: 'Nao ha funcionarios pendentes nos filtros atuais.',
      })
      setBulkPayConfirmOpen(false)
      return
    }

    setSaving(true)
    try {
      await Promise.all(pendingRows.map((row) => updateWeeklyClosureStatus(row.id, 'pago', { userId: profile?.id })))
      await loadWeeklyClosures()
      showToast({
        tone: 'success',
        title: 'Semana marcada como paga',
        description: 'Pagamento atualizado para os funcionarios pendentes filtrados.',
      })
    } catch (error) {
      captureAppError(error, {
        source: 'AdminWeeklyReportsPage.markVisibleRowsAsPaid',
        pendingRows: pendingRows.length,
      })
      showToast({
        tone: 'error',
        title: 'Falha ao marcar semana como paga',
      })
    } finally {
      setSaving(false)
      setBulkPayConfirmOpen(false)
    }
  }

  if (loading) return <LoadingState label="Carregando fechamento semanal..." />

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Fechamento semanal"
        description={`Consolidado semanal para conferencia e pagamento de comissoes (${dayjs(weekStart).format('DD/MM')} - ${dayjs(weekEnd).format('DD/MM')}).`}
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
            <span className="inline-flex items-center rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
              {lastSyncAt ? `Sincronizado ${dayjs(lastSyncAt).format('HH:mm:ss')}` : 'Sincronizando...'}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              <Download size={13} />
              Exportar fechamento
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              Limpar filtros
            </button>
            <Link
              to="/admin/atendimentos"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              Ver atendimentos da semana
            </Link>
            <button
              type="button"
              onClick={() => setBulkPayConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 transition hover:border-emerald-400/50 hover:bg-emerald-500/15"
            >
              Marcar semana como paga
            </button>
          </div>
        }
      />

      <SummaryGrid columns={5}>
        <StatCard label="Total vendido" value={formatCurrency(totals.totalVendido)} hint="Receita da semana filtrada" />
        <StatCard label="Total de comissoes" value={formatCurrency(totals.totalComissao)} hint="Comissao consolidada" />
        <StatCard label="Total atendimentos" value={totals.totalAtendimentos} hint="Servicos realizados" />
        <StatCard label="Funcionarios no fechamento" value={totals.totalFuncionarios} hint="Equipe com movimento" />
        <StatCard label="Ticket medio semanal" value={formatCurrency(totals.ticketMedio)} hint="Media por atendimento" />
      </SummaryGrid>

      <SummaryGrid columns={2}>
        <StatCard
          label="Producao dono/admin (atendimentos)"
          value={ownerTotals.totalAtendimentos}
          hint="Nao participa de fechamento de comissao"
        />
        <StatCard
          label="Producao dono/admin (faturamento)"
          value={formatCurrency(ownerTotals.totalVendido)}
          hint="Receita operacional sem custo de comissao"
        />
      </SummaryGrid>

      <Toolbar>
        <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-11"
              placeholder="Buscar funcionario"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <input
            type="date"
            className="input"
            value={weekReferenceDate}
            onFocus={openNativeDatePicker}
            onClick={openNativeDatePicker}
            onChange={(event) => applyBarberWeekByReferenceDate(event.target.value)}
          />
          <input
            type="date"
            className="input"
            value={weekEnd}
            disabled
            readOnly
          />
          <label className="relative">
            <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              className="input appearance-none !pl-11 !pr-10"
              value={employeeFilter}
              onChange={(event) => setEmployeeFilter(event.target.value)}
            >
              <option value="all">Todos funcionarios</option>
              {employees.map((employee) => (
                <option key={employee} value={employee}>
                  {employee}
                </option>
              ))}
            </select>
          </label>
          <label className="relative">
            <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              className="input appearance-none !pl-11 !pr-10"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">Todos status</option>
              <option value="aberto">Aberto</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
            </select>
          </label>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
            <Filter size={13} />
            Semana fixa (terca a sabado)
          </div>
        </div>
      </Toolbar>

      <SectionCard
        title="Resumo da semana atual"
        subtitle="Consolidacao gerencial semanal para conferencias e pagamentos (ciclo fixo: terca a sabado)."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Periodo</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{dayjs(weekStart).format('DD/MM')} - {dayjs(weekEnd).format('DD/MM')}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Funcionario destaque</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{destaque}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-300">Total ja pago</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">{formatCurrency(totals.totalPago)}</p>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-sky-300">Total pendente</p>
            <p className="mt-1 text-sm font-semibold text-sky-300">{formatCurrency(totals.totalPendente)}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Historico semanal congelado"
        subtitle="Fechamentos anteriores com snapshot salvo no momento do pagamento."
      >
        {historyRows.length === 0 ? (
          <EmptyState
            title="Sem historico semanal"
            description="Os fechamentos gerados aparecerao aqui para consulta."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'usuario', label: 'Funcionario', render: (row) => row.usuario?.nome || 'Sem nome' },
              {
                key: 'periodo',
                label: 'Periodo',
                render: (row) =>
                  `${dayjs(row.semana_inicio).format('DD/MM/YYYY')} ate ${dayjs(row.semana_fim).format('DD/MM/YYYY')}`,
              },
              { key: 'total_servicos', label: 'Atendimentos' },
              { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
              { key: 'total_comissao', label: 'Comissao', render: (row) => formatCurrency(row.total_comissao) },
              {
                key: 'pago_em',
                label: 'Pago em',
                render: (row) => (row.pago_em ? dayjs(row.pago_em).format('DD/MM/YYYY') : '-'),
              },
              {
                key: 'status_pagamento',
                label: 'Status',
                render: (row) => <StatusBadge value={row.status_pagamento === 'aberto' ? 'pendente' : row.status_pagamento} />,
              },
            ]}
            rows={historyRows}
          />
        )}
      </SectionCard>

      <SectionCard title="Fechamento por funcionario">
        {filteredRows.length === 0 ? (
          <EmptyState
            title="Nenhum fechamento encontrado"
            description="Ajuste os filtros ou registre atendimentos para gerar o fechamento semanal."
          />
        ) : (
        <DataTable
          columns={[
            {
              key: 'funcionario',
              label: 'Funcionario',
              render: (row) => (
                <span className="inline-flex items-center gap-2 font-semibold text-slate-100">
                  <UserRound size={13} className="text-slate-500" />
                  {row.funcionario}
                </span>
              ),
            },
            { key: 'totalServicos', label: 'Atendimentos' },
            {
              key: 'totalVendido',
              label: 'Total vendido',
              render: (row) => (
                <span className="font-semibold text-emerald-300">{formatCurrency(row.totalVendido)}</span>
              ),
            },
            {
              key: 'totalComissao',
              label: 'Comissao',
              render: (row) => (
                <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
                  <Wallet size={13} />
                  {formatCurrency(row.totalComissao)}
                </span>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              render: (row) => <StatusBadge value={row.status === 'aberto' ? 'pendente' : row.status} />,
            },
            {
              key: 'actions',
              label: 'Acao',
              render: (row) =>
                row.status === 'pago' ? (
                  <span className="text-xs text-slate-500">Pago</span>
                ) : (
                  <button className="btn-secondary" type="button" disabled={saving} onClick={() => setTargetToPay(row)}>
                    Marcar como pago
                  </button>
                ),
            },
          ]}
          rows={filteredRows}
          empty="Nenhum atendimento registrado nesta semana."
        />
        )}
      </SectionCard>

      <SectionCard
        title="Producao do dono/admin"
        subtitle="Atendimentos operacionais fora da folha de comissao da equipe."
      >
        {ownerProductionRows.length === 0 ? (
          <EmptyState
            title="Sem producao do dono/admin nesta semana"
            description="Nao ha atendimentos de perfis sem comissao no periodo filtrado."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'funcionario', label: 'Responsavel' },
              { key: 'cliente_nome', label: 'Cliente' },
              {
                key: 'valor_servico',
                label: 'Valor',
                render: (row) => <span className="font-semibold text-emerald-300">{formatCurrency(row.valor_servico)}</span>,
              },
              {
                key: 'valor_comissao',
                label: 'Comissao',
                render: () => <span className="text-slate-400">{formatCurrency(0)}</span>,
              },
            ]}
            rows={ownerProductionRows}
          />
        )}
      </SectionCard>

      <ConfirmDialog
        open={Boolean(targetToPay)}
        title="Confirmar pagamento"
        description={`Deseja marcar ${targetToPay?.funcionario || 'este funcionario'} como pago nesta semana?`}
        onCancel={() => setTargetToPay(null)}
        onConfirm={async () => {
          await markEmployeeAsPaid(targetToPay)
          setTargetToPay(null)
        }}
      />
      <ConfirmDialog
        open={bulkPayConfirmOpen}
        title="Confirmar pagamento em lote"
        description="Deseja marcar como pago todo o fechamento pendente dos funcionarios visiveis nos filtros atuais?"
        onCancel={() => setBulkPayConfirmOpen(false)}
        onConfirm={markVisibleRowsAsPaid}
      />
    </section>
  )
}
