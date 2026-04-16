import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download, Filter, Scissors, Search, SlidersHorizontal, UserRound, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PageHeader } from '../../../components/ui/PageHeader'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import { listAttendances } from '../../../services/supabase'
import { formatCurrency, formatDateTime } from '../../../utils/formatters'

export function AdminAttendancesPage() {
  const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedCombos, setExpandedCombos] = useState({})
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    async function loadAttendances() {
      setLoading(true)
      try {
        setRows(await listAttendances({ startDate, endDate }))
      } finally {
        setLoading(false)
      }
    }
    loadAttendances()
  }, [startDate, endDate])

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
          data_hora: row.data_hora,
          cliente_nome: row.cliente_nome,
          usuario: row.usuario,
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
    let list = groupedRows.filter((row) =>
      `${row.cliente_nome} ${row.usuario?.nome || ''} ${row.servicos.map((service) => service.nome).join(' ')}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )

    if (employeeFilter !== 'all') list = list.filter((row) => (row.usuario?.nome || '') === employeeFilter)
    if (serviceFilter !== 'all') list = list.filter((row) => row.servicos.some((service) => service.nome === serviceFilter))

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
  }, [groupedRows, search, employeeFilter, serviceFilter, sortOrder])

  const totals = useMemo(() => {
    const totalAtendimentos = filteredRows.length
    const totalVendido = filteredRows.reduce((sum, row) => sum + Number(row.valor_servico), 0)
    const totalComissao = filteredRows.reduce((sum, row) => sum + Number(row.valor_comissao), 0)
    const ticketMedio = totalAtendimentos ? totalVendido / totalAtendimentos : 0
    const totalFuncionarios = new Set(filteredRows.map((row) => row.usuario?.nome).filter(Boolean)).size
    return { totalAtendimentos, totalVendido, totalComissao, ticketMedio, totalFuncionarios }
  }, [filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    return filteredRows.slice(start, end)
  }, [filteredRows, currentPage, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, employeeFilter, serviceFilter, sortOrder, pageSize, startDate, endDate])

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
    const header = ['Data/Hora', 'Funcionario', 'Cliente', 'Servicos', 'Valor Total', 'Comissao Total']
    const lines = filteredRows.map((row) => [
      formatDateTime(row.data_hora),
      row.usuario?.nome || '',
      row.cliente_nome || '',
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
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Atendimentos"
        description="Historico completo da operacao com filtros e visao consolidada."
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

      <SummaryGrid columns={5}>
        <StatCard label="Total de atendimentos" value={totals.totalAtendimentos} hint="No periodo filtrado" />
        <StatCard label="Total vendido" value={formatCurrency(totals.totalVendido)} hint="Receita consolidada" />
        <StatCard label="Total de comissao" value={formatCurrency(totals.totalComissao)} hint="Comissao da equipe" />
        <StatCard label="Ticket medio" value={formatCurrency(totals.ticketMedio)} hint="Media por atendimento" />
        <StatCard label="Funcionarios ativos" value={totals.totalFuncionarios} hint="Com atendimento no periodo" />
      </SummaryGrid>

      <Toolbar>
        <div className="grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-11"
              placeholder="Buscar cliente, funcionario ou servico"
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
              <option value="all">Todos funcionarios</option>
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
              <option value="all">Todos servicos</option>
              {uniqueServices.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </label>
          <label className="relative xl:col-span-2">
            <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select className="input appearance-none !pl-11 !pr-10" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
              <option value="desc">Data (mais recente)</option>
              <option value="asc">Data (mais antiga)</option>
              <option value="valor_desc">Valor (maior)</option>
              <option value="valor_asc">Valor (menor)</option>
              <option value="comissao_desc">Comissao (maior)</option>
              <option value="comissao_asc">Comissao (menor)</option>
            </select>
          </label>
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
            <Filter size={13} />
            Filtros ativos
          </div>
        </div>
      </Toolbar>

      {filteredRows.length === 0 ? (
        <EmptyState
          title="Nenhum atendimento encontrado"
          description="Ajuste os filtros para localizar movimentacoes no periodo selecionado."
        />
      ) : (
        <>
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
                key: 'usuario',
                label: 'Funcionario',
                render: (row) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-100">
                      <UserRound size={13} className="text-slate-500" />
                      {row.usuario?.nome || '-'}
                    </span>
                    {row.usuario?.tipo === 'admin' ? (
                      <span className="inline-flex rounded-full border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-300">
                        Atendimento do admin (100%)
                      </span>
                    ) : null}
                  </div>
                ),
              },
              { key: 'cliente_nome', label: 'Cliente' },
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

          <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Exibindo {paginatedRows.length} de {filteredRows.length} registros filtrados
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1">
                <label htmlFor="items-per-page-admin" className="text-xs text-slate-400">
                  Itens/pagina
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
                Pagina {currentPage} de {totalPages}
              </span>
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
        </>
      )}
    </section>
  )
}
