export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 shadow-lg shadow-slate-950/40 sm:p-6 md:flex-row md:items-end md:justify-between">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_45%)]" />
      <div className="relative max-w-3xl">
        {eyebrow ? <p className="text-xs uppercase tracking-[0.22em] text-sky-400">{eyebrow}</p> : null}
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl md:text-3xl">{title}</h2>
        {description ? <p className="mt-3 text-sm leading-relaxed text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="relative flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
    </div>
  )
}
