export function PrimaryKpiCard({ title, value, subtitle, icon, variant = 'default' }) {
  const isHighlight = variant === 'highlight'

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-slate-700/90 bg-slate-900/95 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${
        isHighlight ? 'min-h-[160px] p-5 sm:min-h-[170px] sm:p-6 lg:p-7' : 'min-h-[145px] p-4 sm:min-h-[150px] sm:p-5'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          isHighlight
            ? 'bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.2),transparent_55%)]'
            : 'bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_52%)]'
        }`}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="whitespace-normal break-words text-xs uppercase tracking-[0.16em] text-slate-400">{title}</p>
          <p
            className={`mt-3 whitespace-normal break-all font-semibold leading-tight text-slate-100 ${
              isHighlight ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-xl sm:text-2xl lg:text-3xl'
            }`}
          >
            {value}
          </p>
          {subtitle ? <p className="mt-2 whitespace-normal break-words text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        <span
          className={`shrink-0 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300 ${
            isHighlight ? 'p-3.5' : 'p-2.5'
          }`}
        >
          {icon}
        </span>
      </div>
    </article>
  )
}
