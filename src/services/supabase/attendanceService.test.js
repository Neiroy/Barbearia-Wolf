import { describe, expect, it } from 'vitest'
import { mapWeeklySummaryToClosurePayload } from './attendanceService'

describe('attendanceService fechamento semanal', () => {
  it('monta payload de fechamento com status preservado', () => {
    const summary = [
      { usuario_id: 'u1', total_atendimentos: 3, total_vendido: 120, total_comissao: 48 },
      { usuario_id: 'u2', total_atendimentos: 2, total_vendido: 90, total_comissao: 36 },
    ]
    const statusByUserId = { u1: 'pago' }

    const payload = mapWeeklySummaryToClosurePayload(
      summary,
      '2026-04-13',
      '2026-04-19',
      statusByUserId,
    )

    expect(payload).toEqual([
      {
        usuario_id: 'u1',
        semana_inicio: '2026-04-13',
        semana_fim: '2026-04-19',
        total_servicos: 3,
        total_vendido: 120,
        total_comissao: 48,
        status_pagamento: 'pago',
      },
      {
        usuario_id: 'u2',
        semana_inicio: '2026-04-13',
        semana_fim: '2026-04-19',
        total_servicos: 2,
        total_vendido: 90,
        total_comissao: 36,
        status_pagamento: 'aberto',
      },
    ])
  })
})
