import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Filter, Pencil, PlusCircle, Scissors, Search, SlidersHorizontal, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { FormField } from '../../../components/ui/FormFields'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import { deleteService, listServices, saveService } from '../../../services/supabase'
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '../../../utils/formatters'

const initialForm = { id: '', nome: '', valor: '', valor_editavel: false, ordem: 1, ativo: true }

export function AdminServicesPage() {
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

  if (loading) return <LoadingState label="Carregando catalogo de servicos..." />

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Servicos"
        description="Painel profissional para gerenciar o catalogo e a precificacao da barbearia."
        actions={
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
              onClick={() => setForm(initialForm)}
            >
              <PlusCircle size={15} />
              Novo servico
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
              onClick={reload}
            >
              <SlidersHorizontal size={15} />
              Atualizar catalogo
            </button>
          </div>
        }
      />

      <SummaryGrid columns={4}>
        <StatCard label="Total de servicos" value={kpis.total} hint="Servicos cadastrados no catalogo" />
        <StatCard label="Preco medio" value={formatCurrency(kpis.averagePrice)} hint={`Faixa: ${formatCurrency(kpis.minPrice)} - ${formatCurrency(kpis.maxPrice)}`} />
        <StatCard label="Servicos editaveis" value={kpis.editaveis} hint="Permitem valor personalizado" />
        <StatCard label="Combos cadastrados" value={kpis.combos} hint="Servicos compostos identificados" />
      </SummaryGrid>

      <SectionCard
        title={form.id ? 'Editar servico' : 'Novo servico'}
        subtitle="Cadastre e organize o catalogo com precos claros e ordem de exibicao."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          onSubmit={async (event) => {
            event.preventDefault()
            setSaving(true)
            setError('')
            setFeedback('')
            try {
              await saveService({ ...form, valor: parseCurrencyInput(form.valor) })
              setForm(initialForm)
              setFeedback('Servico salvo com sucesso no catalogo.')
              await reload()
            } catch (submitError) {
              setError(submitError.message || 'Falha ao salvar servico.')
            } finally {
              setSaving(false)
            }
          }}
        >
          <FormField label="Nome">
            <input
              className="input"
              value={form.nome}
              required
              onChange={(event) => setForm((old) => ({ ...old, nome: event.target.value }))}
            />
          </FormField>
          <FormField label="Valor base">
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
          <FormField label="Ordem">
            <input
              className="input"
              type="number"
              required
              value={form.ordem}
              onChange={(event) => setForm((old) => ({ ...old, ordem: Number(event.target.value) }))}
            />
          </FormField>
          <FormField label="Valor editavel">
            <div className="relative">
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pr-10"
                value={String(form.valor_editavel)}
                onChange={(event) =>
                  setForm((old) => ({ ...old, valor_editavel: event.target.value === 'true' }))
                }
              >
                <option value="false">Nao</option>
                <option value="true">Sim</option>
              </select>
            </div>
          </FormField>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary inline-flex w-full items-center justify-center gap-2" disabled={saving}>
              <PlusCircle size={15} />
              {saving ? 'Salvando...' : form.id ? 'Atualizar servico' : 'Salvar servico'}
            </button>
          </div>
        </form>
        {feedback ? <p className="mt-3 text-sm text-emerald-300">{feedback}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </SectionCard>

      <SectionCard
        title="Catalogo de servicos"
        subtitle="Busque, filtre e administre o catalogo com leitura rapida e acoes claras."
      >
        <Toolbar>
          <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative xl:col-span-2">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !pl-11"
                placeholder="Buscar por nome do servico"
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
                <option value="editavel">Somente editaveis</option>
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
                <option value="valor_desc">Maior preco</option>
                <option value="valor_asc">Menor preco</option>
              </select>
            </label>
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
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
                  {row.valor_editavel ? 'Valor editavel' : 'Valor fixo'}
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
              title="Nenhum servico encontrado"
              description="Ajuste os filtros ou cadastre um novo servico para compor o catalogo."
            />
          </div>
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={Boolean(serviceToDelete)}
        title="Excluir servico"
        description={`Deseja remover ${serviceToDelete?.nome || 'este servico'}?`}
        onCancel={() => setServiceToDelete(null)}
        onConfirm={async () => {
          await deleteService(serviceToDelete.id)
          setServiceToDelete(null)
          setFeedback('Servico excluido com sucesso.')
          reload()
        }}
      />
    </section>
  )
}
