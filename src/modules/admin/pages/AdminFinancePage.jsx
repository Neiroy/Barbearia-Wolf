import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Search, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { EXPENSE_TYPES } from '../../../constants/app'
import { EmptyState } from '../../../components/ui/FeedbackStates'
import { CurrencyCard, SummaryGrid } from '../../../components/ui/SummaryGrid'
import { DataTable } from '../../../components/ui/DataTable'
import { FormField, SelectField } from '../../../components/ui/FormFields'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { Toolbar } from '../../../components/ui/Toolbar'
import { calculateMonthlyFinancial, listAttendances, listExpenses, saveExpense } from '../../../services/supabase'
import { formatCurrency, formatCurrencyInput, formatDate, parseCurrencyInput } from '../../../utils/formatters'

const initialExpense = {
  descricao: '',
  tipo: 'fixo',
  valor: '',
  data: dayjs().format('YYYY-MM-DD'),
}

export function AdminFinancePage() {
  const { profile } = useAuth()
  const [month, setMonth] = useState(dayjs().format('YYYY-MM-01'))
  const [attendances, setAttendances] = useState([])
  const [expenses, setExpenses] = useState([])
  const [newExpense, setNewExpense] = useState(initialExpense)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('data_desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  async function reload() {
    const startDate = dayjs(month).startOf('month').format('YYYY-MM-DD')
    const endDate = dayjs(month).endOf('month').format('YYYY-MM-DD')
    setAttendances(await listAttendances({ startDate, endDate }))
    setExpenses(await listExpenses(month))
  }

  useEffect(() => {
    async function loadMonthlyData() {
      const startDate = dayjs(month).startOf('month').format('YYYY-MM-DD')
      const endDate = dayjs(month).endOf('month').format('YYYY-MM-DD')
      setAttendances(await listAttendances({ startDate, endDate }))
      setExpenses(await listExpenses(month))
    }
    loadMonthlyData()
  }, [month])

  const totals = useMemo(() => calculateMonthlyFinancial(attendances, expenses), [attendances, expenses])
  const expensesByCategory = useMemo(
    () =>
      expenses.reduce((acc, item) => {
        acc[item.tipo] = (acc[item.tipo] || 0) + Number(item.valor)
        return acc
      }, {}),
    [expenses],
  )
  const filteredExpenses = useMemo(() => {
    let list = expenses.filter((item) =>
      item.descricao?.toLowerCase().includes(search.trim().toLowerCase()),
    )
    if (categoryFilter !== 'all') list = list.filter((item) => item.tipo === categoryFilter)
    const sorted = [...list]
    if (sortOrder === 'data_desc')
      sorted.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    if (sortOrder === 'data_asc')
      sorted.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    if (sortOrder === 'valor_desc') sorted.sort((a, b) => Number(b.valor) - Number(a.valor))
    if (sortOrder === 'valor_asc') sorted.sort((a, b) => Number(a.valor) - Number(b.valor))
    return sorted
  }, [expenses, search, categoryFilter, sortOrder])
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize))
  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredExpenses.slice(start, start + pageSize)
  }, [filteredExpenses, currentPage, pageSize])

  function openNativeDatePicker(event) {
    if (typeof event.currentTarget.showPicker === 'function') {
      event.currentTarget.showPicker()
    }
  }

  return (
    <section className="space-y-5 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Financeiro mensal"
        description="Entradas, gastos, comissoes e resultado do mes."
        actions={
          <input
            type="month"
            className="input w-full sm:w-44"
            value={dayjs(month).format('YYYY-MM')}
            onFocus={openNativeDatePicker}
            onClick={openNativeDatePicker}
            onChange={(event) => {
              setCurrentPage(1)
              setMonth(`${event.target.value}-01`)
            }}
          />
        }
      />

      <SummaryGrid columns={7}>
        <CurrencyCard label="Faturamento total" value={formatCurrency(totals.totalEntradas)} />
        <CurrencyCard label="Faturamento funcionarios" value={formatCurrency(totals.faturamentoFuncionarios)} />
        <CurrencyCard label="Faturamento dono/admin" value={formatCurrency(totals.faturamentoAdminDono)} />
        <CurrencyCard label="Comissoes a pagar" value={formatCurrency(totals.totalComissoes)} />
        <CurrencyCard label="Gastos" value={formatCurrency(totals.totalGastos)} />
        <CurrencyCard label="Lucro bruto" value={formatCurrency(totals.lucroBruto)} />
        <CurrencyCard label="Lucro liquido" value={formatCurrency(totals.lucroLiquido)} />
      </SummaryGrid>

      <SectionCard title="Lancamento de gasto">
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          onSubmit={async (event) => {
            event.preventDefault()
            await saveExpense({
              ...newExpense,
              valor: parseCurrencyInput(newExpense.valor),
              criado_por: profile.id,
            })
            setNewExpense(initialExpense)
            reload()
          }}
        >
          <FormField label="Descricao">
            <input
              className="input"
              value={newExpense.descricao}
              required
              onChange={(event) => setNewExpense((old) => ({ ...old, descricao: event.target.value }))}
            />
          </FormField>
          <SelectField
            label="Categoria"
            value={newExpense.tipo}
            onChange={(value) => setNewExpense((old) => ({ ...old, tipo: value }))}
            options={EXPENSE_TYPES}
          />
          <FormField label="Valor">
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={newExpense.valor}
              required
              onChange={(event) =>
                setNewExpense((old) => ({ ...old, valor: formatCurrencyInput(event.target.value) }))
              }
              placeholder="0,00"
            />
          </FormField>
          <FormField label="Data">
            <input
              className="input"
              type="date"
              value={newExpense.data}
              required
              onFocus={openNativeDatePicker}
              onClick={openNativeDatePicker}
              onChange={(event) => setNewExpense((old) => ({ ...old, data: event.target.value }))}
            />
          </FormField>
          <div className="flex items-end">
            <button className="btn-primary w-full" type="submit">
              Salvar gasto
            </button>
          </div>
        </form>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Resumo por categoria">
          <div className="space-y-2">
            {Object.entries(expensesByCategory).map(([tipo, valor]) => (
              <div key={tipo} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
                <span className="capitalize">{tipo}</span>
                <strong>{formatCurrency(valor)}</strong>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Gastos lancados no periodo">
          <Toolbar>
            <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-4">
              <label className="relative min-w-0 xl:col-span-2">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="input !pl-11"
                  placeholder="Buscar por descricao"
                  value={search}
                  onChange={(event) => {
                    setCurrentPage(1)
                    setSearch(event.target.value)
                  }}
                />
              </label>
              <label className="relative min-w-0">
                <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select
                  className="input appearance-none !pl-11 !pr-10"
                  value={categoryFilter}
                  onChange={(event) => {
                    setCurrentPage(1)
                    setCategoryFilter(event.target.value)
                  }}
                >
                  <option value="all">Todas categorias</option>
                  {EXPENSE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="relative min-w-0">
                <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select
                  className="input appearance-none !pl-11 !pr-10"
                  value={sortOrder}
                  onChange={(event) => {
                    setCurrentPage(1)
                    setSortOrder(event.target.value)
                  }}
                >
                  <option value="data_desc">Data (mais recente)</option>
                  <option value="data_asc">Data (mais antiga)</option>
                  <option value="valor_desc">Maior valor</option>
                  <option value="valor_asc">Menor valor</option>
                </select>
              </label>
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300 md:col-span-2 xl:col-span-4">
                <Filter size={13} />
                Filtros ativos
              </div>
            </div>
          </Toolbar>

          {filteredExpenses.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Nenhum gasto encontrado"
                description="Ajuste os filtros para localizar gastos neste periodo."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DataTable
                columns={[
                  { key: 'descricao', label: 'Descricao' },
                  { key: 'tipo', label: 'Categoria' },
                  { key: 'data', label: 'Data', render: (row) => formatDate(row.data) },
                  { key: 'valor', label: 'Valor', render: (row) => formatCurrency(row.valor) },
                ]}
                rows={paginatedExpenses}
                empty="Nenhum gasto registrado neste mes."
              />
              <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">
                  Exibindo {paginatedExpenses.length} de {filteredExpenses.length} gastos filtrados
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1">
                    <label htmlFor="finance-page-size" className="text-xs text-slate-400">
                      Itens/pagina
                    </label>
                    <select
                      id="finance-page-size"
                      className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-200 outline-none"
                      value={pageSize}
                      onChange={(event) => {
                        setCurrentPage(1)
                        setPageSize(Number(event.target.value))
                      }}
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
            </div>
          )}
        </SectionCard>
      </div>
    </section>
  )
}
