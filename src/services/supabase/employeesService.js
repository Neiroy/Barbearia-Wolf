import { supabase } from '../../lib/supabase'

export async function listEmployees() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('ativo', { ascending: false })
    .order('tipo', { ascending: false })
    .order('nome', { ascending: true })
  if (error) throw error
  return data
}

export async function saveEmployee(payload) {
  const { error } = await supabase.from('usuarios').update(payload).eq('id', payload.id)
  if (error) throw error
}

export async function setEmployeeStatus({ id, ativo, excluirLogico = false }) {
  const { error } = await supabase.rpc('definir_status_usuario', {
    p_usuario_id: id,
    p_ativo: ativo,
    p_excluir_logico: excluirLogico,
  })
  if (error) throw error
}
