import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, Download, Filter, Search, SlidersHorizontal, UserRound, Wallet } from 'lucide-react'
import { DataTable } from '../../../components/ui/DataTable'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PageFrame } from '../../../components/ui/PageFrame'
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
        description: error?.message || 'Não foi possível carregar o fechamento semanal.',
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas' }, scheduleReload)
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
      totalRecebido: Number(row.total_recebido ?? 0),
      totalPendente: Number(row.total_pendente ?? 0),
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
    const totalRecebidoCliente = filteredRows.reduce((sum, row) => sum + Number(row.totalRecebido ?? 0), 0)
    const totalPendenteCliente = filteredRows.reduce((sum, row) => sum + Number(row.totalPendente ?? 0), 0)
    const totalComissao = filteredRows.reduce((sum, row) => sum + Number(row.totalComissao), 0)
    const ticketMedio = totalAtendimentos ? totalVendido / totalAtendimentos : 0
    const totalPago = filteredRows
      .filter((row) => row.status === 'pago')
      .reduce((sum, row) => sum + Number(row.totalComissao), 0)
    const totalPendenteFechamento = totalComissao - totalPago
    return {
      totalFuncionarios,
      totalAtendimentos,
      totalVendido,
      totalRecebidoCliente,
      totalPendenteCliente,
      totalComissao,
      ticketMedio,
      totalPago,
      totalPendenteFechamento,
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
      'Funcionário',
      'Tipo remuneração',
      'Participa fechamento comissão',
      'Atendimentos',
      'Total realizado',
      'Recebido (cliente)',
      'Pendente (cliente)',
      'Comissão válida',
      'Status fechamento',
    ]
    const lines = filteredRows.map((row) => [
      row.funcionario,
      row.tipoRemuneracao,
      row.participaFechamentoComissao ? 'sim' : 'não',
      row.totalServicos,
      Number(row.totalVendido || 0).toFixed(2),
      Number(row.totalRecebido ?? 0).toFixed(2),
      Number(row.totalPendente ?? 0).toFixed(2),
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
        description: `Não foi possível atualizar o pagamento de ${row.funcionario}.`,
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
        title: 'Sem pendências',
        description: 'Não há funcionários pendentes nos filtros atuais.',
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
        description: 'Pagamento atualizado para os funcionários pendentes filtrados.',
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
    <PageFrame>
      <PageHeader
        eyebrow="Admin"
        title="Fechamento semanal"
        description={`Consolidado semanal para conferência e pagamento de comissões (${dayjs(weekStart).format('DD/MM')} – ${dayjs(weekEnd).format('DD/MM')}).`}
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
            <Link
              to="/admin/comissoes"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              Ir para comissões
            </Link>
            <Link
              to="/admin/historicos"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              Ver históricos completos
            </Link>
            <Link
              to="/admin/producao"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              Ver produção
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
        <StatCard label="Realizado (semana)" value={formatCurrency(totals.totalVendido)} hint="Produção terça a sábado" />
        <StatCard label="Recebido (cliente)" value={formatCurrency(totals.totalRecebidoCliente)} hint="Vendas quitadas" />
        <StatCard label="Pendente (cliente)" value={formatCurrency(totals.totalPendenteCliente)} hint="Aguardando pagamento" />
        <StatCard label="Comissão válida" value={formatCurrency(totals.totalComissao)} hint="Sobre vendas pagas" />
        <StatCard label="Ticket médio" value={formatCurrency(totals.ticketMedio)} hint="Média por atendimento" />
      </SummaryGrid>
      <SummaryGrid columns={2}>
        <StatCard label="Total atendimentos" value={totals.totalAtendimentos} />
        <StatCard label="Funcionários no fechamento" value={totals.totalFuncionarios} />
      </SummaryGrid>

      <SummaryGrid columns={2}>
        <StatCard
          label="Produção dono/admin (atendimentos)"
          value={ownerTotals.totalAtendimentos}
          hint="Não participa de fechamento de comissão"
        />
        <StatCard
          label="Produção dono/admin (faturamento)"
          value={formatCurrency(ownerTotals.totalVendido)}
          hint="Receita operacional sem custo de comissão"
        />
      </SummaryGrid>

      <Toolbar>
        <div className="grid w-full gap-2 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="relative lg:col-span-2 xl:col-span-2">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-11"
              placeholder="Buscar funcionário"
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
              <option value="all">Todos os funcionários</option>
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
              <option value="all">Todos os status</option>
              <option value="aberto">Aberto</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
            </select>
          </label>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300 md:col-span-2 lg:col-span-4 xl:col-span-1">
            <Filter size={13} />
            Semana fixa (terça a sábado)
          </div>
        </div>
      </Toolbar>

      <SectionCard
        title="Resumo da semana atual"
        subtitle="Consolidação gerencial semanal para conferências e pagamentos (ciclo fixo: terça a sábado)."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Período</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{dayjs(weekStart).format('DD/MM')} – {dayjs(weekEnd).format('DD/MM')}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Funcionário em destaque</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{destaque}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-emerald-300">Total já pago</p>
            <p className="mt-1 text-sm font-semibold text-emerald-300">{formatCurrency(totals.totalPago)}</p>
          </div>
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
            <p className="text-xs uppercase tracking-wide text-sky-300">Total pendente</p>
            <p className="mt-1 text-sm font-semibold text-sky-300">{formatCurrency(totals.totalPendenteFechamento)}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Fechamento por funcionário">
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
              label: 'Funcionário',
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
              label: 'Realizado',
              render: (row) => (
                <span className="font-semibold text-emerald-300">{formatCurrency(row.totalVendido)}</span>
              ),
            },
            {
              key: 'totalRecebido',
              label: 'Recebido',
              render: (row) => <span className="text-slate-200">{formatCurrency(row.totalRecebido)}</span>,
            },
            {
              key: 'totalPendente',
              label: 'Pendente',
              render: (row) => <span className="text-amber-200/90">{formatCurrency(row.totalPendente)}</span>,
            },
            {
              key: 'totalComissao',
              label: 'Comissão válida',
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
              label: 'Ação',
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
        title="Histórico semanal congelado"
        subtitle="Fechamentos anteriores com snapshot salvo no momento do pagamento. Para visão completa, acesse o módulo Históricos."
      >
        {historyRows.length === 0 ? (
          <EmptyState
            title="Sem histórico semanal"
            description="Os fechamentos gerados aparecerão aqui para consulta."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'usuario', label: 'Funcionário', render: (row) => row.usuario?.nome || 'Sem nome' },
              {
                key: 'periodo',
                label: 'Período',
                render: (row) =>
                  `${dayjs(row.semana_inicio).format('DD/MM/YYYY')} até ${dayjs(row.semana_fim).format('DD/MM/YYYY')}`,
              },
              { key: 'total_servicos', label: 'Atendimentos' },
              { key: 'total_vendido', label: 'Total vendido', render: (row) => formatCurrency(row.total_vendido) },
              { key: 'total_comissao', label: 'Comissão', render: (row) => formatCurrency(row.total_comissao) },
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
            rows={historyRows.slice(0, 25)}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Produção do dono/admin"
        subtitle="Atendimentos operacionais fora da folha de comissão da equipe. Análise detalhada no módulo Produção."
      >
        {ownerProductionRows.length === 0 ? (
          <EmptyState
            title="Sem produção do dono/admin nesta semana"
            description="Não há atendimentos de perfis sem comissão no período filtrado."
          />
        ) : (
          <DataTable
            columns={[
              { key: 'funcionario', label: 'Responsável' },
              { key: 'cliente_nome', label: 'Cliente' },
              {
                key: 'valor_servico',
                label: 'Valor',
                render: (row) => <span className="font-semibold text-emerald-300">{formatCurrency(row.valor_servico)}</span>,
              },
              {
                key: 'valor_comissao',
                label: 'Comissão',
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
        description={`Deseja marcar ${targetToPay?.funcionario || 'este funcionário'} como pago nesta semana?`}
        onCancel={() => setTargetToPay(null)}
        onConfirm={async () => {
          await markEmployeeAsPaid(targetToPay)
          setTargetToPay(null)
        }}
      />
      <ConfirmDialog
        open={bulkPayConfirmOpen}
        title="Confirmar pagamento em lote"
        description="Deseja marcar como pago todo o fechamento pendente dos funcionários visíveis nos filtros atuais?"
        onCancel={() => setBulkPayConfirmOpen(false)}
        onConfirm={markVisibleRowsAsPaid}
      />
    </PageFrame>
  )
}
