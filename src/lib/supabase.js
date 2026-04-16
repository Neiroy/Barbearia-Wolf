import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
const urlIsValid = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)
const keyIsValid = supabaseAnonKey.length > 20
const authStorage = typeof window !== 'undefined' ? window.sessionStorage : undefined

if (!urlIsValid || !keyIsValid) {
  console.warn('Variaveis Supabase invalidas. Revise VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
}

export const hasValidSupabaseConfig = urlIsValid && keyIsValid

export const supabase = createClient(
  urlIsValid ? supabaseUrl : 'https://invalid.supabase.co',
  keyIsValid ? supabaseAnonKey : 'invalid-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'barbearia-wolf-auth',
      storage: authStorage,
    },
  },
)

export async function checkSupabaseConnection(timeoutMs = 8000) {
  if (!hasValidSupabaseConfig) {
    return { ok: false, message: 'Configuracao do Supabase invalida no .env.' }
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs),
  )

  try {
    const response = await Promise.race([
      fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: supabaseAnonKey },
      }),
      timeoutPromise,
    ])
    if (!response.ok) {
      return { ok: false, message: 'Supabase respondeu com erro. Verifique URL e chave anon.' }
    }
    return { ok: true, message: 'Conexao com Supabase OK.' }
  } catch {
    return {
      ok: false,
      message: 'Nao foi possivel conectar ao Supabase (rede, firewall, proxy ou DNS).',
    }
  }
}

export async function signInWithPasswordFallback(email, password, timeoutMs = 15000) {
  if (!hasValidSupabaseConfig) {
    throw new Error('Configuracao do Supabase invalida no .env.')
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout de conexão com o Supabase.')), timeoutMs),
  )

  const requestPromise = fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const response = await Promise.race([requestPromise, timeoutPromise])
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.message || 'Falha no login via fallback.')
  }

  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  })

  if (error) {
    throw error
  }

  return data
}
