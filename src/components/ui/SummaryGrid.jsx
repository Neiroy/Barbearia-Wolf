export function SummaryGrid({ children, columns = 3 }) {
  const className =
    columns === 5
      ? 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5'
      : columns === 4
        ? 'sm:grid-cols-2 xl:grid-cols-4'
        : 'sm:grid-cols-2 xl:grid-cols-3'
  return <div className={`grid gap-3 ${className}`}>{children}</div>
}

export function CurrencyCard({ label, value, hint }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-sky-500/30">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_55%)]" />
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-sky-400">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}
