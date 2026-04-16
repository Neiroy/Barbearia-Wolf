import { useEffect, useMemo, useState } from 'react'
import { BadgePercent, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState, LoadingState } from '../../../components/ui/FeedbackStates'
import { FormField } from '../../../components/ui/FormFields'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { StatCard } from '../../../components/ui/StatCard'
import { SummaryGrid } from '../../../components/ui/SummaryGrid'
import { Toolbar } from '../../../components/ui/Toolbar'
import { listEmployees, saveEmployee } from '../../../services/supabase'
import { formatPercentInput, parsePercentInput } from '../../../utils/formatters'

export function AdminStaffPage() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ id: '', nome: '', percentual_comissao: '40,0' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  async function reload() {
    setLoading(true)
    try {
      const data = await listEmployees()
      setRows(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const filteredRows = useMemo(
    () => rows.filter((row) => row.nome?.toLowerCase().includes(search.toLowerCase().trim())),
    [rows, search],
  )

  const kpis = useMemo(() => {
    const total = rows.length
    const mediaComissao = total
      ? rows.reduce((sum, row) => sum + Number(row.percentual_comissao || 0), 0) / total
      : 0
    const maiorComissao = total ? Math.max(...rows.map((row) => Number(row.percentual_comissao || 0))) : 0
    return { total, mediaComissao, maiorComissao }
  }, [rows])

  if (loading) return <LoadingState label="Carregando equipe..." />

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow="Admin"
        title="Funcionarios"
        description="Gestao premium da equipe e configuracao de comissao por colaborador."
        actions={
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
          >
            <RefreshCw size={15} />
            Atualizar equipe
          </button>
        }
      />

      <SummaryGrid columns={4}>
        <StatCard label="Total de funcionarios" value={kpis.total} hint="Colaboradores cadastrados" />
        <StatCard
          label="Comissao media"
          value={`${kpis.mediaComissao.toFixed(1)}%`}
          hint="Media atual de comissoes"
        />
        <StatCard
          label="Maior comissao"
          value={`${kpis.maiorComissao.toFixed(1)}%`}
          hint="Maior percentual configurado"
        />
        <StatCard label="Controle de acesso" value="Ativo" hint="Permissoes e perfis validados" />
      </SummaryGrid>

      <SectionCard
        title="Comissao por funcionario"
        subtitle="Atualize o percentual de comissao de forma rapida e segura."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!form.id) return
            setSaving(true)
            setFeedback('')
            setError('')
            try {
              await saveEmployee({
                ...form,
                percentual_comissao: parsePercentInput(form.percentual_comissao),
              })
              await reload()
              setFeedback('Comissao atualizada com sucesso.')
            } catch (submitError) {
              setError(submitError.message || 'Falha ao atualizar comissao.')
            } finally {
              setSaving(false)
            }
          }}
        >
          <FormField label="Funcionario">
            <input className="input" value={form.nome} readOnly />
          </FormField>
          <FormField label="Percentual de comissao">
            <input
              className="input"
              type="text"
              inputMode="numeric"
              required
              value={form.percentual_comissao}
              onChange={(event) =>
                setForm((old) => ({
                  ...old,
                  percentual_comissao: formatPercentInput(event.target.value),
                }))
              }
              placeholder="0,0"
            />
          </FormField>
          <div className="flex items-end">
            <button className="btn-primary inline-flex w-full items-center justify-center gap-2" type="submit" disabled={!form.id || saving}>
              <BadgePercent size={15} />
              {saving ? 'Salvando...' : 'Atualizar comissao'}
            </button>
          </div>
        </form>
        {feedback ? <p className="mt-3 text-sm text-emerald-300">{feedback}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </SectionCard>

      <SectionCard title="Equipe cadastrada" subtitle="Selecione um funcionario para editar percentual.">
        <Toolbar>
          <label className="relative w-full md:max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Buscar funcionario por nome"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </Toolbar>

        {filteredRows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nenhum funcionario encontrado"
              description="Ajuste sua busca para localizar um colaborador."
            />
          </div>
        ) : (
          <div className="mt-4">
            <DataTable
              columns={[
                {
                  key: 'nome',
                  label: 'Funcionario',
                  render: (row) => (
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-100">
                      <UsersRound size={14} className="text-slate-500" />
                      {row.nome}
                    </span>
                  ),
                },
                {
                  key: 'percentual_comissao',
                  label: 'Comissao',
                  render: (row) => (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300">
                      <BadgePercent size={12} />
                      {Number(row.percentual_comissao).toFixed(1)}%
                    </span>
                  ),
                },
                {
                  key: 'status',
                  label: 'Perfil',
                  render: () => (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                      <ShieldCheck size={12} />
                      Ativo
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  label: 'Acao',
                  render: (row) => (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() =>
                        setForm({
                          ...row,
                          percentual_comissao: formatPercentInput(row.percentual_comissao),
                        })
                      }
                    >
                      Selecionar
                    </button>
                  ),
                },
              ]}
              rows={filteredRows}
            />
          </div>
        )}
      </SectionCard>
    </section>
  )
}
