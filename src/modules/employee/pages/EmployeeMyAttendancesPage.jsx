import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Filter, Scissors, Search, SlidersHorizontal, Wallet } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { DataTable } from '../../../components/ui/DataTable'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { listAttendances } from '../../../services/supabase'
import { formatCurrency, formatDateTime } from '../../../utils/formatters'

export function EmployeeMyAttendancesPage() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCombos, setExpandedCombos] = useState({})
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('30d')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    if (!profile?.id) return
    async function loadAttendances() {
      setLoading(true)
      try {
        setRows(await listAttendances({ usuarioId: profile.id }))
      } finally {
        setLoading(false)
      }
    }
    loadAttendances()
  }, [profile?.id])

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
          data_hora: row.data_hora,
          cliente_nome: row.cliente_nome,
          usuario_id: row.usuario_id,
          servicos: [],
          valor_servico: 0,
          valor_comissao: 0,
        }
      }
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

    return [...byService].sort((a, b) => {
      const timeA = new Date(a.data_hora).getTime()
      const timeB = new Date(b.data_hora).getTime()
      if (sortOrder === 'desc') return timeB - timeA
      return timeA - timeB
    })
  }, [groupedRows, period, search, serviceFilter, sortOrder])

  const totals = useMemo(() => {
    const totalAtendimentos = filteredRows.length
    const totalVendido = filteredRows.reduce((sum, row) => sum + Number(row.valor_servico), 0)
    const totalComissao = filteredRows.reduce((sum, row) => sum + Number(row.valor_comissao), 0)
    const ticketMedio = totalAtendimentos ? totalVendido / totalAtendimentos : 0
    const ultimoAtendimento = filteredRows[0]?.data_hora

    return { totalAtendimentos, totalVendido, totalComissao, ticketMedio, ultimoAtendimento }
  }, [filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return filteredRows.slice(start, end)
  }, [filteredRows, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, period, serviceFilter, sortOrder, pageSize])

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
        eyebrow="Funcionario"
        title="Meus atendimentos"
        description="Historico profissional dos seus atendimentos, vendas e comissoes."
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs uppercase tracking-wide text-sky-300">
            <CalendarRange size={13} />
            {period === 'all' ? 'Periodo completo' : 'Periodo filtrado'}
          </div>
        }
      />

      <SummaryGrid columns={4}>
        <StatCard label="Total de atendimentos" value={totals.totalAtendimentos} hint="No periodo selecionado" />
        <StatCard label="Total vendido" value={formatCurrency(totals.totalVendido)} hint="Soma dos servicos" />
        <StatCard label="Total de comissao" value={formatCurrency(totals.totalComissao)} hint="Comissao acumulada" />
        <StatCard
          label="Ticket medio"
          value={formatCurrency(totals.ticketMedio)}
          hint={totals.ultimoAtendimento ? `Ultimo: ${formatDateTime(totals.ultimoAtendimento)}` : 'Sem registros'}
        />
      </SummaryGrid>

      <SectionCard
        title="Consulta de atendimentos"
        subtitle="Filtre por periodo, cliente e servico para encontrar rapidamente o que precisa."
      >
        <Toolbar>
          <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-5">
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
                <option value="7d">Ultimos 7 dias</option>
                <option value="30d">Ultimos 30 dias</option>
                <option value="month">Mes atual</option>
                <option value="all">Periodo completo</option>
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
                <option value="all">Todos os servicos</option>
                {uniqueServices.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
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
              description="Ajuste os filtros ou registre novos atendimentos para acompanhar seu historico."
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
                  key: 'servico',
                  label: 'Servico',
                  render: (row) => (
                    <div className="space-y-1">
                      {row.isCombo ? (
                        <>
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
                  label: 'Comissao',
                  render: (row) => (
                    <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
                      <Wallet size={13} />
                      {formatCurrency(row.valor_comissao)}
                    </span>
                  ),
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
                    Itens/pagina
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
                  Pagina {currentPage} de {totalPages}
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
                  Proxima
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </section>
  )
}
