/** Parte financeira (caixa) por linha de atendimento, conforme status da venda. */
export function splitRowCashflow(row) {
  const valor = Number(row.valor_servico || 0)
  const st = row.venda?.status_pagamento
  if (!row.venda) {
    return { realizado: valor, recebido: valor, pendente: 0 }
  }
  if (st === 'pago') return { realizado: valor, recebido: valor, pendente: 0 }
  if (st === 'pendente' || st === 'parcial') return { realizado: valor, recebido: 0, pendente: valor }
  if (st === 'cancelado') return { realizado: valor, recebido: 0, pendente: 0 }
  return { realizado: valor, recebido: 0, pendente: 0 }
}

export function sumCashflowSplits(attendances) {
  return attendances.reduce(
    (acc, row) => {
      const s = splitRowCashflow(row)
      acc.realizado += s.realizado
      acc.recebido += s.recebido
      acc.pendente += s.pendente
      return acc
    },
    { realizado: 0, recebido: 0, pendente: 0 },
  )
}

export function calculateMonthlyFinancial(attendances, expenses, paidCommissions = null) {
  const cash = sumCashflowSplits(attendances)
  const totalEntradas = cash.realizado
  const totalRecebido = cash.recebido
  const totalPendenteReceber = cash.pendente

  const faturamentoFuncionarios = attendances.reduce((sum, row) => {
    if (!row.usuario?.recebe_comissao) return sum
    return sum + splitRowCashflow(row).realizado
  }, 0)
  const faturamentoAdminDono = attendances.reduce((sum, row) => {
    if (row.usuario?.recebe_comissao) return sum
    return sum + splitRowCashflow(row).realizado
  }, 0)
  const totalComissoes = attendances.reduce(
    (sum, row) => (row.usuario?.recebe_comissao ? sum + Number(row.valor_comissao || 0) : sum),
    0,
  )
  const comissaoPaga = Number(paidCommissions ?? 0)
  const comissaoPendente = Math.max(totalComissoes - comissaoPaga, 0)
  const totalGastos = expenses.reduce((sum, row) => sum + Number(row.valor), 0)
  const lucroBruto = totalRecebido - totalComissoes
  const lucroLiquido = lucroBruto - totalGastos

  return {
    totalEntradas,
    totalRecebido,
    totalPendenteReceber,
    faturamentoFuncionarios,
    faturamentoAdminDono,
    totalComissoes,
    comissaoPaga,
    comissaoPendente,
    totalGastos,
    lucroBruto,
    lucroLiquido,
  }
}
