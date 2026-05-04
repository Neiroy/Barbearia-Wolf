import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Filter, Pencil, PlusCircle, Scissors, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { FormField } from '../../../components/ui/FormFields'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PageFrame } from '../../../components/ui/PageFrame'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import { deleteService, listServices, saveService } from '../../../services/supabase'
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '../../../utils/formatters'
import { useToast } from '../../../context/ToastContext'
import { captureAppError } from '../../../lib/observability'

const initialForm = { id: '', nome: '', valor: '', valor_editavel: false, ordem: 1, ativo: true }

export function AdminServicesPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(initialForm)
  const [serviceToDelete, setServiceToDelete] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editableFilter, setEditableFilter] = useState('all')
  const [sortBy, setSortBy] = useState('ordem')

  async function reload() {
    setLoading(true)
    try {
      setRows(await listServices())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const filteredRows = useMemo(() => {
    let list = rows.filter((row) => row.nome?.toLowerCase().includes(search.toLowerCase().trim()))

    if (editableFilter === 'editavel') list = list.filter((row) => row.valor_editavel)
    if (editableFilter === 'fixo') list = list.filter((row) => !row.valor_editavel)

    const sorted = [...list]
    if (sortBy === 'ordem') sorted.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    if (sortBy === 'nome_asc') sorted.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    if (sortBy === 'nome_desc') sorted.sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR'))
    if (sortBy === 'valor_desc') sorted.sort((a, b) => Number(b.valor) - Number(a.valor))
    if (sortBy === 'valor_asc') sorted.sort((a, b) => Number(a.valor) - Number(b.valor))
    return sorted
  }, [rows, search, editableFilter, sortBy])

  const kpis = useMemo(() => {
    const total = rows.length
    const editaveis = rows.filter((row) => row.valor_editavel).length
    const combos = rows.filter((row) => row.nome?.includes('+')).length
    const averagePrice = total ? rows.reduce((sum, row) => sum + Number(row.valor), 0) / total : 0
    const minPrice = total ? Math.min(...rows.map((row) => Number(row.valor))) : 0
    const maxPrice = total ? Math.max(...rows.map((row) => Number(row.valor))) : 0
    return { total, editaveis, combos, averagePrice, minPrice, maxPrice }
  }, [rows])

  if (loading) return <LoadingState label="Carregando catálogo de serviços..." />

  return (
    <PageFrame>
      <PageHeader
        eyebrow="Admin"
        title="Serviços"
        description="Painel profissional para gerenciar o catálogo e a precificação da barbearia."
        actions={
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
              onClick={() => setForm(initialForm)}
            >
              <PlusCircle size={15} />
              Novo serviço
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
              onClick={reload}
            >
              <SlidersHorizontal size={15} />
              Atualizar catálogo
            </button>
          </div>
        }
      />

      <SummaryGrid columns={4}>
        <StatCard label="Total de serviços" value={kpis.total} hint="Serviços cadastrados no catálogo" />
        <StatCard label="Preço médio" value={formatCurrency(kpis.averagePrice)} hint={`Faixa: ${formatCurrency(kpis.minPrice)} – ${formatCurrency(kpis.maxPrice)}`} />
        <StatCard label="Serviços editáveis" value={kpis.editaveis} hint="Permitem valor personalizado" />
        <StatCard label="Combos cadastrados" value={kpis.combos} hint="Serviços compostos identificados" />
      </SummaryGrid>

      <SectionCard
        title={form.id ? 'Editar serviço' : 'Novo serviço'}
        subtitle="Cadastre e organize o catálogo com preços claros e ordem de exibição."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-10"
          onSubmit={async (event) => {
            event.preventDefault()
            setSaving(true)
            setError('')
            setFeedback('')
            try {
              await saveService({ ...form, valor: parseCurrencyInput(form.valor) })
              setForm(initialForm)
              setFeedback('Serviço salvo com sucesso no catálogo.')
              showToast({ tone: 'success', title: 'Serviço salvo', description: 'Cadastro atualizado no catálogo.' })
              await reload()
            } catch (submitError) {
              captureAppError(submitError, { source: 'AdminServicesPage.submit', serviceId: form.id || null })
              setError(submitError.message || 'Falha ao salvar serviço.')
              showToast({ tone: 'error', title: 'Falha ao salvar serviço', description: submitError.message || 'Tente novamente.' })
            } finally {
              setSaving(false)
            }
          }}
        >
          <FormField label="Nome" className="lg:col-span-2 xl:col-span-3">
            <input
              className="input"
              value={form.nome}
              required
              onChange={(event) => setForm((old) => ({ ...old, nome: event.target.value }))}
            />
          </FormField>
          <FormField label="Valor base" className="lg:col-span-2 xl:col-span-2">
            <input
              className="input"
              type="text"
              inputMode="numeric"
              required
              value={form.valor}
              onChange={(event) =>
                setForm((old) => ({ ...old, valor: formatCurrencyInput(event.target.value) }))
              }
              placeholder="0,00"
            />
          </FormField>
          <FormField label="Ordem" className="lg:col-span-1 xl:col-span-1">
            <input
              className="input"
              type="number"
              required
              value={form.ordem}
              onChange={(event) => setForm((old) => ({ ...old, ordem: Number(event.target.value) }))}
            />
          </FormField>
          <FormField label="Valor editável" className="lg:col-span-1 xl:col-span-2">
            <div className="relative">
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pr-10"
                value={String(form.valor_editavel)}
                onChange={(event) =>
                  setForm((old) => ({ ...old, valor_editavel: event.target.value === 'true' }))
                }
              >
                <option value="false">Não</option>
                <option value="true">Sim</option>
              </select>
            </div>
          </FormField>
          <div className="lg:col-span-6 xl:col-span-2">
            <span className="block text-xs font-medium uppercase tracking-wide text-transparent select-none">Ação</span>
            <button type="submit" className="btn-primary inline-flex w-full items-center justify-center gap-2" disabled={saving}>
              <PlusCircle size={15} />
              {saving ? 'Salvando...' : form.id ? 'Atualizar serviço' : 'Salvar serviço'}
            </button>
          </div>
        </form>
        {feedback ? <p className="mt-3 text-sm text-emerald-300">{feedback}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </SectionCard>

      <SectionCard
        title="Catálogo de serviços"
        subtitle="Busque, filtre e administre o catálogo com leitura rápida e ações claras."
      >
        <Toolbar>
          <div className="grid w-full gap-2 md:grid-cols-2 lg:grid-cols-4">
            <label className="relative lg:col-span-2">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !pl-11"
                placeholder="Buscar por nome do serviço"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className="relative">
              <Scissors size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pl-11 !pr-10"
                value={editableFilter}
                onChange={(event) => setEditableFilter(event.target.value)}
              >
                <option value="all">Todos os tipos</option>
                <option value="editavel">Somente editáveis</option>
                <option value="fixo">Somente valor fixo</option>
              </select>
            </label>

            <label className="relative">
              <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select className="input appearance-none !pl-11 !pr-10" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="ordem">Ordenar por ordem</option>
                <option value="nome_asc">Nome (A-Z)</option>
                <option value="nome_desc">Nome (Z-A)</option>
                <option value="valor_desc">Maior preço</option>
                <option value="valor_asc">Menor preço</option>
              </select>
            </label>
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300 md:col-span-2 lg:col-span-4">
              <Filter size={13} />
              Filtros ativos
            </div>
          </div>
        </Toolbar>

        <div className="mt-4 grid gap-2">
        {filteredRows.map((row) => (
          <article
            key={row.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-sky-500/30 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="font-semibold text-slate-100">{row.nome}</p>
              <p className="mt-1 text-base font-semibold text-sky-300">
                {row.valor_editavel ? `A partir de ${formatCurrency(row.valor)}` : formatCurrency(row.valor)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300">
                  Ordem {row.ordem}
                </span>
                <span className={`rounded-full border px-2 py-0.5 ${
                  row.valor_editavel
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}>
                  {row.valor_editavel ? 'Valor editável' : 'Valor fixo'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary inline-flex items-center gap-1"
                type="button"
                onClick={() => setForm({ ...row, valor: formatCurrencyInput(row.valor) })}
              >
                <Pencil size={14} />
                Editar
              </button>
              <button className="btn-danger inline-flex items-center gap-1" type="button" onClick={() => setServiceToDelete(row)}>
                <Trash2 size={14} />
                Excluir
              </button>
            </div>
          </article>
        ))}
        </div>

        {filteredRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nenhum serviço encontrado"
              description="Ajuste os filtros ou cadastre um novo serviço para compor o catálogo."
            />
          </div>
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={Boolean(serviceToDelete)}
        title="Excluir serviço"
        description={`Deseja remover ${serviceToDelete?.nome || 'este serviço'}?`}
        onCancel={() => setServiceToDelete(null)}
        onConfirm={async () => {
          try {
            await deleteService(serviceToDelete.id)
            setServiceToDelete(null)
            setFeedback('Serviço excluído com sucesso.')
            showToast({ tone: 'success', title: 'Serviço excluído' })
            reload()
          } catch (error) {
            captureAppError(error, { source: 'AdminServicesPage.delete', serviceId: serviceToDelete?.id || null })
            showToast({ tone: 'error', title: 'Falha ao excluir serviço', description: error.message || 'Tente novamente.' })
          }
        }}
      />
    </PageFrame>
  )
}
