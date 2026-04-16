/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const toneClasses = {
  success: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  error: 'border-red-500/35 bg-red-500/10 text-red-300',
  info: 'border-slate-600 bg-slate-900/95 text-slate-200',
}

const toneIcon = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    ({ title, description = '', tone = 'info', duration = 3200 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((current) => [...current, { id, title, description, tone }])
      window.setTimeout(() => removeToast(id), duration)
    },
    [removeToast],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone] || Info
          const classes = toneClasses[toast.tone] || toneClasses.info
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-xl border px-3 py-2 shadow-[0_14px_35px_rgba(2,6,23,0.35)] backdrop-blur ${classes}`}
            >
              <div className="flex items-start gap-2">
                <Icon size={16} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{toast.title}</p>
                  {toast.description ? <p className="mt-1 text-xs opacity-90">{toast.description}</p> : null}
                </div>
                <button
                  type="button"
                  className="rounded p-0.5 text-current/75 transition hover:bg-black/20 hover:text-current"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Fechar toast"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast deve ser usado dentro de ToastProvider.')
  }
  return context
}
