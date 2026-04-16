export function StatCard({ label, value, hint }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] transition hover:border-sky-500/30">
      <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_55%)]" />
      <p className="relative text-sm text-slate-400">{label}</p>
      <p className="relative mt-2 text-2xl font-semibold text-slate-100">{value}</p>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </article>
  )
}
