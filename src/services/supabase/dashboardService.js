import dayjs from 'dayjs'
import { getCommissionMonthlySummary, listAttendances } from './attendanceService'
import { listExpenses } from './expensesService'
import { getBarberWeekRange } from '../../utils/dateRanges'
import { splitRowCashflow, sumCashflowSplits, calculateMonthlyFinancial } from '../../utils/financialCalculations'

export { splitRowCashflow, sumCashflowSplits, calculateMonthlyFinancial } from '../../utils/financialCalculations'

export function groupAttendancesByCombo(attendances) {
  const grouped = attendances.reduce((acc, row) => {
    const comboKey =
      row.venda_id ||
      `${row.usuario_id}|${(row.cliente_nome || '').trim().toLowerCase()}|${dayjs(row.data_hora).format('YYYY-MM-DD HH:mm')}`
    if (!acc[comboKey]) {
      acc[comboKey] = {
        id: comboKey,
        venda_id: row.venda_id || null,
        venda: row.venda || null,
        data_hora: row.data_hora,
        usuario_id: row.usuario_id,
        cliente_nome: row.cliente_nome,
        valor_servico: 0,
        valor_comissao: 0,
      }
    }
    if (row.venda) acc[comboKey].venda = row.venda
    acc[comboKey].valor_servico += Number(row.valor_servico || 0)
    acc[comboKey].valor_comissao += Number(row.valor_comissao || 0)
    return acc
  }, {})

  return Object.values(grouped)
}

export function calculateWeeklySummary(attendances) {
  const groupedAttendances = groupAttendancesByCombo(attendances)
  return groupedAttendances.reduce(
    (acc, current) => {
      acc.totalServicos += 1
      acc.totalVendido += Number(current.valor_servico)
      acc.totalComissao += Number(current.valor_comissao)
      const flow = splitRowCashflow({ valor_servico: current.valor_servico, venda: current.venda })
      acc.totalRecebido += flow.recebido
      acc.totalPendenteReceber += flow.pendente
      return acc
    },
    {
      totalServicos: 0,
      totalVendido: 0,
      totalComissao: 0,
      totalRecebido: 0,
      totalPendenteReceber: 0,
    },
  )
}

export async function getAdminDashboardSnapshot() {
  const today = dayjs().format('YYYY-MM-DD')
  const barberWeek = getBarberWeekRange()
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD')

  const [todayRows, weekRows, monthRows, monthExpenses, commissionSummary] = await Promise.all([
    listAttendances({ startDate: today, endDate: today }),
    listAttendances({ startDate: barberWeek.startDate, endDate: barberWeek.endDate }),
    listAttendances({ startDate: monthStart, endDate: monthEnd }),
    listExpenses(monthStart),
    getCommissionMonthlySummary(monthStart),
  ])

  const groupedMonthAttendances = groupAttendancesByCombo(monthRows)
  const monthly = calculateMonthlyFinancial(monthRows, monthExpenses, commissionSummary.paga)
  const todayCash = sumCashflowSplits(todayRows)
  const weekCash = sumCashflowSplits(weekRows)

  const employeeTotals = weekRows.reduce((acc, row) => {
    const key = row.usuario?.nome || 'Sem nome'
    acc[key] = (acc[key] || 0) + splitRowCashflow(row).realizado
    return acc
  }, {})
  const highlightEmployee =
    Object.entries(employeeTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sem dados'

  const serviceTotals = monthRows.reduce((acc, row) => {
    const key = row.servico?.nome || 'Sem servico'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const mostUsedService = Object.entries(serviceTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Sem dados'

  return {
    todayRevenue: todayCash.realizado,
    todayReceived: todayCash.recebido,
    todayPending: todayCash.pendente,
    weekRevenue: weekCash.realizado,
    weekReceived: weekCash.recebido,
    weekPending: weekCash.pendente,
    monthRevenue: monthly.totalEntradas,
    monthReceived: monthly.totalRecebido,
    monthPending: monthly.totalPendenteReceber,
    monthExpenses: monthly.totalGastos,
    monthCommissions: monthly.totalComissoes,
    monthCommissionsGenerated: monthly.totalComissoes,
    monthCommissionsPaid: monthly.comissaoPaga,
    monthCommissionsPending: monthly.comissaoPendente,
    monthEmployeeRevenue: monthly.faturamentoFuncionarios,
    monthOwnerRevenue: monthly.faturamentoAdminDono,
    monthNetProfit: monthly.lucroLiquido,
    monthGrossProfit: monthly.lucroBruto,
    ticketMedio: groupedMonthAttendances.length ? monthly.totalEntradas / groupedMonthAttendances.length : 0,
    totalAttendances: groupedMonthAttendances.length,
    highlightEmployee,
    mostUsedService,
  }
}
