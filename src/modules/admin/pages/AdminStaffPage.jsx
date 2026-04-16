import { useEffect, useMemo, useState } from 'react'
import { BadgePercent, ChevronDown, Filter, RefreshCw, Search, ShieldCheck, UsersRound } from 'lucide-react'
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
  const [form, setForm] = useState({
    id: '',
    nome: '',
    tipo: 'funcionario',
    tipo_remuneracao: 'comissionado',
    recebe_comissao: true,
    participa_fechamento_comissao: true,
    percentual_comissao: '40,0',
  })
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
    const rowsComissionados = rows.filter((row) => row.recebe_comissao)
    const mediaComissao = rowsComissionados.length
      ? rowsComissionados.reduce((sum, row) => sum + Number(row.percentual_comissao || 0), 0) / rowsComissionados.length
      : 0
    const maiorComissao = rowsComissionados.length
      ? Math.max(...rowsComissionados.map((row) => Number(row.percentual_comissao || 0)))
      : 0
    const totalComissionados = rowsComissionados.length
    const totalSemComissao = rows.length - rowsComissionados.length
    return { total, mediaComissao, maiorComissao, totalComissionados, totalSemComissao }
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

      <SummaryGrid columns={5}>
        <StatCard label="Total de perfis" value={kpis.total} hint="Usuarios cadastrados no sistema" />
        <StatCard label="Perfis com comissao" value={kpis.totalComissionados} hint="Participam de pagamento semanal" />
        <StatCard label="Perfis sem comissao" value={kpis.totalSemComissao} hint="Dono/admin ou remuneracao fixa" />
        <StatCard
          label="Comissao media"
          value={`${kpis.mediaComissao.toFixed(1)}%`}
          hint="Media dos perfis comissionados"
        />
        <StatCard
          label="Maior comissao"
          value={`${kpis.maiorComissao.toFixed(1)}%`}
          hint="Maior percentual configurado"
        />
        <StatCard label="Controle de acesso" value="Ativo" hint="Permissoes e perfis validados" />
      </SummaryGrid>

      <SectionCard title="Regra financeira por perfil" subtitle="Configure acesso e remuneracao de forma separada.">
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!form.id) return
            setSaving(true)
            setFeedback('')
            setError('')
            try {
              await saveEmployee({
                ...form,
                percentual_comissao: form.recebe_comissao ? parsePercentInput(form.percentual_comissao) : 0,
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
          <FormField label="Acesso">
            <input className="input" value={form.tipo} readOnly />
          </FormField>
          <FormField label="Tipo de remuneracao">
            <div className="relative">
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pr-10"
                value={form.tipo_remuneracao}
                onChange={(event) => setForm((old) => ({ ...old, tipo_remuneracao: event.target.value }))}
              >
                <option value="dono">Dono</option>
                <option value="comissionado">Comissionado</option>
                <option value="fixo">Fixo</option>
              </select>
            </div>
          </FormField>
          <FormField label="Recebe comissao">
            <div className="relative">
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pr-10"
                value={form.recebe_comissao ? 'true' : 'false'}
                onChange={(event) =>
                  setForm((old) => ({
                    ...old,
                    recebe_comissao: event.target.value === 'true',
                  }))
                }
              >
                <option value="true">Sim</option>
                <option value="false">Nao</option>
              </select>
            </div>
          </FormField>
          <FormField label="Participa fechamento">
            <div className="relative">
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input appearance-none !pr-10"
                value={form.participa_fechamento_comissao ? 'true' : 'false'}
                onChange={(event) =>
                  setForm((old) => ({
                    ...old,
                    participa_fechamento_comissao: event.target.value === 'true',
                  }))
                }
              >
                <option value="true">Sim</option>
                <option value="false">Nao</option>
              </select>
            </div>
          </FormField>
          <FormField label="Percentual de comissao">
            <input
              className="input"
              type="text"
              inputMode="numeric"
              required
              value={form.percentual_comissao}
              disabled={!form.recebe_comissao}
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
              {saving ? 'Salvando...' : 'Salvar regra financeira'}
            </button>
          </div>
        </form>
        {feedback ? <p className="mt-3 text-sm text-emerald-300">{feedback}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      </SectionCard>

      <SectionCard title="Equipe cadastrada" subtitle="Selecione um perfil para editar regras financeiras.">
        <Toolbar>
          <div className="grid w-full gap-2 md:grid-cols-2 xl:grid-cols-4">
            <label className="relative md:col-span-2 xl:col-span-3">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input !pl-11"
                placeholder="Buscar funcionario por nome"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-300">
              <Filter size={13} />
              Filtros ativos
            </div>
          </div>
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
                  key: 'acesso',
                  label: 'Perfil',
                  render: (row) => (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                      <ShieldCheck size={12} />
                      {row.tipo}
                    </span>
                  ),
                },
                {
                  key: 'financeiro',
                  label: 'Regra financeira',
                  render: (row) => (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300">
                      {row.recebe_comissao ? `Comissionado (${Number(row.percentual_comissao).toFixed(1)}%)` : 'Sem comissao'}
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
                          recebe_comissao: Boolean(row.recebe_comissao),
                          participa_fechamento_comissao: Boolean(row.participa_fechamento_comissao),
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
