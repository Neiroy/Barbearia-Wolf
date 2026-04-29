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
import { createEmployeeAuthUser, listEmployees, saveEmployee, setEmployeeStatus } from '../../../services/supabase'
import { formatPercentInput, parsePercentInput } from '../../../utils/formatters'
import { useToast } from '../../../context/ToastContext'
import { captureAppError } from '../../../lib/observability'

function normalizeEmailLocalPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
}

export function AdminStaffPage() {
  const { showToast } = useToast()
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
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [createForm, setCreateForm] = useState({
    nome: '',
    emailLocalPart: '',
    senha: '',
    percentualComissao: '40,0',
  })
  const [emailEditedManually, setEmailEditedManually] = useState(false)

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

  const filteredRows = useMemo(() => {
    let list = rows.filter((row) => row.nome?.toLowerCase().includes(search.toLowerCase().trim()))
    if (statusFilter === 'ativos') list = list.filter((row) => row.ativo !== false)
    if (statusFilter === 'inativos') list = list.filter((row) => row.ativo === false)
    return list
  }, [rows, search, statusFilter])

  const kpis = useMemo(() => {
    const total = rows.length
    const ativos = rows.filter((row) => row.ativo !== false)
    const inativos = rows.filter((row) => row.ativo === false)
    const rowsComissionados = ativos.filter((row) => row.recebe_comissao)
    const mediaComissao = rowsComissionados.length
      ? rowsComissionados.reduce((sum, row) => sum + Number(row.percentual_comissao || 0), 0) / rowsComissionados.length
      : 0
    const maiorComissao = rowsComissionados.length
      ? Math.max(...rowsComissionados.map((row) => Number(row.percentual_comissao || 0)))
      : 0
    const totalComissionados = rowsComissionados.length
    const totalSemComissao = ativos.length - rowsComissionados.length
    return { total, mediaComissao, maiorComissao, totalComissionados, totalSemComissao, ativos: ativos.length, inativos: inativos.length }
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

      <SummaryGrid columns={6}>
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
        <StatCard label="Ativos" value={kpis.ativos} hint="Podem acessar e lancar atendimentos" />
        <StatCard label="Inativos" value={kpis.inativos} hint="Bloqueados sem perder historico" />
      </SummaryGrid>

      <SectionCard
        title="Novo funcionario"
        subtitle="Cria login no Supabase Auth e perfil no sistema automaticamente."
      >
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12"
          onSubmit={async (event) => {
            event.preventDefault()
            setCreating(true)
            setFeedback('')
            setError('')
            try {
              const parsedPercentual = parsePercentInput(createForm.percentualComissao)
              const result = await createEmployeeAuthUser({
                nome: createForm.nome.trim(),
                emailLocalPart: createForm.emailLocalPart.trim(),
                password: createForm.senha,
                percentualComissao: parsedPercentual,
              })
              await reload()
              setCreateForm({ nome: '', emailLocalPart: '', senha: '', percentualComissao: '40,0' })
              setEmailEditedManually(false)
              setFeedback(`Funcionario criado com sucesso: ${result.email}`)
              showToast({ tone: 'success', title: 'Funcionario criado', description: result.email })
            } catch (createError) {
              captureAppError(createError, { source: 'AdminStaffPage.createEmployee' })
              setError(createError.message || 'Falha ao criar funcionario.')
              showToast({ tone: 'error', title: 'Falha ao criar funcionario', description: createError.message || 'Tente novamente.' })
            } finally {
              setCreating(false)
            }
          }}
        >
          <FormField label="Nome" className="xl:col-span-3">
            <input
              className="input"
              required
              value={createForm.nome}
              onChange={(event) =>
                setCreateForm((old) => {
                  const nome = event.target.value
                  const autoEmail = normalizeEmailLocalPart(nome)
                  return {
                    ...old,
                    nome,
                    emailLocalPart: emailEditedManually ? old.emailLocalPart : autoEmail,
                  }
                })
              }
              placeholder="Ex.: Gabriel"
            />
          </FormField>
          <FormField label="Usuario de e-mail" className="xl:col-span-3">
            <input
              className="input"
              required
              value={createForm.emailLocalPart}
              onChange={(event) => {
                setEmailEditedManually(true)
                setCreateForm((old) => ({ ...old, emailLocalPart: normalizeEmailLocalPart(event.target.value) }))
              }}
              placeholder="Ex.: gabriel"
            />
            <p className="mt-1 text-xs text-slate-400">@barbeariawolf.com</p>
          </FormField>
          <FormField label="Senha inicial" className="xl:col-span-3">
            <div className="flex gap-2">
              <input
                className="input"
                type="text"
                minLength={6}
                required
                value={createForm.senha}
                onChange={(event) => setCreateForm((old) => ({ ...old, senha: event.target.value }))}
                placeholder="Defina uma senha"
              />
              <button
                className="btn-secondary whitespace-nowrap"
                type="button"
                onClick={() => {
                  const raw = Math.random().toString(36).slice(-6) + Math.random().toString(36).slice(-4).toUpperCase()
                  setCreateForm((old) => ({ ...old, senha: `${raw}!` }))
                }}
              >
                Gerar
              </button>
            </div>
          </FormField>
          <FormField label="Comissao (%)" className="xl:col-span-1">
            <input
              className="input"
              type="text"
              value={createForm.percentualComissao}
              onChange={(event) =>
                setCreateForm((old) => ({
                  ...old,
                  percentualComissao: formatPercentInput(event.target.value),
                }))
              }
              placeholder="40,0"
            />
          </FormField>
          <div className="flex items-end xl:col-span-2">
            <button className="btn-primary h-10 w-full min-w-[180px]" type="submit" disabled={creating}>
              {creating ? 'Criando...' : 'Criar funcionario'}
            </button>
          </div>
        </form>
      </SectionCard>

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
              const parsedPercentual = form.recebe_comissao ? parsePercentInput(form.percentual_comissao) : 0
              if (!form.recebe_comissao && parsedPercentual > 0) {
                throw new Error('Perfil sem comissão deve ter percentual igual a 0.')
              }
              await saveEmployee({
                ...form,
                percentual_comissao: parsedPercentual,
              })
              await reload()
              setFeedback('Comissao atualizada com sucesso.')
              showToast({ tone: 'success', title: 'Regra financeira atualizada' })
            } catch (submitError) {
              captureAppError(submitError, { source: 'AdminStaffPage.submit', userId: form.id || null })
              setError(submitError.message || 'Falha ao atualizar comissao.')
              showToast({ tone: 'error', title: 'Falha ao atualizar regra financeira', description: submitError.message || 'Tente novamente.' })
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
            <div className="relative inline-flex items-center rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300">
              <Filter size={13} />
              <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="h-9 appearance-none bg-transparent pl-2 pr-6 text-xs text-slate-300 outline-none"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option className="bg-slate-900 text-slate-200" value="todos">Todos</option>
                <option className="bg-slate-900 text-slate-200" value="ativos">Somente ativos</option>
                <option className="bg-slate-900 text-slate-200" value="inativos">Somente inativos</option>
              </select>
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
                  key: 'status',
                  label: 'Status',
                  render: (row) => (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                        row.ativo === false
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      }`}
                    >
                      {row.ativo === false ? 'Inativo' : 'Ativo'}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  label: 'Acao',
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
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
                      {row.tipo === 'admin' ? null : row.ativo === false ? (
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={async () => {
                            setError('')
                            setFeedback('')
                            try {
                              await setEmployeeStatus({ id: row.id, ativo: true })
                              await reload()
                              setFeedback(`${row.nome} reativado com sucesso.`)
                              showToast({ tone: 'success', title: 'Funcionario reativado' })
                            } catch (statusError) {
                              setError(statusError.message || 'Falha ao reativar funcionario.')
                              showToast({ tone: 'error', title: 'Falha ao reativar', description: statusError.message || 'Tente novamente.' })
                            }
                          }}
                        >
                          Reativar
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={async () => {
                              const ok = window.confirm(`Desativar ${row.nome}? Ele nao conseguira acessar e lancar atendimentos.`)
                              if (!ok) return
                              setError('')
                              setFeedback('')
                              try {
                                await setEmployeeStatus({ id: row.id, ativo: false })
                                await reload()
                                setFeedback(`${row.nome} desativado com sucesso.`)
                                showToast({ tone: 'success', title: 'Funcionario desativado' })
                              } catch (statusError) {
                                setError(statusError.message || 'Falha ao desativar funcionario.')
                                showToast({ tone: 'error', title: 'Falha ao desativar', description: statusError.message || 'Tente novamente.' })
                              }
                            }}
                          >
                            Desativar
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={async () => {
                              const ok = window.confirm(
                                `Excluir logicamente ${row.nome}? O historico sera mantido e o acesso bloqueado.`,
                              )
                              if (!ok) return
                              setError('')
                              setFeedback('')
                              try {
                                await setEmployeeStatus({ id: row.id, ativo: false, excluirLogico: true })
                                await reload()
                                setFeedback(`${row.nome} removido do painel com historico preservado.`)
                                showToast({ tone: 'success', title: 'Funcionario removido do painel' })
                              } catch (statusError) {
                                setError(statusError.message || 'Falha ao excluir funcionario.')
                                showToast({ tone: 'error', title: 'Falha ao excluir', description: statusError.message || 'Tente novamente.' })
                              }
                            }}
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
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
