import { useState } from 'react'
import { X } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './layout/Sidebar'
import { Topbar } from './layout/Topbar'
import { useAuth } from '../context/AuthContext'
import { normalizeRole } from '../lib/auth'

export function AppShell() {
  const { profile, signOut } = useAuth()
  const role = normalizeRole(profile?.tipo)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="grid w-full grid-cols-1 lg:grid-cols-[280px_1fr]">
        <div
          className={`fixed inset-0 z-40 bg-black/60 transition lg:hidden ${
            isSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[86%] max-w-[320px] -translate-x-full transition-transform lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : ''
          }`}
        >
          <div className="absolute right-3 top-3 lg:hidden">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-md border border-slate-700 bg-slate-900 p-1.5"
              aria-label="Fechar menu"
            >
              <X size={16} />
            </button>
          </div>
          <Sidebar
            role={role}
            profileName={profile?.nome}
            onSignOut={signOut}
            onNavigate={() => setIsSidebarOpen(false)}
          />
        </aside>

        <main className="app-main p-4 sm:p-5 lg:p-8">
          <Topbar onMenuToggle={() => setIsSidebarOpen(true)} />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
