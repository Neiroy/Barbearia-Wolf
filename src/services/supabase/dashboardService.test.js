import { describe, expect, it } from 'vitest'
import {
  calculateMonthlyFinancial,
  calculateWeeklySummary,
  groupAttendancesByCombo,
} from './dashboardService'

describe('dashboardService regras financeiras', () => {
  it('agrupa itens de combo por venda_id', () => {
    const rows = [
      { venda_id: 'v1', usuario_id: 'u1', cliente_nome: 'A', data_hora: '2026-01-01T10:00:00Z', valor_servico: 30, valor_comissao: 12 },
      { venda_id: 'v1', usuario_id: 'u1', cliente_nome: 'A', data_hora: '2026-01-01T10:00:00Z', valor_servico: 20, valor_comissao: 8 },
      { venda_id: 'v2', usuario_id: 'u2', cliente_nome: 'B', data_hora: '2026-01-01T11:00:00Z', valor_servico: 40, valor_comissao: 16 },
    ]

    const grouped = groupAttendancesByCombo(rows)
    expect(grouped).toHaveLength(2)
    expect(grouped.find((row) => row.venda_id === 'v1')?.valor_servico).toBe(50)
  })

  it('calcula resumo semanal por combos (nao por item)', () => {
    const rows = [
      { venda_id: 'v1', usuario_id: 'u1', cliente_nome: 'A', data_hora: '2026-01-01T10:00:00Z', valor_servico: 30, valor_comissao: 12 },
      { venda_id: 'v1', usuario_id: 'u1', cliente_nome: 'A', data_hora: '2026-01-01T10:00:00Z', valor_servico: 20, valor_comissao: 8 },
      { venda_id: 'v2', usuario_id: 'u2', cliente_nome: 'B', data_hora: '2026-01-01T11:00:00Z', valor_servico: 40, valor_comissao: 16 },
    ]

    const summary = calculateWeeklySummary(rows)
    expect(summary.totalServicos).toBe(2)
    expect(summary.totalVendido).toBe(90)
    expect(summary.totalComissao).toBe(36)
  })

  it('exclui dono/admin sem comissao do custo total de comissoes', () => {
    const attendances = [
      { valor_servico: 100, valor_comissao: 0, usuario: { recebe_comissao: false } },
      { valor_servico: 80, valor_comissao: 32, usuario: { recebe_comissao: true } },
      { valor_servico: 50, valor_comissao: 20, usuario: { recebe_comissao: true } },
    ]
    const expenses = [{ valor: 30 }]

    const monthly = calculateMonthlyFinancial(attendances, expenses)
    expect(monthly.totalEntradas).toBe(230)
    expect(monthly.faturamentoAdminDono).toBe(100)
    expect(monthly.faturamentoFuncionarios).toBe(130)
    expect(monthly.totalComissoes).toBe(52)
    expect(monthly.lucroBruto).toBe(178)
    expect(monthly.lucroLiquido).toBe(148)
  })
})
