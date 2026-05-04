import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Search, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { EXPENSE_TYPES } from '../../../constants/app'
import { EmptyState } from '../../../components/ui/FeedbackStates'
import { CurrencyCard, SummaryGrid } from '../../../components/ui/SummaryGrid'
import { DataTable } from '../../../components/ui/DataTable'
import { FormField, SelectField } from '../../../components/ui/FormFields'
import { PageFrame } from '../../../components/ui/PageFrame'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { Toolbar } from '../../../components/ui/Toolbar'
import {
  calculateMonthlyFinancial,
  closeMonthSnapshot,
  getCommissionMonthlySummary,
  getMonthlyClosure,
  listAttendances,
  listMonthlyClosuresHistory,
  listExpenses,
  reopenMonthSnapshot,
  saveExpense,
} from '../../../services/supabase'
import { splitRowCashflow } from '../../../utils/financialCalculations'
import { formatCurrency, formatCurrencyInput, formatDate, parseCurrencyInput } from '../../../utils/formatters'
import { useToast } from '../../../context/ToastContext'
import { captureAppError } from '../../../lib/observability'
import { supabase } from '../../../lib/supabase'

const initialExpense = {
  id: '',
  descricao: '',
  tipo: 'fixo',
  valor: '',
  recorrente_mensal: false,
  origem_recorrente_id: null,
  data: dayjs().format('YYYY-MM-DD'),
}

export function AdminFinancePage() {
  const { showToast } = useToast()
  const { profile } = useAuth()
  const [month, setMonth] = useState(dayjs().format('YYYY-MM-01'))
  const [attendances, setAttendances] = useState([])
  const [expenses, setExpenses] = useState([])
  const [newExpense, setNewExpense] = useState(initialExpense)
  const [editScope, setEditScope] = useState('mes')
  const [monthClosure, setMonthClosure] = useState(null)
  const [monthlyHistoryRows, setMonthlyHistoryRows] = useState([])
  const [commissionSummary, setCommissionSummary] = useState({ gerada: 0, paga: 0, pendente: 0 })
  const [lastSyncAt, setLastSyncAt] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('data_desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const reload = useCallback(async () => {
    try {
      const startDate = dayjs(month).startOf('month').format('YYYY-MM-DD')
      const endDate = dayjs(month).endOf('month').format('YYYY-MM-DD')
      const [attendanceRows, expenseRows, closureRow, historyRows, commissionMonthly] = await Promise.all([
        listAttendances({ startDate, endDate }),
        listExpenses(month),
        getMonthlyClosure(month),
        listMonthlyClosuresHistory(36),
        getCommissionMonthlySummary(month),
      ])
      setAttendances(attendanceRows)
      setExpenses(expenseRows)
      setMonthClosure(closureRow)
      setMonthlyHistoryRows(historyRows)
      setCommissionSummary(commissionMonthly)
      setLastSyncAt(new Date())
    } catch (error) {
      captureAppError(error, { source: 'AdminFinancePage.reload', month })
      showToast({ tone: 'error', title: 'Falha ao recarregar financeiro', description: error.message || 'Tente novamente.' })
    }
  }, [month, showToast])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    let refreshTimeoutId = null
    const scheduleReload = () => {
      if (refreshTimeoutId) window.clearTimeout(refreshTimeoutId)
      refreshTimeoutId = window.setTimeout(() => reload(), 300)
    }

    const channel = supabase
      .channel(`admin-finance-live-${month}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fechamentos_semanais' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fechamentos_mensais' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'atendimentos' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendas' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos' }, scheduleReload)
      .subscribe()

    return () => {
      if (refreshTimeoutId) window.clearTimeout(refreshTimeoutId)
      supabase.removeChannel(channel)
    }
  }, [month, reload])

  const totals = useMemo(
    () => calculateMonthlyFinancial(attendances, expenses, commissionSummary.paga),
    [attendances, commissionSummary.paga, expenses],
  )
  const displayedTotals = totals
  const collaboratorRows = useMemo(() => {
    const grouped = attendances.reduce((acc, row) => {
      const key = row.usuario_id || 'sem-usuario'
      if (!acc[key]) {
        acc[key] = {
          id: key,
          funcionario: row.usuario?.nome || 'Sem nome',
          tipoRemuneracao: row.usuario?.tipo_remuneracao || 'nao_informado',
          recebeComissao: Boolean(row.usuario?.recebe_comissao),
          totalRealizado: 0,
          totalRecebido: 0,
          totalComissao: 0,
        }
      }
      const flow = splitRowCashflow(row)
      acc[key].totalRealizado += flow.realizado
      acc[key].totalRecebido += flow.recebido
      acc[key].totalComissao += Number(row.valor_comissao || 0)
      return acc
    }, {})

    return Object.values(grouped).sort((a, b) => b.totalRealizado - a.totalRealizado)
  }, [attendances])
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
    <PageFrame>
      <PageHeader
        eyebrow="Admin"
        title="Financeiro mensal"
        description="Entradas, gastos, comissões e resultado do mês."
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
            <span className="inline-flex items-center rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
              {lastSyncAt ? `Sincronizado ${dayjs(lastSyncAt).format('HH:mm:ss')}` : 'Sincronizando...'}
            </span>
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
            {monthClosure?.status_fechamento === 'fechado' ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  try {
                    await reopenMonthSnapshot(month)
                    showToast({ tone: 'success', title: 'Mês reaberto para edição' })
                    reload()
                  } catch (error) {
                    captureAppError(error, { source: 'AdminFinancePage.reopenMonth', month })
                    showToast({ tone: 'error', title: 'Falha ao reabrir mês', description: error.message || 'Tente novamente.' })
                  }
                }}
              >
                Reabrir mês
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  try {
                    await closeMonthSnapshot({ month, userId: profile?.id, attendances, expenses })
                    showToast({ tone: 'success', title: 'Mês fechado com sucesso' })
                    reload()
                  } catch (error) {
                    captureAppError(error, { source: 'AdminFinancePage.closeMonth', month })
                    showToast({ tone: 'error', title: 'Falha ao fechar mês', description: error.message || 'Tente novamente.' })
                  }
                }}
              >
                Fechar mês
              </button>
            )}
          </div>
        }
      />

      <SummaryGrid columns={7}>
        <CurrencyCard
          label="Total realizado"
          value={formatCurrency(displayedTotals.totalEntradas)}
          hint="Serviços executados no mês (inclui pendentes de pagamento)"
        />
        <CurrencyCard
          label="Total recebido (caixa)"
          value={formatCurrency(displayedTotals.totalRecebido)}
          hint="Vendas quitadas pelo cliente"
        />
        <CurrencyCard
          label="Total pendente"
          value={formatCurrency(displayedTotals.totalPendenteReceber)}
          hint="Ainda não recebido da carteira de clientes"
        />
        <CurrencyCard label="Faturamento funcionários (realizado)" value={formatCurrency(displayedTotals.faturamentoFuncionarios)} />
        <CurrencyCard label="Faturamento dono/admin (realizado)" value={formatCurrency(displayedTotals.faturamentoAdminDono)} />
        <CurrencyCard label="Gastos" value={formatCurrency(displayedTotals.totalGastos)} />
        <CurrencyCard
          label="Comissão gerada (sobre pago)"
          value={formatCurrency(commissionSummary.gerada)}
          hint="Somente vendas já pagas pelo cliente"
        />
      </SummaryGrid>
      <SummaryGrid columns={4}>
        <CurrencyCard
          label="Comissão paga (funcionários)"
          value={formatCurrency(commissionSummary.paga)}
          hint="Fechamento semanal marcado como pago"
        />
        <CurrencyCard
          label="Comissão pendente (funcionários)"
          value={formatCurrency(commissionSummary.pendente)}
          hint="A pagar aos funcionários no mês"
        />
        <CurrencyCard label="Lucro bruto (sobre caixa)" value={formatCurrency(displayedTotals.lucroBruto)} />
        <CurrencyCard label="Lucro liquido" value={formatCurrency(displayedTotals.lucroLiquido)} />
      </SummaryGrid>

      <SectionCard
        title="Resumo por colaborador no mês"
        subtitle="Conferência de faturamento do dono/admin, funcionário e comissões pagáveis."
      >
        <DataTable
          columns={[
            { key: 'funcionario', label: 'Colaborador' },
            {
              key: 'tipoRemuneracao',
              label: 'Perfil',
              render: (row) =>
                row.recebeComissao ? 'Funcionário comissionado' : 'Dono/Admin (sem comissão)',
            },
            {
              key: 'totalRealizado',
              label: 'Realizado',
              render: (row) => formatCurrency(row.totalRealizado),
            },
            {
              key: 'totalRecebido',
              label: 'Recebido',
              render: (row) => formatCurrency(row.totalRecebido),
            },
            {
              key: 'totalComissao',
              label: 'Comissão (paga pelo cliente)',
              render: (row) => formatCurrency(row.recebeComissao ? row.totalComissao : 0),
            },
          ]}
          rows={collaboratorRows}
          empty="Sem atendimentos lançados para o mês selecionado."
        />
      </SectionCard>

      <SectionCard
        title="Histórico mensal congelado"
        subtitle="Meses fechados com snapshot financeiro salvo no fechamento."
      >
        <DataTable
          columns={[
            {
              key: 'referencia_mes',
              label: 'Mês/ano',
              render: (row) => dayjs(row.referencia_mes).format('MM/YYYY'),
            },
            { key: 'total_entradas', label: 'Realizado', render: (row) => formatCurrency(row.total_entradas) },
            {
              key: 'total_recebido',
              label: 'Recebido',
              render: (row) => formatCurrency(row.total_recebido != null ? row.total_recebido : row.total_entradas),
            },
            { key: 'total_pendente', label: 'Pendente', render: (row) => formatCurrency(row.total_pendente ?? 0) },
            { key: 'faturamento_equipe', label: 'Equipe', render: (row) => formatCurrency(row.faturamento_equipe || 0) },
            { key: 'faturamento_admin', label: 'Admin/Dono', render: (row) => formatCurrency(row.faturamento_admin || 0) },
            { key: 'total_comissoes', label: 'Comissões geradas', render: (row) => formatCurrency(row.total_comissoes) },
            { key: 'comissao_paga', label: 'Comissão paga', render: (row) => formatCurrency(row.comissao_paga || 0) },
            { key: 'comissao_pendente', label: 'Comissão pendente', render: (row) => formatCurrency(row.comissao_pendente || 0) },
            { key: 'total_gastos', label: 'Gastos', render: (row) => formatCurrency(row.total_gastos) },
            { key: 'lucro_bruto', label: 'Lucro bruto', render: (row) => formatCurrency(row.lucro_bruto) },
            { key: 'lucro_liquido', label: 'Lucro líquido', render: (row) => formatCurrency(row.lucro_liquido) },
            {
              key: 'fechado_em',
              label: 'Fechado em',
              render: (row) => (row.fechado_em ? dayjs(row.fechado_em).format('DD/MM/YYYY') : '-'),
            },
            { key: 'status_fechamento', label: 'Status' },
          ]}
          rows={monthlyHistoryRows}
          empty="Nenhum fechamento mensal histórico encontrado."
        />
      </SectionCard>

      <SectionCard title="Lançamento de gasto">
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              if (monthClosure?.status_fechamento === 'fechado') {
                throw new Error('Este mês está fechado. Reabra o mês para editar gastos.')
              }

              if (
                newExpense.id &&
                newExpense.tipo === 'fixo' &&
                editScope === 'recorrencia' &&
                (newExpense.recorrente_mensal || newExpense.origem_recorrente_id)
              ) {
                const templateId = newExpense.origem_recorrente_id || newExpense.id
                await saveExpense({
                  id: templateId,
                  descricao: newExpense.descricao,
                  tipo: 'fixo',
                  valor: parseCurrencyInput(newExpense.valor),
                  recorrente_mensal: true,
                  data: newExpense.data,
                  criado_por: profile.id,
                })
                showToast({ tone: 'success', title: 'Recorrência futura atualizada' })
                reload()
                return
              }

              await saveExpense({
                ...newExpense,
                valor: parseCurrencyInput(newExpense.valor),
                criado_por: profile.id,
              })
              setNewExpense(initialExpense)
              setEditScope('mes')
              showToast({ tone: 'success', title: 'Gasto salvo com sucesso' })
              reload()
            } catch (error) {
              captureAppError(error, { source: 'AdminFinancePage.saveExpense', month })
              showToast({ tone: 'error', title: 'Falha ao salvar gasto', description: error.message || 'Tente novamente.' })
            }
          }}
        >
          <FormField label="Descrição">
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
            onChange={(value) =>
              setNewExpense((old) => ({
                ...old,
                tipo: value,
                recorrente_mensal: value === 'fixo' ? old.recorrente_mensal : false,
              }))
            }
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
              {newExpense.id ? 'Atualizar gasto' : 'Salvar gasto'}
            </button>
          </div>
          {newExpense.tipo === 'fixo' ? (
            <div className="sm:col-span-2 xl:col-span-5">
              <label className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border border-slate-700 bg-slate-950"
                  checked={Boolean(newExpense.recorrente_mensal)}
                  onChange={(event) =>
                    setNewExpense((old) => ({ ...old, recorrente_mensal: event.target.checked }))
                  }
                />
                Repetir mensalmente (gasto fixo recorrente)
              </label>
            </div>
          ) : null}
          {newExpense.id && newExpense.tipo === 'fixo' && (newExpense.recorrente_mensal || newExpense.origem_recorrente_id) ? (
            <div className="sm:col-span-2 xl:col-span-5">
              <SelectField
                label="Modo de edição do gasto fixo"
                value={editScope}
                onChange={(value) => setEditScope(value)}
                options={[
                  { value: 'mes', label: 'Editar só este mês' },
                  { value: 'recorrencia', label: 'Editar recorrência futura' },
                ]}
              />
            </div>
          ) : null}
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

        <SectionCard title="Gastos lançados no período">
          <Toolbar>
            <div className="grid w-full gap-2 md:grid-cols-2 lg:grid-cols-4">
              <label className="relative min-w-0 lg:col-span-2">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="input !pl-11"
                  placeholder="Buscar por descrição"
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
              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300 md:col-span-2 lg:col-span-4">
                <Filter size={13} />
                Filtros ativos
              </div>
            </div>
          </Toolbar>

          {filteredExpenses.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Nenhum gasto encontrado"
                description="Ajuste os filtros para localizar gastos neste período."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <DataTable
                columns={[
                  { key: 'descricao', label: 'Descrição' },
                  { key: 'tipo', label: 'Categoria' },
                  {
                    key: 'recorrente_mensal',
                    label: 'Recorrência',
                    render: (row) =>
                      row.tipo === 'fixo'
                        ? row.recorrente_mensal
                          ? 'Fixo mensal'
                          : row.origem_recorrente_id
                            ? 'Fixo (gerado)'
                            : 'Fixo pontual'
                        : 'Variável',
                  },
                  { key: 'data', label: 'Data', render: (row) => formatDate(row.data) },
                  { key: 'valor', label: 'Valor', render: (row) => formatCurrency(row.valor) },
                  {
                    key: 'acao',
                    label: 'Ação',
                    render: (row) => (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() =>
                          setNewExpense({
                            id: row.id,
                            descricao: row.descricao || '',
                            tipo: row.tipo || 'fixo',
                            valor: formatCurrencyInput(row.valor || 0),
                            recorrente_mensal: Boolean(row.recorrente_mensal),
                            origem_recorrente_id: row.origem_recorrente_id || null,
                            data: row.data || dayjs().format('YYYY-MM-DD'),
                          })
                        }
                      >
                        Editar
                      </button>
                    ),
                  },
                ]}
                rows={paginatedExpenses}
                empty="Nenhum gasto registrado neste mês."
              />
              <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-400">
                  Exibindo {paginatedExpenses.length} de {filteredExpenses.length} gastos filtrados
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-2 py-1">
                    <label htmlFor="finance-page-size" className="text-xs text-slate-400">
                      Itens/página
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
            </div>
          )}
        </SectionCard>
      </div>
    </PageFrame>
  )
}
