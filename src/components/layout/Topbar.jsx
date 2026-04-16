import { Menu } from 'lucide-react'

export function Topbar({ onMenuToggle }) {
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })

  return (
    <header className="mb-6 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3 sm:px-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        {onMenuToggle ? (
          <button
            type="button"
            onClick={onMenuToggle}
            className="rounded-md border border-slate-700 p-2 text-slate-200 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu size={16} />
          </button>
        ) : null}
        <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operacao diaria</p>
        <p className="text-sm text-slate-300">{today}</p>
        </div>
      </div>
      <div className="inline-flex items-center gap-2 self-start rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-sky-300">
        <img
          src="/logo-wolf.png"
          alt="Logo Wolf"
          className="h-5 w-5 rounded-full border border-slate-600 object-cover"
        />
        Barbearia Wolf
      </div>
    </header>
  )
}
