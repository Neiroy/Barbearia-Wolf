import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'

export function buildRecurringInsertPayload(templates, monthRows, monthStart) {
  const templateIds = (templates || []).map((item) => item.id)
  const existingByTemplate = new Set(
    (monthRows || [])
      .filter((row) => templateIds.includes(row.id) || templateIds.includes(row.origem_recorrente_id))
      .map((row) => row.origem_recorrente_id || row.id)
      .filter(Boolean),
  )

  const missing = (templates || []).filter((template) => !existingByTemplate.has(template.id))
  return missing.map((template) => ({
    descricao: template.descricao,
    tipo: 'fixo',
    valor: template.valor,
    recorrente_mensal: false,
    origem_recorrente_id: template.id,
    competencia_mes: monthStart,
    data: monthStart,
    criado_por: template.criado_por,
  }))
}

export async function getMonthlyClosure(month) {
  const monthStart = dayjs(month).startOf('month').format('YYYY-MM-DD')
  const { data, error } = await supabase
    .from('fechamentos_mensais')
    .select('*')
    .eq('referencia_mes', monthStart)
    .maybeSingle()
  if (error) throw error
  return data
}

async function ensureRecurringFixedExpenses(month) {
  const monthStart = dayjs(month).startOf('month').format('YYYY-MM-DD')
  const monthEnd = dayjs(month).endOf('month').format('YYYY-MM-DD')

  const closure = await getMonthlyClosure(monthStart)
  if (closure?.status_fechamento === 'fechado') return

  const { data: templates, error: templatesError } = await supabase
    .from('gastos')
    .select('id, descricao, tipo, valor, data, criado_por, recorrente_mensal')
    .eq('tipo', 'fixo')
    .eq('recorrente_mensal', true)
    .lte('data', monthEnd)

  if (templatesError) throw templatesError
  if (!templates?.length) return

  const { data: monthRows, error: monthRowsError } = await supabase
    .from('gastos')
    .select('id, origem_recorrente_id, competencia_mes')
    .eq('competencia_mes', monthStart)

  if (monthRowsError) throw monthRowsError

  const insertPayload = buildRecurringInsertPayload(templates, monthRows, monthStart)
  if (!insertPayload.length) return

  const { error: insertError } = await supabase.from('gastos').insert(insertPayload)
  if (insertError) throw insertError
}

export async function listExpenses(month) {
  const start = dayjs(month).startOf('month').format('YYYY-MM-DD')

  await ensureRecurringFixedExpenses(month)

  const { data, error } = await supabase
    .from('gastos')
    .select('*')
    .eq('competencia_mes', start)
    .order('data', { ascending: false })
  if (error) throw error
  return data
}

export async function saveExpense(payload) {
  const monthStart = dayjs(payload.data || new Date()).startOf('month').format('YYYY-MM-DD')
  const closure = await getMonthlyClosure(monthStart)
  if (closure?.status_fechamento === 'fechado') {
    throw new Error('Este mês já está fechado. Reabra o mês para editar gastos.')
  }

  const cleanId = typeof payload.id === 'string' ? payload.id.trim() : payload.id
  const cleanTemplateId =
    typeof payload.origem_recorrente_id === 'string'
      ? payload.origem_recorrente_id.trim() || null
      : payload.origem_recorrente_id || null

  const normalizedPayload = {
    ...payload,
    id: cleanId || undefined,
    origem_recorrente_id: cleanTemplateId,
    recorrente_mensal: payload.tipo === 'fixo' ? Boolean(payload.recorrente_mensal) : false,
    competencia_mes: monthStart,
  }

  const query = cleanId
    ? supabase.from('gastos').update(normalizedPayload).eq('id', cleanId)
    : supabase.from('gastos').insert(normalizedPayload)
  const { error } = await query
  if (error) throw error
}

export async function deleteExpense(id) {
  const { data: row, error: rowError } = await supabase.from('gastos').select('competencia_mes').eq('id', id).single()
  if (rowError) throw rowError
  const closure = await getMonthlyClosure(row.competencia_mes)
  if (closure?.status_fechamento === 'fechado') {
    throw new Error('Este mês já está fechado. Reabra o mês para excluir gastos.')
  }

  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw error
}

export async function closeMonthSnapshot({ month, userId, attendances, expenses }) {
  const monthStart = dayjs(month).startOf('month').format('YYYY-MM-DD')
  const totalEntradas = (attendances || []).reduce((sum, row) => sum + Number(row.valor_servico || 0), 0)
  const totalComissoes = (attendances || []).reduce(
    (sum, row) => (row.usuario?.recebe_comissao ? sum + Number(row.valor_comissao || 0) : sum),
    0,
  )
  const totalGastos = (expenses || []).reduce((sum, row) => sum + Number(row.valor || 0), 0)
  const lucroBruto = totalEntradas - totalComissoes
  const lucroLiquido = lucroBruto - totalGastos

  const payload = {
    referencia_mes: monthStart,
    total_entradas: totalEntradas,
    total_gastos: totalGastos,
    total_comissoes: totalComissoes,
    lucro_bruto: lucroBruto,
    lucro_liquido: lucroLiquido,
    status_fechamento: 'fechado',
    fechado_em: new Date().toISOString(),
    fechado_por: userId || null,
  }

  const { error } = await supabase.from('fechamentos_mensais').upsert(payload, { onConflict: 'referencia_mes' })
  if (error) throw error
}

export async function reopenMonthSnapshot(month) {
  const monthStart = dayjs(month).startOf('month').format('YYYY-MM-DD')
  const { error } = await supabase
    .from('fechamentos_mensais')
    .upsert(
      {
        referencia_mes: monthStart,
        status_fechamento: 'aberto',
        fechado_em: null,
        fechado_por: null,
      },
      { onConflict: 'referencia_mes' },
    )
  if (error) throw error
}
