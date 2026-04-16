import { supabase } from '../../lib/supabase'

export async function listServices() {
  const { data, error } = await supabase
    .from('servicos')
    .select('*')
    .eq('ativo', true)
    .order('ordem')
    .order('nome')
  if (error) throw error
  return data
}

export async function saveService(payload) {
  const query = payload.id
    ? supabase.from('servicos').update(payload).eq('id', payload.id)
    : supabase.from('servicos').insert(payload)
  const { error } = await query
  if (error) throw error
}

export async function deleteService(id) {
  const { error } = await supabase.from('servicos').delete().eq('id', id)
  if (error) throw error
}
