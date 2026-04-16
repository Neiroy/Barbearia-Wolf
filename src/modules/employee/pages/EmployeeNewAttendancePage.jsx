import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarClock, CheckCircle2, ClipboardList, Sparkles, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { EmptyState } from '../../../components/ui/FeedbackStates'
import { FormField } from '../../../components/ui/FormFields'
import { PageHeader } from '../../../components/ui/PageHeader'
import { SectionCard } from '../../../components/ui/SectionCard'
import { listServices, saveAttendanceBatch } from '../../../services/supabase'
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from '../../../utils/formatters'
import { captureAppError } from '../../../lib/observability'

const initialForm = {
  cliente_nome: '',
  servico_ids: [],
  valores_personalizados: {},
  data_hora: dayjs().format('YYYY-MM-DDTHH:mm'),
}

export function EmployeeNewAttendancePage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [services, setServices] = useState([])
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [submitMode, setSubmitMode] = useState('next')

  useEffect(() => {
    listServices().then(setServices)
  }, [])

  const selectedServices = useMemo(
    () => services.filter((service) => form.servico_ids.includes(service.id)),
    [services, form.servico_ids],
  )

  const valorFinal = useMemo(
    () =>
      selectedServices.reduce((sum, service) => {
        const customValue = parseCurrencyInput(form.valores_personalizados?.[service.id] || '')
        const value = service.valor_editavel ? customValue : Number(service.valor || 0)
        return sum + value
      }, 0),
    [selectedServices, form.valores_personalizados],
  )
  const isAdmin = profile?.tipo === 'admin'
  const receivesCommission = Boolean(profile?.recebe_comissao)
  const dashboardLabel = isAdmin ? 'Admin' : 'Funcionario'
  const operationBadge = isAdmin ? 'Operacao administrativa' : 'Ordem de chegada'
  const goToAttendancesPath = isAdmin ? '/admin/atendimentos' : '/funcionario/meus-atendimentos'
  const comissaoEstimada = useMemo(
    () => (receivesCommission ? (valorFinal * Number(profile?.percentual_comissao || 0)) / 100 : 0),
    [profile?.percentual_comissao, receivesCommission, valorFinal],
  )

  function toggleService(serviceId) {
    setForm((old) => {
      const alreadySelected = old.servico_ids.includes(serviceId)
      return {
        ...old,
        servico_ids: alreadySelected
          ? old.servico_ids.filter((id) => id !== serviceId)
          : [...old.servico_ids, serviceId],
      }
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const clienteNome = form.cliente_nome.trim()
    if (!clienteNome) {
      setError('Informe o nome do cliente para continuar.')
      return
    }
    if (!selectedServices.length) {
      setError('Selecione ao menos um servico para continuar.')
      return
    }
    const hasInvalidEditableValue = selectedServices.some(
      (service) =>
        service.valor_editavel &&
        !(parseCurrencyInput(form.valores_personalizados?.[service.id]) > 0),
    )
    if (hasInvalidEditableValue) {
      setError('Preencha o valor final de todos os servicos com valor flexivel.')
      return
    }
    setSaving(true)
    setError('')
    setFeedback('')
    try {
      await saveAttendanceBatch({
        usuario_id: profile.id,
        cliente_nome: clienteNome,
        data_hora: form.data_hora,
        items: selectedServices.map((service) => ({
          servico_id: service.id,
          valor_servico: service.valor_editavel
            ? parseCurrencyInput(form.valores_personalizados?.[service.id] || '')
            : Number(service.valor || 0),
        })),
      })
      setFeedback(
        `${selectedServices.length} servico(s) lancado(s) com sucesso. Pronto para o proximo atendimento.`,
      )
      if (submitMode === 'list') {
        navigate(goToAttendancesPath)
      } else {
        setForm({
          ...initialForm,
          data_hora: dayjs().format('YYYY-MM-DDTHH:mm'),
          servico_ids: [],
          valores_personalizados: {},
        })
      }
    } catch (submitError) {
      captureAppError(submitError, {
        source: 'EmployeeNewAttendancePage.handleSubmit',
        userId: profile?.id,
        selectedServices: selectedServices.length,
      })
      setError(submitError.message || 'Falha ao salvar atendimento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-6 pb-6">
      <PageHeader
        eyebrow={dashboardLabel}
        title="Lancar atendimento"
        description="Registre rapidamente o servico realizado no atendimento atual. Fluxo simples para operacao diaria."
        actions={
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs uppercase tracking-wide text-sky-300">
            <Sparkles size={13} />
            {operationBadge}
          </div>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard title="Novo atendimento" subtitle="Selecione o servico e conclua em poucos cliques.">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Cliente">
              <input
                className="input h-12 text-base"
                value={form.cliente_nome}
                required
                placeholder="Nome do cliente"
                onChange={(event) => setForm((old) => ({ ...old, cliente_nome: event.target.value }))}
              />
            </FormField>

            <FormField label="Data e hora">
              <input
                className="input h-12"
                type="datetime-local"
                value={form.data_hora}
                required
                onChange={(event) => setForm((old) => ({ ...old, data_hora: event.target.value }))}
              />
            </FormField>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Servicos</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {services.map((service) => {
                  const selected = form.servico_ids.includes(service.id)
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        selected
                          ? 'border-sky-500/60 bg-sky-500/10 shadow-[0_0_16px_rgba(56,189,248,0.12)]'
                          : 'border-slate-700 bg-slate-950/70 hover:border-slate-500'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-100">{service.nome}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {service.valor_editavel ? 'Valor flexivel' : 'Valor fixo'}
                      </p>
                      <p className="mt-2 text-sm font-medium text-sky-300">
                        {service.valor_editavel
                          ? `A partir de ${formatCurrency(service.valor)}`
                          : formatCurrency(service.valor)}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedServices.some((service) => service.valor_editavel) ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Valores finais (servicos flexiveis)
                </p>
                {selectedServices
                  .filter((service) => service.valor_editavel)
                  .map((service) => (
                    <FormField key={service.id} label={service.nome}>
                      <input
                        className="input h-12"
                        type="text"
                        inputMode="numeric"
                        required
                        value={form.valores_personalizados?.[service.id] || ''}
                        onChange={(event) =>
                          setForm((old) => ({
                            ...old,
                            valores_personalizados: {
                              ...old.valores_personalizados,
                              [service.id]: formatCurrencyInput(event.target.value),
                            },
                          }))
                        }
                        placeholder="0,00"
                      />
                    </FormField>
                  ))}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                className="btn-primary h-12 w-full text-sm font-semibold sm:flex-1"
                disabled={saving || form.servico_ids.length === 0}
                onClick={() => setSubmitMode('next')}
              >
                {saving && submitMode === 'next' ? 'Salvando...' : 'Salvar e lancar proximo'}
              </button>
              <button
                type="submit"
                className="btn-secondary h-12 w-full sm:w-auto"
                disabled={saving || form.servico_ids.length === 0}
                onClick={() => setSubmitMode('list')}
              >
                {saving && submitMode === 'list' ? 'Salvando...' : 'Salvar e ver atendimentos'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Resumo do atendimento"
          subtitle="Confirmacao em tempo real antes de finalizar."
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Servico selecionado</p>
              <p className="mt-1 font-medium text-slate-100">
                {selectedServices.length
                  ? selectedServices.map((service) => service.nome).join(' + ')
                  : 'Nao selecionado'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Valor do servico</p>
              <p className="mt-1 font-semibold text-sky-300">{formatCurrency(valorFinal)}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                  <UserRound size={13} />
                  Funcionario
                </p>
                <p className="mt-1 text-sm text-slate-100">{profile?.nome || '-'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                  <CalendarClock size={13} />
                  Data/hora
                </p>
                <p className="mt-1 text-sm text-slate-100">{dayjs(form.data_hora).format('DD/MM/YYYY HH:mm')}</p>
              </div>
            </div>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-sky-300">
                <ClipboardList size={13} />
                {receivesCommission ? 'Comissao estimada' : 'Comissao (nao aplicavel)'}
              </p>
              <p className="mt-1 text-lg font-semibold text-sky-300">{formatCurrency(comissaoEstimada)}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {feedback ? (
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          <CheckCircle2 size={15} />
          {feedback}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {services.length === 0 ? (
        <EmptyState
          title="Nenhum servico ativo"
          description="Solicite ao admin o cadastro de servicos para iniciar os lancamentos."
        />
      ) : null}
    </section>
  )
}
