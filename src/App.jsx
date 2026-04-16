import { Suspense, lazy } from 'react'
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { normalizeRole } from './lib/auth.js'

const LoginPage = lazy(() =>
  import('./pages/LoginPage.jsx').then((module) => ({ default: module.LoginPage })),
)
const AdminDashboardPage = lazy(() =>
  import('./modules/admin/pages/AdminDashboardPage.jsx').then((module) => ({
    default: module.AdminDashboardPage,
  })),
)
const AdminStaffPage = lazy(() =>
  import('./modules/admin/pages/AdminStaffPage.jsx').then((module) => ({
    default: module.AdminStaffPage,
  })),
)
const AdminServicesPage = lazy(() =>
  import('./modules/admin/pages/AdminServicesPage.jsx').then((module) => ({
    default: module.AdminServicesPage,
  })),
)
const AdminAttendancesPage = lazy(() =>
  import('./modules/admin/pages/AdminAttendancesPage.jsx').then((module) => ({
    default: module.AdminAttendancesPage,
  })),
)
const AdminWeeklyReportsPage = lazy(() =>
  import('./modules/admin/pages/AdminWeeklyReportsPage.jsx').then((module) => ({
    default: module.AdminWeeklyReportsPage,
  })),
)
const AdminFinancePage = lazy(() =>
  import('./modules/admin/pages/AdminFinancePage.jsx').then((module) => ({
    default: module.AdminFinancePage,
  })),
)
const EmployeeDashboardPage = lazy(() =>
  import('./modules/employee/pages/EmployeeDashboardPage.jsx').then((module) => ({
    default: module.EmployeeDashboardPage,
  })),
)
const EmployeeNewAttendancePage = lazy(() =>
  import('./modules/employee/pages/EmployeeNewAttendancePage.jsx').then((module) => ({
    default: module.EmployeeNewAttendancePage,
  })),
)
const EmployeeMyAttendancesPage = lazy(() =>
  import('./modules/employee/pages/EmployeeMyAttendancesPage.jsx').then((module) => ({
    default: module.EmployeeMyAttendancesPage,
  })),
)
const EmployeeWeeklySummaryPage = lazy(() =>
  import('./modules/employee/pages/EmployeeWeeklySummaryPage.jsx').then((module) => ({
    default: module.EmployeeWeeklySummaryPage,
  })),
)

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-slate-300">
      Carregando tela...
    </div>
  )
}

function LazyPage({ children }) {
  return <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>
}

function HomeRedirect() {
  const { profile } = useAuth()
  const role = normalizeRole(profile?.tipo)

  if (!profile) {
    return <Navigate to="/login" replace />
  }

  return role === 'admin'
    ? <Navigate to="/admin/dashboard" replace />
    : <Navigate to="/funcionario/dashboard" replace />
}

function App() {
  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            <LazyPage>
              <LoginPage />
            </LazyPage>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allow={['admin']}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route
            path="dashboard"
            element={
              <LazyPage>
                <AdminDashboardPage />
              </LazyPage>
            }
          />
          <Route
            path="funcionarios"
            element={
              <LazyPage>
                <AdminStaffPage />
              </LazyPage>
            }
          />
          <Route
            path="servicos"
            element={
              <LazyPage>
                <AdminServicesPage />
              </LazyPage>
            }
          />
          <Route
            path="atendimentos"
            element={
              <LazyPage>
                <AdminAttendancesPage />
              </LazyPage>
            }
          />
          <Route
            path="novo-atendimento"
            element={
              <LazyPage>
                <EmployeeNewAttendancePage />
              </LazyPage>
            }
          />
          <Route
            path="relatorios-semanais"
            element={
              <LazyPage>
                <AdminWeeklyReportsPage />
              </LazyPage>
            }
          />
          <Route
            path="financeiro-mensal"
            element={
              <LazyPage>
                <AdminFinancePage />
              </LazyPage>
            }
          />
        </Route>
        <Route
          path="/funcionario"
          element={
            <ProtectedRoute allow={['funcionario']}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route
            path="dashboard"
            element={
              <LazyPage>
                <EmployeeDashboardPage />
              </LazyPage>
            }
          />
          <Route
            path="novo-atendimento"
            element={
              <LazyPage>
                <EmployeeNewAttendancePage />
              </LazyPage>
            }
          />
          <Route
            path="meus-atendimentos"
            element={
              <LazyPage>
                <EmployeeMyAttendancesPage />
              </LazyPage>
            }
          />
          <Route
            path="resumo-semanal"
            element={
              <LazyPage>
                <EmployeeWeeklySummaryPage />
              </LazyPage>
            }
          />
        </Route>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </Router>
  )
}

export default App
