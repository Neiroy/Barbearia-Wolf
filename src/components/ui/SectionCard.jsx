export function SectionCard({ title, subtitle, children, actions }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.015)] md:p-5">
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-4 border-b border-slate-800/80 pb-3">
          <div>
            {title ? <h3 className="text-base font-semibold text-slate-100">{title}</h3> : null}
            {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  )
}
