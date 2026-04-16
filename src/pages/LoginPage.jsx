import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { checkSupabaseConnection, hasValidSupabaseConfig } from '../lib/supabase'

export function LoginPage() {
  const { profile, signIn } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [connectionState, setConnectionState] = useState({
    loading: true,
    ok: false,
    message: 'Testando conexão com Supabase...',
  })

  useEffect(() => {
    async function runConnectionCheck() {
      const result = await checkSupabaseConnection()
      setConnectionState({
        loading: false,
        ok: result.ok,
        message: result.message,
      })
    }

    runConnectionCheck()
  }, [])

  if (profile) return <Navigate to="/" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!hasValidSupabaseConfig) {
      setError('Configuracao do Supabase invalida no .env.')
      return
    }
    setLoading(true)
    try {
      await signIn(form.email, form.password)
    } catch (err) {
      if (err.message === 'Invalid login credentials') {
        setError('Credenciais inválidas. Verifique e-mail e senha cadastrados no Supabase Auth.')
      } else if (err.message?.includes('Failed to fetch')) {
        setError('Falha de conexão com o Supabase. Verifique internet, firewall e URL do projeto.')
      } else if (err.message?.includes('Timeout de conexão')) {
        setError('Tempo de conexão excedido com o Supabase. Tente novamente em instantes.')
      } else if (err.message?.includes('sem perfil na tabela usuarios')) {
        setError('Login realizado, mas falta vincular o usuario na tabela public.usuarios.')
      } else {
        setError(err.message ?? 'Falha no login')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.14),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(15,23,42,0.8),transparent_50%)]" />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-700/80 bg-slate-900/95 p-8 shadow-premium backdrop-blur-sm"
      >
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="rounded-2xl border border-slate-700/70 bg-black/40 p-2 shadow-[0_0_30px_rgba(56,189,248,0.09)]">
            <img
              src="/logo-wolf.png"
              alt="Logo Barbearia Wolf"
              className="h-24 w-24 rounded-xl object-cover md:h-28 md:w-28"
            />
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-sky-400">Barbearia Wolf</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Painel de Acesso</h1>
          <p className="mt-2 text-sm text-slate-400">Sistema interno para admin e funcionario.</p>
        </div>
        {!connectionState.ok && !connectionState.loading ? (
          <p className="mt-3 text-sm text-sky-300">{connectionState.message}</p>
        ) : null}

        <div className="mt-6 space-y-4">
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">E-mail</p>
            <input
              type="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => setForm((old) => ({ ...old, email: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              required
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-slate-400">Senha</p>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Digite sua senha"
                value={form.password}
                onChange={(e) => setForm((old) => ({ ...old, password: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 pr-24 text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((old) => !old)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-slate-600 bg-slate-900/95 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
        </div>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || connectionState.loading}
          className="mt-6 w-full rounded-lg bg-sky-500 px-4 py-3 font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
