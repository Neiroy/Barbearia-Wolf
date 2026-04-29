import { supabase } from '../../lib/supabase'
import dayjs from 'dayjs'
import { getBarberWeekRange } from '../../utils/dateRanges'

function normalizePaymentStatus(status) {
  return status === 'pago' ? 'pago' : 'aberto'
}

function isValidBarberWeek(row) {
  const start = dayjs(row?.semana_inicio)
  const end = dayjs(row?.semana_fim)
  if (!start.isValid() || !end.isValid()) return false
  const startIsTuesday = start.day() === 2
  const endIsSaturday = end.day() === 6
  const diffDays = end.startOf('day').diff(start.startOf('day'), 'day')
  return startIsTuesday && endIsSaturday && diffDays === 4
}

function assertBarberWeekRange(startDate, endDate) {
  const normalized = getBarberWeekRange(startDate)
  if (normalized.startDate !== startDate || normalized.endDate !== endDate) {
    throw new Error('Periodo semanal invalido. Use sempre o ciclo fixo de terca a sabado.')
  }
}

export function mapWeeklySummaryToClosurePayload(summary, startDate, endDate, statusByUserId = {}) {
  return (summary || []).map((item) => ({
    usuario_id: item.usuario_id,
    semana_inicio: startDate,
    semana_fim: endDate,
    total_servicos: Number(item.total_atendimentos || 0),
    total_vendido: Number(item.total_vendido || 0),
    total_recebido: Number(item.total_recebido ?? 0),
    total_pendente: Number(item.total_pendente ?? 0),
    total_comissao: Number(item.total_comissao || 0),
    status_pagamento: normalizePaymentStatus(statusByUserId[item.usuario_id]),
  }))
}

function mapWeeklyRowSnapshot(row) {
  return {
    usuario_id: row.usuario_id,
    semana_inicio: row.semana_inicio,
    semana_fim: row.semana_fim,
    total_servicos: Number(row.total_servicos || 0),
    total_vendido: Number(row.total_vendido || 0),
    total_recebido: Number(row.total_recebido ?? 0),
    total_pendente: Number(row.total_pendente ?? 0),
    total_comissao: Number(row.total_comissao || 0),
    status_pagamento: normalizePaymentStatus(row.status_pagamento),
    pago_em: row.pago_em || null,
    fechado_por: row.fechado_por || null,
  }
}

export async function listAttendances(filters = {}) {
  let query = supabase
    .from('atendimentos')
    .select(
      'id, venda_id, usuario_id, cliente_nome, servico_id, valor_servico, percentual_comissao, valor_comissao, data_hora, created_at, venda:vendas(id,status_pagamento,forma_pagamento,valor_total,valor_pago,data_pagamento,observacao_pagamento), usuario:usuarios(nome,tipo,tipo_remuneracao,recebe_comissao,percentual_comissao,participa_fechamento_comissao), servico:servicos(nome)',
    )
    .order('data_hora', { ascending: false })

  if (filters.usuarioId) query = query.eq('usuario_id', filters.usuarioId)
  if (filters.startDate) query = query.gte('data_hora', `${filters.startDate}T00:00:00`)
  if (filters.endDate) query = query.lte('data_hora', `${filters.endDate}T23:59:59`)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function saveAttendance(payload) {
  const { error: rpcError } = await supabase.rpc('registrar_atendimento', {
    p_usuario_id: payload.usuario_id,
    p_cliente_nome: payload.cliente_nome,
    p_servico_id: payload.servico_id,
    p_valor_informado: payload.valor_servico,
    p_data_hora: payload.data_hora,
  })

  if (rpcError) throw rpcError
}

export async function saveAttendanceBatch(payload) {
  const items = (payload.items || []).map((item) => ({
    servico_id: item.servico_id,
    valor_informado: Number(item.valor_servico || 0),
  }))

  const { data, error } = await supabase.rpc('registrar_venda', {
    p_usuario_id: payload.usuario_id,
    p_cliente_nome: payload.cliente_nome,
    p_data_hora: payload.data_hora,
    p_itens: items,
  })

  if (error) throw error
  return data
}

export async function markVendaPago(payload) {
  const { error } = await supabase.rpc('marcar_venda_pago', {
    p_venda_id: payload.vendaId,
    p_forma_pagamento: payload.formaPagamento ?? null,
    p_valor_pago: payload.valorPago != null ? Number(payload.valorPago) : null,
    p_observacao: payload.observacao ?? null,
    p_marcado_por: payload.userId ?? null,
  })
  if (error) throw error
}

export async function getWeeklySummaryByEmployee(startDate, endDate) {
  assertBarberWeekRange(startDate, endDate)
  const { data, error } = await supabase.rpc('resumo_semanal_por_funcionario', {
    p_inicio: startDate,
    p_fim: endDate,
  })
  if (error) return []
  return data
}

export async function syncWeeklyClosures(startDate, endDate) {
  assertBarberWeekRange(startDate, endDate)
  const summary = await getWeeklySummaryByEmployee(startDate, endDate)

  const usuarioIds = summary.map((item) => item.usuario_id).filter(Boolean)
  let currentRows = []
  let currentError = null
  const userIdsFilter = usuarioIds.length ? usuarioIds : ['00000000-0000-0000-0000-000000000000']
  const detailedCurrentQuery = supabase
    .from('fechamentos_semanais')
    .select(
      'usuario_id, semana_inicio, semana_fim, total_servicos, total_vendido, total_recebido, total_pendente, total_comissao, status_pagamento, pago_em, fechado_por',
    )
    .eq('semana_inicio', startDate)
    .eq('semana_fim', endDate)
    .in('usuario_id', userIdsFilter)
  const detailedCurrentResult = await detailedCurrentQuery
  currentRows = detailedCurrentResult.data || []
  currentError = detailedCurrentResult.error

  if (currentError) {
    const fallbackCurrentResult = await supabase
      .from('fechamentos_semanais')
      .select(
        'usuario_id, semana_inicio, semana_fim, total_servicos, total_vendido, total_recebido, total_pendente, total_comissao, status_pagamento',
      )
      .eq('semana_inicio', startDate)
      .eq('semana_fim', endDate)
      .in('usuario_id', userIdsFilter)
    currentRows = fallbackCurrentResult.data || []
    currentError = fallbackCurrentResult.error
  }

  if (currentError) throw currentError

  const rowsByUserId = (currentRows || []).reduce((acc, row) => {
    acc[row.usuario_id] = row
    return acc
  }, {})

  const openSummary = (summary || []).filter((item) => rowsByUserId[item.usuario_id]?.status_pagamento !== 'pago')
  const statusByUserId = openSummary.reduce((acc, item) => {
    acc[item.usuario_id] = normalizePaymentStatus(rowsByUserId[item.usuario_id]?.status_pagamento)
    return acc
  }, {})
  const recalculatedPayload = mapWeeklySummaryToClosurePayload(openSummary, startDate, endDate, statusByUserId)
  const frozenPaidPayload = Object.values(rowsByUserId)
    .filter((row) => row.status_pagamento === 'pago')
    .map(mapWeeklyRowSnapshot)

  const payload = [...recalculatedPayload, ...frozenPaidPayload]
  if (!payload.length) return []

  const { data, error } = await supabase
    .from('fechamentos_semanais')
    .upsert(payload, { onConflict: 'usuario_id,semana_inicio,semana_fim' })
    .select('id')

  if (error) throw error
  return data || []
}

export async function listWeeklyClosures(startDate, endDate, options = {}) {
  assertBarberWeekRange(startDate, endDate)
  const shouldSync = options.sync !== false
  if (shouldSync) await syncWeeklyClosures(startDate, endDate)

  const { data, error } = await supabase
    .from('fechamentos_semanais')
    .select(
      'id, usuario_id, total_servicos, total_vendido, total_recebido, total_pendente, total_comissao, status_pagamento, usuario:usuarios!fechamentos_semanais_usuario_id_fkey(nome,tipo,tipo_remuneracao,recebe_comissao,participa_fechamento_comissao)',
    )
    .eq('semana_inicio', startDate)
    .eq('semana_fim', endDate)
    .order('total_vendido', { ascending: false })

  if (error) throw error
  return data || []
}

export async function listWeeklyClosuresHistory(limit = 52) {
  const { data, error } = await supabase
    .from('fechamentos_semanais')
    .select(
      'id, usuario_id, semana_inicio, semana_fim, total_servicos, total_vendido, total_recebido, total_pendente, total_comissao, status_pagamento, pago_em, fechado_por, usuario:usuarios!fechamentos_semanais_usuario_id_fkey(nome)',
    )
    .order('semana_inicio', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!error) return (data || []).filter(isValidBarberWeek)

  const fallback = await supabase
    .from('fechamentos_semanais')
    .select(
      'id, usuario_id, semana_inicio, semana_fim, total_servicos, total_vendido, total_recebido, total_pendente, total_comissao, status_pagamento, usuario:usuarios!fechamentos_semanais_usuario_id_fkey(nome)',
    )
    .order('semana_inicio', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (fallback.error) throw fallback.error
  return (fallback.data || []).filter(isValidBarberWeek)
}

export async function getPaidCommissionsByMonth(month) {
  const monthStart = dayjs(month).startOf('month')
  const monthEnd = dayjs(month).endOf('month')

  const preferred = await supabase
    .from('fechamentos_semanais')
    .select('total_comissao, status_pagamento, pago_em, semana_inicio, semana_fim')
    .in('status_pagamento', ['pago', 'PAGO'])

  if (!preferred.error) {
    return (preferred.data || []).reduce((sum, row) => {
      if (!isValidBarberWeek(row)) return sum
      const paidDate = row.pago_em ? dayjs(row.pago_em) : null
      const fallbackWeekDate = row.semana_fim ? dayjs(row.semana_fim) : dayjs(row.semana_inicio)
      const dateToCompare = paidDate?.isValid() ? paidDate : fallbackWeekDate
      const isInMonth =
        (dateToCompare.isAfter(monthStart) || dateToCompare.isSame(monthStart)) &&
        (dateToCompare.isBefore(monthEnd) || dateToCompare.isSame(monthEnd))
      return isInMonth ? sum + Number(row.total_comissao || 0) : sum
    }, 0)
  }

  const fallback = await supabase
    .from('fechamentos_semanais')
    .select('total_comissao, status_pagamento, semana_inicio, semana_fim')
    .in('status_pagamento', ['pago', 'PAGO'])

  if (fallback.error) throw fallback.error
  return (fallback.data || []).reduce((sum, row) => {
    if (!isValidBarberWeek(row)) return sum
    const weekDate = row.semana_fim ? dayjs(row.semana_fim) : dayjs(row.semana_inicio)
    const isInMonth =
      (weekDate.isAfter(monthStart) || weekDate.isSame(monthStart)) &&
      (weekDate.isBefore(monthEnd) || weekDate.isSame(monthEnd))
    return isInMonth ? sum + Number(row.total_comissao || 0) : sum
  }, 0)
}

export async function listCommissionPaymentsHistory(limit = 120) {
  const { data, error } = await supabase
    .from('comissoes_pagamentos')
    .select(
      'id, fechamento_semanal_id, usuario_id, semana_inicio, semana_fim, valor_pago, pago_em, marcado_por, status_registro, snapshot_total_realizado, snapshot_total_recebido, snapshot_total_pendente, usuario:usuarios!comissoes_pagamentos_usuario_id_fkey(nome), marcado_por_usuario:usuarios!comissoes_pagamentos_marcado_por_fkey(nome)',
    )
    .order('pago_em', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).filter(isValidBarberWeek)
}

export async function getCommissionMonthlySummary(month) {
  const monthStart = dayjs(month).startOf('month')
  const monthEnd = dayjs(month).endOf('month')

  const [attendanceRows, closureRows] = await Promise.all([
    listAttendances({
      startDate: monthStart.format('YYYY-MM-DD'),
      endDate: monthEnd.format('YYYY-MM-DD'),
    }),
    listWeeklyClosuresHistory(240),
  ])

  const generated = attendanceRows.reduce(
    (sum, row) => (row.usuario?.recebe_comissao ? sum + Number(row.valor_comissao || 0) : sum),
    0,
  )

  const paid = closureRows.reduce((sum, row) => {
    if (!isValidBarberWeek(row)) return sum
    if (row.status_pagamento !== 'pago') return sum
    const baseDate = row.pago_em ? dayjs(row.pago_em) : dayjs(row.semana_fim)
    const isInsideMonth =
      (baseDate.isAfter(monthStart) || baseDate.isSame(monthStart, 'day')) &&
      (baseDate.isBefore(monthEnd) || baseDate.isSame(monthEnd, 'day'))
    return isInsideMonth ? sum + Number(row.total_comissao || 0) : sum
  }, 0)

  return {
    gerada: generated,
    paga: paid,
    pendente: Math.max(generated - paid, 0),
  }
}

export async function getCommissionByEmployeeInMonth(month) {
  const monthStart = dayjs(month).startOf('month')
  const monthEnd = dayjs(month).endOf('month')
  const [attendanceRows, closureRows] = await Promise.all([
    listAttendances({
      startDate: monthStart.format('YYYY-MM-DD'),
      endDate: monthEnd.format('YYYY-MM-DD'),
    }),
    listWeeklyClosuresHistory(260),
  ])

  const byEmployee = attendanceRows.reduce((acc, row) => {
    if (!row.usuario?.recebe_comissao) return acc
    const key = row.usuario_id
    if (!acc[key]) {
      acc[key] = {
        usuario_id: key,
        funcionario: row.usuario?.nome || 'Sem nome',
        total_vendido: 0,
        comissao_gerada: 0,
        comissao_paga: 0,
        ultimo_pagamento: null,
      }
    }
    acc[key].total_vendido += Number(row.valor_servico || 0)
    acc[key].comissao_gerada += Number(row.valor_comissao || 0)
    return acc
  }, {})

  closureRows.forEach((row) => {
    if (!isValidBarberWeek(row)) return
    if (row.status_pagamento !== 'pago') return
    if (!byEmployee[row.usuario_id]) return
    const paidDate = row.pago_em ? dayjs(row.pago_em) : dayjs(row.semana_fim)
    const isInsideMonth =
      (paidDate.isAfter(monthStart) || paidDate.isSame(monthStart, 'day')) &&
      (paidDate.isBefore(monthEnd) || paidDate.isSame(monthEnd, 'day'))
    if (!isInsideMonth) return
    byEmployee[row.usuario_id].comissao_paga += Number(row.total_comissao || 0)
    if (
      !byEmployee[row.usuario_id].ultimo_pagamento ||
      dayjs(byEmployee[row.usuario_id].ultimo_pagamento).isBefore(paidDate)
    ) {
      byEmployee[row.usuario_id].ultimo_pagamento = paidDate.toISOString()
    }
  })

  return Object.values(byEmployee)
    .map((row) => ({
      ...row,
      comissao_pendente: Math.max(row.comissao_gerada - row.comissao_paga, 0),
    }))
    .sort((a, b) => b.comissao_gerada - a.comissao_gerada)
}

export async function settlePastWeeklyClosures(referenceWeekStart, userId) {
  const updates = {
    status_pagamento: 'pago',
    pago_em: new Date().toISOString(),
    fechado_por: userId || null,
  }

  let { error } = await supabase
    .from('fechamentos_semanais')
    .update(updates)
    .neq('status_pagamento', 'pago')
    .lt('semana_inicio', referenceWeekStart)

  if (error) {
    const fallback = await supabase
      .from('fechamentos_semanais')
      .update({ status_pagamento: 'pago' })
      .neq('status_pagamento', 'pago')
      .lt('semana_inicio', referenceWeekStart)
    error = fallback.error
  }

  if (error) throw error
}

export async function updateWeeklyClosureStatus(closureId, status, options = {}) {
  const normalizedStatus = normalizePaymentStatus(status)
  const updates = { status_pagamento: normalizedStatus }
  if (normalizedStatus === 'pago') {
    updates.pago_em = new Date().toISOString()
    updates.fechado_por = options.userId || null
  } else {
    updates.pago_em = null
    updates.fechado_por = null
  }

  let { data, error } = await supabase
    .from('fechamentos_semanais')
    .update(updates)
    .eq('id', closureId)
    .select('id, usuario_id, semana_inicio, semana_fim, total_comissao, total_vendido, total_recebido, total_pendente, pago_em')
    .maybeSingle()

  if (error) {
    const fallback = await supabase
      .from('fechamentos_semanais')
      .update({ status_pagamento: normalizedStatus })
      .eq('id', closureId)
      .select('id, usuario_id, semana_inicio, semana_fim, total_comissao, total_vendido, total_recebido, total_pendente, pago_em')
      .maybeSingle()
    error = fallback.error
    data = fallback.data
  }

  if (error) throw error

  if (!data) return

  if (normalizedStatus === 'pago') {
    const { error: paymentError } = await supabase.from('comissoes_pagamentos').upsert(
      {
        fechamento_semanal_id: data.id,
        usuario_id: data.usuario_id,
        semana_inicio: data.semana_inicio,
        semana_fim: data.semana_fim,
        valor_pago: Number(data.total_comissao || 0),
        pago_em: data.pago_em || new Date().toISOString(),
        marcado_por: options.userId || null,
        status_registro: 'pago',
        snapshot_total_realizado: Number(data.total_vendido || 0),
        snapshot_total_recebido: Number(data.total_recebido ?? 0),
        snapshot_total_pendente: Number(data.total_pendente ?? 0),
      },
      { onConflict: 'fechamento_semanal_id' },
    )
    if (paymentError) throw paymentError
    return
  }

  const { error: reopenError } = await supabase
    .from('comissoes_pagamentos')
    .update({ status_registro: 'reaberto' })
    .eq('fechamento_semanal_id', data.id)
  if (reopenError) throw reopenError
}
