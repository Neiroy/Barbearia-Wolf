export function SectionCard({ title, subtitle, children, actions }) {
  return (
    <section className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/30 md:p-6">
      {(title || actions) && (
        <header className="mb-5 flex flex-col items-start justify-between gap-3 border-b border-slate-800/90 pb-4 sm:flex-row sm:gap-4">
          <div className="min-w-0">
            {title ? <h3 className="text-base font-semibold text-slate-100 sm:text-lg">{title}</h3> : null}
            {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  )
}
