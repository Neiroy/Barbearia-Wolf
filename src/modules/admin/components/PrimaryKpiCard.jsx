export function PrimaryKpiCard({ title, value, subtitle, icon }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-900/95 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_52%)]" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold leading-tight text-slate-100 lg:text-4xl">{value}</p>
          <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
        </div>
        <span className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5 text-sky-300">
          {icon}
        </span>
      </div>
    </article>
  )
}
