import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Filter, Scissors, Search, SlidersHorizontal, Wallet } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import { DataTable } from '../../../components/ui/DataTable'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { captureAppError } from '../../../lib/observability'
import { listAttendances, markVendaPago } from '../../../services/supabase'
import { splitRowCashflow } from '../../../utils/financialCalculations'
import { formatCurrency, formatDateTime } from '../../../utils/formatters'

const PAYMENT_FORMS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'outros', label: 'Outros' },
]

export function EmployeeMyAttendancesPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const receivesCommission = Boolean(profile?.recebe_comissao)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCombos, setExpandedCombos] = useState({})
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('30d')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [payModal, setPayModal] = useState(null)
  const [payForma, setPayForma] = useState('pix')
  const [markingPay, setMarkingPay] = useState(false)

  const reload = useCallback(async () => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const ownRows = await listAttendances({ usuarioId: profile.id })
      setRows(ownRows.filter((row) => row.usuario_id === profile.id))
    } catch (error) {
      captureAppError(error, { source: 'EmployeeMyAttendancesPage.reload' })
      showToast({ tone: 'error', title: 'Erro ao carregar', description: error.message })
    } finally {
      setLoading(false)
    }
  }, [profile?.id, showToast])

  useEffect(() => {
    reload()
  }, [reload])

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
    const now = dayjs()
    const periodStart =
      period === '7d'
        ? now.subtract(7, 'day')
        : period === '30d'
          ? now.subtract(30, 'day')
          : period === 'month'
            ? now.startOf('month')
            : null

    const byPeriod = groupedRows.filter((row) => {
      if (!periodStart) return true
      return dayjs(row.data_hora).isAfter(periodStart)
    })

    const bySearch = byPeriod.filter((row) =>
      `${row.cliente_nome || ''} ${row.servicos.map((service) => service.nome).join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )

    const byService =
      serviceFilter === 'all'
        ? bySearch
        : bySearch.filter((row) => row.servicos.some((service) => service.nome === serviceFilter))

    const byPayment =
      paymentFilter === 'all'
        ? byService
        : byService.filter((row) => {
            const st = row.venda?.status_pagamento || 'pago'
            if (paymentFilter === 'pagos') return st === 'pago'
            return st === 'pendente' || st === 'parcial'
          })

    return [...byPayment].sort((a, b) => {
      const timeA = new Date(a.data_hora).getTime()
      const timeB = new Date(b.data_hora).getTime()
      if (sortOrder === 'desc') return timeB - timeA
      return timeA - timeB
    })
  }, [groupedRows, period, search, serviceFilter, paymentFilter, sortOrder])

  const totals = useMemo(() => {
    const totalAtendimentos = filteredRows.length
    const totalVendido = filteredRows.reduce((sum, row) => sum + Number(row.valor_servico), 0)
    let totalRecebido = 0
    let totalPendenteCliente = 0
    filteredRows.forEach((row) => {
      const f = splitRowCashflow({ valor_servico: row.valor_servico, venda: row.venda })
      totalRecebido += f.recebido
      totalPendenteCliente += f.pendente
    })
    const totalComissao = filteredRows.reduce((sum, row) => sum + Number(row.valor_comissao), 0)
    const ticketMedio = totalAtendimentos ? totalVendido / totalAtendimentos : 0
    const ultimoAtendimento = filteredRows[0]?.data_hora

    return {
      totalAtendimentos,
      totalVendido,
      totalRecebido,
      totalPendenteCliente,
      totalComissao,
      ticketMedio,
      ultimoAtendimento,
    }
  }, [filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return filteredRows.slice(start, end)
  }, [filteredRows, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, period, serviceFilter, paymentFilter, sortOrder, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  function toggleComboDetails(comboId) {
    setExpandedCombos((old) => ({
      ...old,
      [comboId]: !old[comboId],
    }))
  }

  if (loading) return <LoadingState label="Carregando seus atendimentos..." />

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Funcionário"
        title="Meus atendimentos"
        description="Histórico profissional dos seus atendimentos, vendas e comissões."
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs uppercase tracking-wide text-sky-300">
            <CalendarRange size={13} />
            {period === 'all' ? 'Período completo' : 'Período filtrado'}
          </div>
        }
      />

      <SummaryGrid columns={5}>
        <StatCard label="Atendimentos" value={totals.totalAtendimentos} hint="No período selecionado" />
        <StatCard label="Realizado" value={formatCurrency(totals.totalVendido)} hint="Serviços executados" />
        <StatCard label="Recebido (cliente pagou)" value={formatCurrency(totals.totalRecebido)} hint="Caixa confirmado" />
        <StatCard label="Pendente (cliente)" value={formatCurrency(totals.totalPendenteCliente)} hint="Aguardando pagamento" />
        <StatCard
          label={receivesCommission ? 'Comissão válida' : 'Comissão (não aplicável)'}
          value={formatCurrency(totals.totalComissao)}
          hint={receivesCommission ? 'Sobre vendas já pagas' : 'Este perfil não recebe comissão'}
        />
      </SummaryGrid>
      <SummaryGrid columns={2}>
        <StatCard
          label="Ticket médio"
          value={formatCurrency(totals.ticketMedio)}
          hint={totals.ultimoAtendimento ? `Último: ${formatDateTime(totals.ultimoAtendimento)}` : 'Sem registros'}
        />
      </SummaryGrid>

      <SectionCard
        title="Consulta de atendimentos"
        subtitle="Filtre por período, cliente e serviço para encontrar rapidamente o que precisa."
      >
        <Toolbar>
          <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-6">
            <label className="relative xl:col-span-2">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !pl-11"
                placeholder="Buscar cliente"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className="relative">
              <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pl-11 !pr-10"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="month">Mês atual</option>
                <option value="all">Período completo</option>
              </select>
            </label>

            <label className="relative">
              <Scissors size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pl-11 !pr-10"
                value={serviceFilter}
                onChange={(event) => setServiceFilter(event.target.value)}
              >
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
                onChange={(event) => setPaymentFilter(event.target.value)}
              >
                <option value="all">Todos os pagamentos</option>
                <option value="pagos">Pagos</option>
                <option value="pendentes">Pendentes</option>
              </select>
            </label>

            <label className="relative">
              <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pl-11 !pr-10"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              >
                <option value="desc">Mais recentes</option>
                <option value="asc">Mais antigos</option>
              </select>
            </label>
          </div>
        </Toolbar>

        {filteredRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nenhum atendimento encontrado"
              description="Ajuste os filtros ou registre novos atendimentos para acompanhar seu histórico."
            />
          </div>
        ) : (
          <div className="mt-4 min-h-[420px]">
            <DataTable
              columns={[
                {
                  key: 'data_hora',
                  label: 'Data/Hora',
                  render: (row) => (
                    <span className="inline-flex items-center gap-2 text-slate-300">
                      <Clock3 size={13} className="text-slate-500" />
                      {formatDateTime(row.data_hora)}
                    </span>
                  ),
                },
                {
                  key: 'cliente_nome',
                  label: 'Cliente',
                  render: (row) => <span className="font-semibold text-slate-100">{row.cliente_nome}</span>,
                },
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
                        <span className="inline-flex rounded-full border border-slate-700 bg-slate-950/70 px-2.5 py-1 text-xs text-slate-300">
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
                      {receivesCommission ? formatCurrency(row.valor_comissao) : formatCurrency(0)}
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

            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-400">
                Exibindo {paginatedRows.length} de {filteredRows.length} registros filtrados
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2 self-end sm:self-auto">
                <div className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1">
                  <label htmlFor="items-per-page" className="text-xs text-slate-400">
                    Itens/página
                  </label>
                  <select
                    id="items-per-page"
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
                <div className="hidden items-center gap-1 md:inline-flex">
                  {Array.from({ length: totalPages }, (_, index) => index + 1)
                    .slice(Math.max(0, currentPage - 3), Math.max(0, currentPage - 3) + 5)
                    .map((page) => (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`rounded-md border px-2 py-1 text-xs transition ${
                          page === currentPage
                            ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                            : 'border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                </div>
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
          </div>
        )}
      </SectionCard>
      {payModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-100">Confirmar recebimento</h3>
            <p className="mt-2 text-sm text-slate-400">
              Marcar esta venda como paga. A comissão válida só é aplicada após esta confirmação.
            </p>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Forma de pagamento
              <div className="relative mt-1">
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select className="input w-full appearance-none !pr-10" value={payForma} onChange={(e) => setPayForma(e.target.value)}>
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
                    captureAppError(error, { source: 'EmployeeMyAttendancesPage.markPago' })
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
    </section>
  )
}
