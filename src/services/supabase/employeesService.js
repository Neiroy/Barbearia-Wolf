import { supabase } from '../../lib/supabase'

export async function listEmployees() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('tipo', { ascending: false })
    .order('nome', { ascending: true })
  if (error) throw error
  return data
}

export async function saveEmployee(payload) {
  const { error } = await supabase.from('usuarios').update(payload).eq('id', payload.id)
  if (error) throw error
}
