export function Toolbar({ children }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.015)] md:flex-row md:items-center md:justify-between">
      {children}
    </div>
  )
}

export function FilterBar({ children }) {
  return <div className="grid gap-2 md:grid-cols-3">{children}</div>
}
