import { createClient } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export async function listEmployees() {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .is('excluido_logico_em', null)
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

export async function reactivateEmployeeByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) throw new Error('E-mail invalido para reativacao.')

  const { data, error } = await supabase
    .from('usuarios')
    .update({
      ativo: true,
      desativado_em: null,
      excluido_logico_em: null,
    })
    .eq('email', normalizedEmail)
    .select('id, email')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Funcionario nao encontrado para reativacao.')
  return data
}

function normalizeEmailLocalPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
}

export async function createEmployeeAuthUser({
  nome,
  emailLocalPart,
  password,
  percentualComissao = 40,
}) {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
  const localPart = normalizeEmailLocalPart(emailLocalPart || nome)
  if (!localPart) throw new Error('Informe um nome de usuario valido para o e-mail.')

  const email = `${localPart}@barbeariawolf.com`

  const { data: existingUser, error: existingUserError } = await supabase
    .from('usuarios')
    .select('id, ativo, excluido_logico_em')
    .eq('email', email)
    .maybeSingle()

  if (existingUserError) throw existingUserError

  if (existingUser) {
    const isInactive = existingUser.ativo === false || existingUser.excluido_logico_em != null
    if (isInactive) {
      throw new Error('Ja existe um funcionario com este e-mail (inativo). Reative o perfil existente.')
    }
    throw new Error('Ja existe um funcionario com este e-mail.')
  }

  const isolatedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await isolatedClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome,
        tipo: 'funcionario',
        tipo_remuneracao: 'comissionado',
        recebe_comissao: true,
        percentual_comissao: Number(percentualComissao || 40),
        participa_fechamento_comissao: true,
      },
    },
  })

  if (error) throw error

  const userId = data.user?.id || null
  if (!userId) {
    throw new Error('Nao foi possivel obter o ID do usuario criado no Auth.')
  }

  // Fallback de consistencia: garante o perfil em public.usuarios
  // mesmo quando o trigger auth.users -> public.usuarios nao rodou.
  const { error: upsertError } = await supabase.from('usuarios').upsert(
    {
      id: userId,
      nome: String(nome || '').trim(),
      email,
      tipo: 'funcionario',
      tipo_remuneracao: 'comissionado',
      recebe_comissao: true,
      percentual_comissao: Number(percentualComissao || 40),
      participa_fechamento_comissao: true,
      ativo: true,
      desativado_em: null,
      excluido_logico_em: null,
    },
    { onConflict: 'id' },
  )

  if (upsertError) {
    if (upsertError.code === '23505' || upsertError.message?.includes('usuarios_email_key')) {
      throw new Error('Ja existe um funcionario com este e-mail.')
    }
    throw upsertError
  }
  return { email, userId }
}
