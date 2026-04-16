function toErrorPayload(error, context = {}) {
  return {
    message: error?.message || 'Erro desconhecido',
    stack: error?.stack || null,
    context,
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
    url: typeof window !== 'undefined' ? window.location.href : null,
  }
}

export function captureAppError(error, context = {}) {
  const payload = toErrorPayload(error, context)
  console.error('[observability]', payload)

  const webhookUrl = (import.meta.env.VITE_ERROR_WEBHOOK_URL || '').trim()
  if (!webhookUrl || typeof fetch === 'undefined') return

  try {
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Ignora falhas de telemetria para nao impactar a aplicacao.
  }
}
