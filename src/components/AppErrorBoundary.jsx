import { Component } from 'react'
import { captureAppError } from '../lib/observability'

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message ?? 'Erro inesperado na aplicação.',
    }
  }

  componentDidCatch(error) {
    captureAppError(error, { source: 'AppErrorBoundary' })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
          <div className="w-full max-w-xl rounded-2xl border border-red-900/60 bg-slate-900 p-6">
            <h1 className="text-2xl font-semibold text-red-300">Falha ao renderizar a tela</h1>
            <p className="mt-3 text-slate-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary mt-5"
            >
              Recarregar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
