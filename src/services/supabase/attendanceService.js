import { supabase } from '../../lib/supabase'

export async function listAttendances(filters = {}) {
  let query = supabase
    .from('atendimentos')
    .select(
      'id, venda_id, usuario_id, cliente_nome, servico_id, valor_servico, percentual_comissao, valor_comissao, data_hora, created_at, usuario:usuarios(nome,tipo,tipo_remuneracao,recebe_comissao,percentual_comissao,participa_fechamento_comissao), servico:servicos(nome)',
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

export async function getWeeklySummaryByEmployee(startDate, endDate) {
  const { data, error } = await supabase.rpc('resumo_semanal_por_funcionario', {
    p_inicio: startDate,
    p_fim: endDate,
  })
  if (error) return []
  return data
}

export async function syncWeeklyClosures(startDate, endDate) {
  const summary = await getWeeklySummaryByEmployee(startDate, endDate)
  if (!summary.length) return []

  const usuarioIds = summary.map((item) => item.usuario_id)
  const { data: currentRows, error: currentError } = await supabase
    .from('fechamentos_semanais')
    .select('usuario_id, status_pagamento')
    .eq('semana_inicio', startDate)
    .eq('semana_fim', endDate)
    .in('usuario_id', usuarioIds)

  if (currentError) throw currentError

  const statusByUserId = (currentRows || []).reduce((acc, row) => {
    acc[row.usuario_id] = row.status_pagamento
    return acc
  }, {})

  const payload = summary.map((item) => ({
    usuario_id: item.usuario_id,
    semana_inicio: startDate,
    semana_fim: endDate,
    total_servicos: Number(item.total_atendimentos || 0),
    total_vendido: Number(item.total_vendido || 0),
    total_comissao: Number(item.total_comissao || 0),
    status_pagamento: statusByUserId[item.usuario_id] || 'aberto',
  }))

  const { data, error } = await supabase
    .from('fechamentos_semanais')
    .upsert(payload, { onConflict: 'usuario_id,semana_inicio,semana_fim' })
    .select('id')

  if (error) throw error
  return data || []
}

export async function listWeeklyClosures(startDate, endDate, options = {}) {
  const shouldSync = options.sync !== false
  if (shouldSync) await syncWeeklyClosures(startDate, endDate)

  const { data, error } = await supabase
    .from('fechamentos_semanais')
    .select(
      'id, usuario_id, total_servicos, total_vendido, total_comissao, status_pagamento, usuario:usuarios(nome,tipo,tipo_remuneracao,recebe_comissao,participa_fechamento_comissao)',
    )
    .eq('semana_inicio', startDate)
    .eq('semana_fim', endDate)
    .order('total_vendido', { ascending: false })

  if (error) throw error
  return data || []
}

export async function updateWeeklyClosureStatus(closureId, status) {
  const { error } = await supabase
    .from('fechamentos_semanais')
    .update({ status_pagamento: status })
    .eq('id', closureId)
  if (error) throw error
}
