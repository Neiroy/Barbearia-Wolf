const mapClassByStatus = {
  pago: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_0_1px_rgba(16,185,129,0.2)]',
  aberto: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]',
  pendente: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 shadow-[0_0_0_1px_rgba(6,182,212,0.2)]',
}

export function StatusBadge({ value }) {
  const normalized = String(value || '').toLowerCase()
  const classes = mapClassByStatus[normalized] ?? 'bg-slate-800 text-slate-300 border-slate-700'
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${classes}`}>
      {value}
    </span>
  )
}
