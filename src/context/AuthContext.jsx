/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  hasValidSupabaseConfig,
  signInWithPasswordFallback,
  supabase,
} from '../lib/supabase'

const AuthContext = createContext(null)
const PROFILE_CACHE_KEY = 'barbearia-wolf-profile-cache'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function readCachedProfile() {
      if (typeof window === 'undefined') return null
      try {
        const raw = window.sessionStorage.getItem(PROFILE_CACHE_KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }

    function persistProfileCache(nextProfile) {
      if (typeof window === 'undefined') return
      if (!nextProfile) {
        window.sessionStorage.removeItem(PROFILE_CACHE_KEY)
        return
      }
      window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile))
    }

    async function refreshProfileInBackground(userId) {
      try {
        await loadProfile(userId, { throwOnMissing: false, timeoutMs: 5000 })
      } catch {
        // Mantem perfil atual/cached em caso de oscilacao de rede.
      }
    }

    async function bootstrap() {
      try {
        const { data } = await supabase.auth.getSession()
        setSession(data.session)
        if (data.session?.user) {
          const cachedProfile = readCachedProfile()
          if (cachedProfile?.id === data.session.user.id) {
            setProfile(cachedProfile)
            setLoading(false)
            refreshProfileInBackground(data.session.user.id)
            return
          }
          await loadProfile(data.session.user.id, { throwOnMissing: false, timeoutMs: 6000 })
        }
      } catch {
        setSession(null)
        setProfile(null)
        persistProfileCache(null)
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      try {
        setSession(nextSession)
        if (!nextSession?.user) {
          setProfile(null)
          persistProfileCache(null)
          setLoading(false)
          return
        }

        const cachedProfile = readCachedProfile()
        if (cachedProfile?.id === nextSession.user.id) {
          setProfile(cachedProfile)
          setLoading(false)
          refreshProfileInBackground(nextSession.user.id)
          return
        }

        if (event === 'SIGNED_IN') {
          await loadProfile(nextSession.user.id, { throwOnMissing: false, timeoutMs: 6000 })
        } else {
          setLoading(false)
          refreshProfileInBackground(nextSession.user.id)
        }
      } catch {
        // Mantem perfil atual em erros transitórios de rede durante refresh de sessao.
      } finally {
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId, options = { throwOnMissing: true, timeoutMs: 12000 }) {
    const { data, error } = await withTimeout(
      supabase.from('usuarios').select('*').eq('id', userId).single(),
      options.timeoutMs ?? 12000,
    )
    if (error) {
      if (options.throwOnMissing) {
        setProfile(null)
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(PROFILE_CACHE_KEY)
        }
        throw new Error('Usuario autenticado sem perfil na tabela usuarios.')
      }
      return null
    }
    if (!error) {
      setProfile(data)
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data))
      }
    }
    return data
  }

  async function withTimeout(promise, timeoutMs = 30000) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout de conexão com o Supabase.')), timeoutMs),
      ),
    ])
  }

  async function signIn(email, password) {
    if (!hasValidSupabaseConfig) {
      throw new Error('Configuracao do Supabase invalida no .env.')
    }

    let response
    try {
      response = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        30000,
      )
      const { error } = response
      if (error) throw error
    } catch (error) {
      if (
        error.message?.includes('Timeout de conexão') ||
        error.message?.includes('Failed to fetch')
      ) {
        const fallbackData = await signInWithPasswordFallback(email, password, 15000)
        response = { data: { user: fallbackData.user } }
      } else {
        throw error
      }
    }

    const userId = response?.data?.user?.id
    if (!userId) throw new Error('Falha ao obter usuario autenticado.')

    await withTimeout(loadProfile(userId, { throwOnMissing: true }), 12000)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(PROFILE_CACHE_KEY)
    }
  }

  const value = useMemo(
    () => ({ session, profile, loading, signIn, signOut }),
    [session, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
