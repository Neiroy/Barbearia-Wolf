import { parseCurrencyInput } from '../../utils/formatters'

export function catalogItemValue(service, valoresPersonalizados) {
  if (service.valor_editavel) {
    return parseCurrencyInput(valoresPersonalizados?.[service.id] || '')
  }
  return Number(service.valor || 0)
}

export function parseAvulsoCharge(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null
    return value
  }
  const text = String(value ?? '').trim()
  if (!text || text.includes('-')) return null
  const parsed = parseCurrencyInput(text)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export function attendanceTotal(selectedServices, valoresPersonalizados, avulso) {
  const catalogTotal = selectedServices.reduce(
    (sum, service) => sum + catalogItemValue(service, valoresPersonalizados),
    0,
  )
  if (!avulso?.selecionado) return catalogTotal
  return catalogTotal + (parseAvulsoCharge(avulso.valor) ?? 0)
}

export function estimatedCommission(valorFinal, profile) {
  const receivesCommission = Boolean(profile?.recebe_comissao)
  return receivesCommission ? (valorFinal * Number(profile?.percentual_comissao || 0)) / 100 : 0
}

export function attendanceSummaryNames(selectedServices, avulso) {
  const names = selectedServices.map((service) => service.nome).filter(Boolean)
  if (!avulso?.selecionado) return names
  const nome = String(avulso?.nome || '').trim()
  if (nome) names.push(nome)
  return names
}

export function toggleAvulsoSelection(form) {
  if (form.servico_avulso_selecionado) {
    return {
      ...form,
      servico_avulso_selecionado: false,
      servico_avulso_nome: '',
      servico_avulso_valor: '',
    }
  }
  return {
    ...form,
    servico_avulso_selecionado: true,
  }
}

export function hasAttendanceSelection(selectedCount, avulsoSelecionado) {
  return selectedCount > 0 || Boolean(avulsoSelecionado)
}

export function attendanceSubmitError({ clienteNome, selectedServices, valoresPersonalizados, avulso }) {
  if (!String(clienteNome || '').trim()) {
    return 'Informe o nome do cliente para continuar.'
  }
  const avulsoSelecionado = Boolean(avulso?.selecionado)
  if (!selectedServices.length && !avulsoSelecionado) {
    return 'Selecione ao menos um serviço para continuar.'
  }
  const hasInvalidEditableValue = selectedServices.some(
    (service) => service.valor_editavel && !(parseCurrencyInput(valoresPersonalizados?.[service.id]) > 0),
  )
  if (hasInvalidEditableValue) {
    return 'Preencha o valor final de todos os serviços com valor flexível.'
  }
  if (avulsoSelecionado) {
    if (!String(avulso.nome || '').trim()) {
      return 'Informe o que foi feito no serviço avulso.'
    }
    if (parseAvulsoCharge(avulso.valor) == null) {
      return 'O valor do serviço avulso deve ser maior que zero.'
    }
  }
  return ''
}

export function buildAttendanceSaveItems(selectedServices, valoresPersonalizados, avulso) {
  const items = selectedServices.map((service) => ({
    servico_id: service.id,
    valor_servico: catalogItemValue(service, valoresPersonalizados),
  }))
  if (avulso?.selecionado) {
    items.push({
      servico_id: null,
      servico_avulso_nome: String(avulso.nome || '').trim(),
      valor_servico: parseAvulsoCharge(avulso.valor),
    })
  }
  return items
}
