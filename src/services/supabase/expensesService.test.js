import { describe, expect, it } from 'vitest'
import { buildRecurringInsertPayload } from './expensesService'

describe('expensesService recorrencia mensal', () => {
  it('gera apenas os fixos recorrentes faltantes do mes', () => {
    const templates = [
      { id: 't1', descricao: 'Aluguel', valor: 1000, criado_por: 'u1' },
      { id: 't2', descricao: 'Internet', valor: 150, criado_por: 'u1' },
    ]
    const monthRows = [{ id: 'g1', origem_recorrente_id: 't1' }]
    const payload = buildRecurringInsertPayload(templates, monthRows, '2026-04-01')

    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({
      descricao: 'Internet',
      origem_recorrente_id: 't2',
      competencia_mes: '2026-04-01',
      data: '2026-04-01',
    })
  })
})
