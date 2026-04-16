import { Link } from 'react-router-dom'

export function QuickActionLinks({ actions }) {
  return (
    <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.label}
            to={action.to}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-sky-500/40 hover:text-sky-300"
          >
            <Icon size={15} />
            {action.label}
          </Link>
        )
      })}
    </div>
  )
}
