export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 md:flex-row md:items-end md:justify-between">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.08),transparent_45%)]" />
      <div className="relative">
        {eyebrow ? <p className="text-xs uppercase tracking-[0.22em] text-sky-400">{eyebrow}</p> : null}
        <h2 className="mt-1 text-2xl font-semibold text-slate-100 md:text-3xl">{title}</h2>
        {description ? <p className="mt-2 text-sm text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="relative flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
