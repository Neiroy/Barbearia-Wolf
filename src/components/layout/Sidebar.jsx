import { BarChart3, CalendarCheck, ClipboardList, DollarSign, Home, LogOut, Scissors } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

const adminSections = [
  {
    title: 'Gestao',
    items: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: Home },
      { to: '/admin/funcionarios', label: 'Funcionarios', icon: ClipboardList },
      { to: '/admin/servicos', label: 'Servicos', icon: Scissors },
    ],
  },
  {
    title: 'Operacao',
    items: [
      { to: '/admin/atendimentos', label: 'Atendimentos', icon: CalendarCheck },
      { to: '/admin/novo-atendimento', label: 'Lancar Atendimento', icon: CalendarCheck },
      { to: '/admin/relatorios-semanais', label: 'Fechamento Semanal', icon: BarChart3 },
    ],
  },
  {
    title: 'Financeiro',
    items: [{ to: '/admin/financeiro-mensal', label: 'Financeiro Mensal', icon: DollarSign }],
  },
]

const employeeSections = [
  {
    title: 'Operacao',
    items: [
      { to: '/funcionario/dashboard', label: 'Dashboard', icon: Home },
      { to: '/funcionario/novo-atendimento', label: 'Novo Atendimento', icon: CalendarCheck },
      { to: '/funcionario/meus-atendimentos', label: 'Meus Atendimentos', icon: ClipboardList },
    ],
  },
  {
    title: 'Desempenho',
    items: [{ to: '/funcionario/resumo-semanal', label: 'Resumo Semanal', icon: BarChart3 }],
  },
]

export function Sidebar({ role, profileName, onSignOut, onNavigate }) {
  const sections = role === 'admin' ? adminSections : employeeSections

  return (
    <aside className="h-full overflow-y-auto border-r border-slate-800 bg-slate-900 p-4 pt-12 lg:p-6 lg:pt-6">
      <Link
        to="/"
        onClick={onNavigate}
        className="mb-8 block rounded-2xl border border-sky-500/40 bg-slate-950/90 p-4 shadow-[0_0_20px_rgba(56,189,248,0.08)]"
      >
        <div className="flex items-center gap-3">
          <img
            src="/logo-wolf.png"
            alt="Logo Barbearia Wolf"
            className="h-14 w-14 rounded-xl border border-slate-700 object-cover"
          />
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-sky-400">BarbeariaWolf</p>
            <h1 className="text-xl font-semibold leading-tight text-slate-100">Sistema Premium</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {role === 'admin' ? 'Painel de gestao' : 'Painel do funcionario'}
            </p>
          </div>
        </div>
      </Link>

      <nav className="space-y-5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 px-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">{section.title}</p>
            <div className="space-y-2">
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                        isActive
                          ? 'border border-sky-500/50 bg-sky-500/15 text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.12)]'
                          : 'border border-transparent text-slate-200 hover:border-slate-700 hover:bg-slate-800/80'
                      }`
                    }
                  >
                    <Icon size={17} className="shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">{profileName}</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-sky-400">{role || '-'}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          onNavigate?.()
          onSignOut()
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2.5 text-sm font-medium hover:bg-slate-800"
      >
        <LogOut size={16} />
        Sair
      </button>
    </aside>
  )
}
