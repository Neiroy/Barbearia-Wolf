export function EmptyState({ title = 'Sem dados', description = 'Nada para exibir no momento.' }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-6 text-center">
      <p className="text-base font-medium text-slate-200">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  )
}

export function LoadingState({ label = 'Carregando dados...' }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
      {label}
    </div>
  )
}

export function ErrorState({ message = 'Ocorreu um erro ao carregar os dados.' }) {
  return (
    <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-200">
      {message}
    </div>
  )
}
