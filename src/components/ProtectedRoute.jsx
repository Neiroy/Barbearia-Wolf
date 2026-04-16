import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { normalizeRole } from '../lib/auth'

export function ProtectedRoute({ children, allow }) {
  const { loading, profile } = useAuth()
  const role = normalizeRole(profile?.tipo)

  if (loading) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(15,23,42,0.85),transparent_50%)]" />
        <div className="relative z-10 flex flex-col items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/70 px-6 py-5 shadow-[0_20px_50px_rgba(2,6,23,0.35)] backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
          <p className="text-sm font-medium text-slate-200">Carregando painel...</p>
          <p className="text-xs text-slate-500">Validando sua sessao com seguranca</p>
        </div>
      </div>
    )
  }
  if (!profile) return <Navigate to="/login" replace />
  if (!allow.includes(role)) return <Navigate to="/" replace />

  return children
}
