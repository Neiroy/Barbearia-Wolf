import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download, Filter, Scissors, Search, SlidersHorizontal, UserRound, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PageFrame } from '../../../components/ui/PageFrame'
import { PageHeader } from '../../../components/ui/PageHeader'
import { StatCard } from '../../../components/ui/StatCard'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { captureAppError } from '../../../lib/observability'
import { listAttendances, listWeeklyClosuresHistory, markVendaPago } from '../../../services/supabase'
import { splitRowCashflow } from '../../../utils/financialCalculations'
import { formatCurrency, formatDateTime } from '../../../utils/formatters'

const PAYMENT_FORMS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'outros', label: 'Outros' },
]

export function AdminAttendancesPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [rows, setRows] = useState([])
  const [weeklyHistoryRows, setWeeklyHistoryRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCombos, setExpandedCombos] = useState({})
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [payModal, setPayModal] = useState(null)
  const [payForma, setPayForma] = useState('pix')
  const [markingPay, setMarkingPay] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [attendanceRows, weeklyRows] = await Promise.all([
        listAttendances({ startDate, endDate }),
        listWeeklyClosuresHistory(260),
      ])
      setRows(attendanceRows)
      setWeeklyHistoryRows(weeklyRows)
    } catch (error) {
      captureAppError(error, { source: 'AdminAttendancesPage.reload' })
      showToast({ tone: 'error', title: 'Erro ao carregar', description: error.message })
    } finally {
      setLoading(false)
    }
  }, [endDate, showToast, startDate])

  useEffect(() => {
    reload()
  }, [reload])

  const uniqueEmployees = useMemo(
    () => Array.from(new Set(rows.map((row) => row.usuario?.nome).filter(Boolean))),
    [rows],
  )
  const uniqueServices = useMemo(
    () => Array.from(new Set(rows.map((row) => row.servico?.nome).filter(Boolean))),
    [rows],
  )
  const groupedRows = useMemo(() => {
    const groups = rows.reduce((acc, row) => {
      const comboKey =
        row.venda_id ||
        `${row.usuario_id}|${(row.cliente_nome || '').trim().toLowerCase()}|${dayjs(row.data_hora).format('YYYY-MM-DD HH:mm')}`
      if (!acc[comboKey]) {
        acc[comboKey] = {
          id: comboKey,
          venda_id: row.venda_id || null,
          venda: row.venda || null,
          data_hora: row.data_hora,
          cliente_nome: row.cliente_nome,
          usuario: row.usuario,
          usuario_id: row.usuario_id,
          servicos: [],
          valor_servico: 0,
          valor_comissao: 0,
        }
      }
      if (row.venda) acc[comboKey].venda = row.venda
      acc[comboKey].servicos.push({
        nome: row.servico?.nome || '-',
        valor: Number(row.valor_servico || 0),
      })
      acc[comboKey].valor_servico += Number(row.valor_servico || 0)
      acc[comboKey].valor_comissao += Number(row.valor_comissao || 0)
      return acc
    }, {})

    return Object.values(groups).map((group) => ({
      ...group,
      isCombo: group.servicos.length > 1,
    }))
  }, [rows])

  const filteredRows = useMemo(() => {
    let list = groupedRows.filter((row) =>
      `${row.cliente_nome} ${row.usuario?.nome || ''} ${row.servicos.map((service) => service.nome).join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )

    if (employeeFilter !== 'all') list = list.filter((row) => (row.usuario?.nome || '') === employeeFilter)
    if (serviceFilter !== 'all') list = list.filter((row) => row.servicos.some((service) => service.nome === serviceFilter))
    if (paymentFilter === 'pagos') {
      list = list.filter((row) => (row.venda?.status_pagamento || 'pago') === 'pago')
    }
    if (paymentFilter === 'pendentes') {
      list = list.filter((row) => {
        const st = row.venda?.status_pagamento || 'pago'
        return st === 'pendente' || st === 'parcial'
      })
    }

    return [...list].sort((a, b) => {
      const timeA = new Date(a.data_hora).getTime()
      const timeB = new Date(b.data_hora).getTime()
      if (sortOrder === 'desc') return timeB - timeA
      if (sortOrder === 'asc') return timeA - timeB
      if (sortOrder === 'valor_desc') return Number(b.valor_servico) - Number(a.valor_servico)
      if (sortOrder === 'valor_asc') return Number(a.valor_servico) - Number(b.valor_servico)
      if (sortOrder === 'comissao_desc') return Number(b.valor_comissao) - Number(a.valor_comissao)
      if (sortOrder === 'comissao_asc') return Number(a.valor_comissao) - Number(b.valor_comissao)
      return 0
    })
  }, [groupedRows, search, employeeFilter, serviceFilter, paymentFilter, sortOrder])

  const totals = useMemo(() => {
    const totalAtendimentos = filteredRows.length
    let totalRealizado = 0
    let totalRecebido = 0
    let totalPendenteCaixa = 0
    filteredRows.forEach((row) => {
      const sample = { valor_servico: row.valor_servico, venda: row.venda }
      const flow = splitRowCashflow(sample)
      totalRealizado += flow.realizado
      totalRecebido += flow.recebido
      totalPendenteCaixa += flow.pendente
    })
    const totalComissaoValida = filteredRows.reduce(
      (sum, row) => (row.usuario?.recebe_comissao ? sum + Number(row.valor_comissao || 0) : sum),
      0,
    )
    const faturamentoFuncionarios = filteredRows.reduce((sum, row) => {
      if (!row.usuario?.recebe_comissao) return sum
      return sum + splitRowCashflow({ valor_servico: row.valor_servico, venda: row.venda }).realizado
    }, 0)
    const faturamentoAdminDono = filteredRows.reduce((sum, row) => {
      if (row.usuario?.recebe_comissao) return sum
      return sum + splitRowCashflow({ valor_servico: row.valor_servico, venda: row.venda }).realizado
    }, 0)
    const periodStart = dayjs(startDate).startOf('day')
    const periodEnd = dayjs(endDate).endOf('day')
    const comissaoFuncionarioPendenteFechamento = (weeklyHistoryRows || []).reduce((sum, row) => {
      if ((row.status_pagamento || 'aberto') === 'pago') return sum
      const weekStart = dayjs(row.semana_inicio).startOf('day')
      const weekEnd = dayjs(row.semana_fim).endOf('day')
      const overlapsPeriod = weekStart.isBefore(periodEnd) && weekEnd.isAfter(periodStart)
      return overlapsPeriod ? sum + Number(row.total_comissao || 0) : sum
    }, 0)
    const totalFuncionarios = new Set(filteredRows.map((row) => row.usuario?.nome).filter(Boolean)).size
    return {
      totalAtendimentos,
      totalRealizado,
      totalRecebido,
      totalPendenteCaixa,
      totalComissaoValida,
      comissaoFuncionarioPendenteFechamento,
      faturamentoFuncionarios,
      faturamentoAdminDono,
      totalFuncionarios,
    }
  }, [endDate, filteredRows, startDate, weeklyHistoryRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return filteredRows.slice(start, end)
  }, [filteredRows, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, employeeFilter, serviceFilter, paymentFilter, sortOrder, pageSize, startDate, endDate])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  if (loading) return <LoadingState label="Carregando atendimentos..." />

  function openNativeDatePicker(event) {
    if (typeof event.currentTarget.showPicker === 'function') {
      event.currentTarget.showPicker()
    }
  }

  function clearFilters() {
    setSearch('')
    setEmployeeFilter('all')
    setServiceFilter('all')
    setPaymentFilter('all')
    setSortOrder('desc')
    setStartDate(dayjs().startOf('month').format('YYYY-MM-DD'))
    setEndDate(dayjs().format('YYYY-MM-DD'))
    setCurrentPage(1)
  }

  function toggleComboDetails(comboId) {
    setExpandedCombos((old) => ({
      ...old,
      [comboId]: !old[comboId],
    }))
  }

  function exportCsv() {
    const header = [
      'Data/hora',
      'Funcionário',
      'Tipo remuneração',
      'Participa fechamento comissão',
      'Cliente',
      'Status pagamento',
      'Forma pagamento',
      'Serviços',
      'Valor total',
      'Comissão válida',
    ]
    const lines = filteredRows.map((row) => [
      formatDateTime(row.data_hora),
      row.usuario?.nome || '',
      row.usuario?.tipo_remuneracao || 'nao_informado',
      row.usuario?.participa_fechamento_comissao ? 'sim' : 'não',
      row.cliente_nome || '',
      row.venda?.status_pagamento || 'pago',
      row.venda?.forma_pagamento || '',
      row.servicos.map((service) => service.nome).join(' + '),
      Number(row.valor_servico || 0).toFixed(2),
      Number(row.valor_comissao || 0).toFixed(2),
    ])
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `atendimentos_${dayjs().format('YYYY-MM-DD')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Admin"
        title="Atendimentos"
        description="Histórico completo da operação com filtros e visão consolidada."
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs uppercase tracking-wide text-sky-300">
              <CalendarRange size={13} />
              {dayjs(startDate).format('DD/MM')} - {dayjs(endDate).format('DD/MM')}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              <Download size={13} />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              Limpar filtros
            </button>
            <Link
              to="/admin/relatorios-semanais"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
            >
              Ver fechamento semanal
            </Link>
          </div>
        }
      />

      <SummaryGrid columns={6}>
        <StatCard
          label="Atendimentos (combos)"
          value={totals.totalAtendimentos}
          hint="Agrupados no período filtrado"
        />
        <StatCard
          label="Total realizado"
          value={formatCurrency(totals.totalRealizado)}
          hint="Serviços executados (inclui pendente de pagamento)"
        />
        <StatCard label="Total recebido" value={formatCurrency(totals.totalRecebido)} hint="Caixa confirmado (vendas pagas)" />
        <StatCard
          label="A receber (cliente)"
          value={formatCurrency(totals.totalPendenteCaixa)}
          hint="Vendas ainda não quitadas"
        />
        <StatCard
          label="Comissão válida (pago)"
          value={formatCurrency(totals.totalComissaoValida)}
          hint="Sobre vendas já pagas pelo cliente"
        />
        <StatCard
          label="Comissão equipe pendente (fechamento)"
          value={formatCurrency(totals.comissaoFuncionarioPendenteFechamento)}
          hint="Fechamento semanal de comissão ainda não paga ao funcionário"
        />
      </SummaryGrid>
      <SummaryGrid columns={3}>
        <StatCard label="Receita equipe (realizado)" value={formatCurrency(totals.faturamentoFuncionarios)} />
        <StatCard label="Receita dono/admin (realizado)" value={formatCurrency(totals.faturamentoAdminDono)} />
        <StatCard label="Funcionários ativos" value={totals.totalFuncionarios} />
      </SummaryGrid>

      <Toolbar>
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="relative lg:col-span-2 xl:col-span-2">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-11"
              placeholder="Buscar cliente, funcionário ou serviço"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <input
            type="date"
            className="input"
            value={startDate}
            onFocus={openNativeDatePicker}
            onClick={openNativeDatePicker}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            type="date"
            className="input"
            value={endDate}
            onFocus={openNativeDatePicker}
            onClick={openNativeDatePicker}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <label className="relative">
            <UserRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select className="input appearance-none !pl-11 !pr-10" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="all">Todos os funcionários</option>
              {uniqueEmployees.map((employee) => (
                <option key={employee} value={employee}>
                  {employee}
                </option>
              ))}
            </select>
          </label>
          <label className="relative">
            <Scissors size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select className="input appearance-none !pl-11 !pr-10" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              <option value="all">Todos os serviços</option>
              {uniqueServices.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
          <label className="relative">
            <Wallet size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              className="input appearance-none !pl-11 !pr-10"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="all">Todos os pagamentos</option>
              <option value="pagos">Pagos</option>
              <option value="pendentes">Pendentes</option>
            </select>
          </label>
          <label className="relative lg:col-span-2 xl:col-span-2">
            <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select className="input appearance-none !pl-11 !pr-10" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">Data (mais recente)</option>
              <option value="asc">Data (mais antiga)</option>
              <option value="valor_desc">Valor (maior)</option>
              <option value="valor_asc">Valor (menor)</option>
              <option value="comissao_desc">Comissão (maior)</option>
              <option value="comissao_asc">Comissão (menor)</option>
            </select>
          </label>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300 sm:col-span-2 lg:col-span-4 xl:col-span-1">
            <Filter size={13} />
            Filtros ativos
          </div>
        </div>
      </Toolbar>

      {filteredRows.length === 0 ? (
        <EmptyState
          title="Nenhum atendimento encontrado"
          description="Ajuste os filtros para localizar movimentações no período selecionado."
        />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: 'data_hora',
                label: 'Data/hora',
                render: (row) => (
                  <span className="inline-flex items-center gap-2 text-slate-300">
                    <Clock3 size={13} className="text-slate-500" />
                    {formatDateTime(row.data_hora)}
                  </span>
                ),
              },
              {
                key: 'usuario',
                label: 'Funcionário',
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-100">
                      <UserRound size={13} className="text-slate-500" />
                      {row.usuario?.nome || '-'}
                    </span>
                    {!row.usuario?.recebe_comissao ? (
                      <span className="inline-flex rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300">
                        Produção do dono/admin (sem comissão)
                      </span>
                    ) : null}
                  </div>
                ),
              },
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
                  return (
                    <div className="flex flex-col gap-1">
                      <StatusBadge value={label} />
                      {row.venda?.forma_pagamento ? (
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {String(row.venda.forma_pagamento).replace(/_/g, ' ')}
                        </span>
                      ) : null}
                    </div>
                  )
                },
              },
              {
                key: 'servico',
                label: 'Serviço',
                render: (row) => (
                  <div className="space-y-1">
                    {row.isCombo ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-sky-300 transition hover:border-sky-400/50 hover:bg-sky-500/20"
                          onClick={() => toggleComboDetails(row.id)}
                        >
                          Combo ({row.servicos.length} serviços)
                        </button>
                        {expandedCombos[row.id] ? (
                          <div className="rounded-lg border border-slate-700 bg-slate-950/80 p-2 text-[11px] text-slate-200">
                            {row.servicos.map((service, index) => (
                              <p key={`${row.id}-${service.nome}-${index}`} className="flex items-center justify-between gap-2">
                                <span>{service.nome}</span>
                                <span className="font-semibold text-sky-300">{formatCurrency(service.valor)}</span>
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-300">
                        <Scissors size={12} className="text-slate-500" />
                        {row.servicos[0]?.nome || '-'}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'valor_servico',
                label: 'Valor',
                render: (row) => (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                    <CircleDollarSign size={13} />
                    {formatCurrency(row.valor_servico)}
                  </span>
                ),
              },
              {
                key: 'valor_comissao',
                label: 'Comissão',
                render: (row) => (
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
                    <Wallet size={13} />
                    {formatCurrency(row.valor_comissao)}
                  </span>
                ),
              },
              {
                key: 'acao',
                label: 'Ação',
                render: (row) => {
                  const st = row.venda?.status_pagamento
                  const canPay = row.venda_id && (st === 'pendente' || st === 'parcial')
                  if (!canPay) {
                    return <span className="text-xs text-slate-600">—</span>
                  }
                  return (
                    <button
                      type="button"
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-300 transition hover:bg-emerald-500/20"
                      onClick={() => {
                        setPayModal(row.venda_id)
                        setPayForma('pix')
                      }}
                    >
                      Marcar pago
                    </button>
                  )
                },
              },
            ]}
            rows={paginatedRows}
          />

          <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Exibindo {paginatedRows.length} de {filteredRows.length} registros filtrados
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1">
                <label htmlFor="items-per-page-admin" className="text-xs text-slate-400">
                  Itens/página
                </label>
                <select
                  id="items-per-page-admin"
                  className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-200 outline-none"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  <option className="bg-slate-950 text-slate-100" value={10}>
                    10
                  </option>
                  <option className="bg-slate-950 text-slate-100" value={20}>
                    20
                  </option>
                  <option className="bg-slate-950 text-slate-100" value={30}>
                    30
                  </option>
                </select>
              </div>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((old) => Math.max(1, old - 1))}
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <span className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((old) => Math.min(totalPages, old + 1))}
              >
                Próxima
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      {payModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100">Confirmar recebimento</h3>
            <p className="mt-2 text-sm text-slate-400">
              Marcar esta venda como paga. A comissão do funcionário será calculada somente após esta confirmação.
            </p>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Forma de pagamento
              <div className="relative mt-1">
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select
                  className="input w-full appearance-none !pr-10"
                  value={payForma}
                  onChange={(e) => setPayForma(e.target.value)}
                >
                  {PAYMENT_FORMS.map((f) => (
                    <option className="bg-slate-900 text-slate-100" key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPayModal(null)} disabled={markingPay}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={markingPay}
                onClick={async () => {
                  setMarkingPay(true)
                  try {
                    await markVendaPago({
                      vendaId: payModal,
                      formaPagamento: payForma,
                      userId: profile?.id,
                    })
                    showToast({ tone: 'success', title: 'Pagamento registrado' })
                    setPayModal(null)
                    await reload()
                  } catch (error) {
                    captureAppError(error, { source: 'AdminAttendancesPage.markPago' })
                    showToast({ tone: 'error', title: 'Falha ao registrar', description: error.message })
                  } finally {
                    setMarkingPay(false)
                  }
                }}
              >
                {markingPay ? 'Salvando...' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageFrame>
  )
}
