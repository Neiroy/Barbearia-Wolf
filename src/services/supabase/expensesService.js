import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'

export async function listExpenses(month) {
  const start = dayjs(month).startOf('month').format('YYYY-MM-DD')
  const end = dayjs(month).endOf('month').format('YYYY-MM-DD')
  const { data, error } = await supabase
    .from('gastos')
    .select('*')
    .gte('data', start)
    .lte('data', end)
    .order('data', { ascending: false })
  if (error) throw error
  return data
}

export async function saveExpense(payload) {
  const query = payload.id
    ? supabase.from('gastos').update(payload).eq('id', payload.id)
    : supabase.from('gastos').insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw error
}
