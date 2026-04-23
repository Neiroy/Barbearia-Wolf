import dayjs from 'dayjs'
import { listAttendances } from './attendanceService'
import { listExpenses } from './expensesService'
import { getBarberWeekRange } from '../../utils/dateRanges'

export function groupAttendancesByCombo(attendances) {
  const grouped = attendances.reduce((acc, row) => {
    const comboKey =
      row.venda_id ||
      `${row.usuario_id}|${(row.cliente_nome || '').trim().toLowerCase()}|${dayjs(row.data_hora).format('YYYY-MM-DD HH:mm')}`
    if (!acc[comboKey]) {
      acc[comboKey] = {
        id: comboKey,
        venda_id: row.venda_id || null,
        data_hora: row.data_hora,
        usuario_id: row.usuario_id,
        cliente_nome: row.cliente_nome,
        valor_servico: 0,
        valor_comissao: 0,
      }
    }
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
      return acc
    },
    { totalServicos: 0, totalVendido: 0, totalComissao: 0 },
  )
}

export function calculateMonthlyFinancial(attendances, expenses) {
  const totalEntradas = attendances.reduce((sum, row) => sum + Number(row.valor_servico), 0)
  const faturamentoFuncionarios = attendances.reduce(
    (sum, row) => (row.usuario?.recebe_comissao ? sum + Number(row.valor_servico) : sum),
    0,
  )
  const faturamentoAdminDono = attendances.reduce(
    (sum, row) => (!row.usuario?.recebe_comissao ? sum + Number(row.valor_servico) : sum),
    0,
  )
  const totalComissoes = attendances.reduce(
    (sum, row) => (row.usuario?.recebe_comissao ? sum + Number(row.valor_comissao) : sum),
    0,
  )
  const totalGastos = expenses.reduce((sum, row) => sum + Number(row.valor), 0)
  const lucroBruto = totalEntradas - totalComissoes
  const lucroLiquido = lucroBruto - totalGastos

  return {
    totalEntradas,
    faturamentoFuncionarios,
    faturamentoAdminDono,
    totalComissoes,
    totalGastos,
    lucroBruto,
    lucroLiquido,
  }
}

export async function getAdminDashboardSnapshot() {
  const today = dayjs().format('YYYY-MM-DD')
  const barberWeek = getBarberWeekRange()
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD')

  const [todayRows, weekRows, monthRows, monthExpenses] = await Promise.all([
    listAttendances({ startDate: today, endDate: today }),
    listAttendances({ startDate: barberWeek.startDate, endDate: barberWeek.endDate }),
    listAttendances({ startDate: monthStart, endDate: monthEnd }),
    listExpenses(monthStart),
  ])

  const groupedMonthAttendances = groupAttendancesByCombo(monthRows)
  const monthly = calculateMonthlyFinancial(monthRows, monthExpenses)
  const employeeTotals = weekRows.reduce((acc, row) => {
    const key = row.usuario?.nome || 'Sem nome'
    acc[key] = (acc[key] || 0) + Number(row.valor_servico)
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
    todayRevenue: todayRows.reduce((sum, row) => sum + Number(row.valor_servico), 0),
    weekRevenue: weekRows.reduce((sum, row) => sum + Number(row.valor_servico), 0),
    monthRevenue: monthly.totalEntradas,
    monthExpenses: monthly.totalGastos,
    monthCommissions: monthly.totalComissoes,
    monthEmployeeRevenue: monthly.faturamentoFuncionarios,
    monthOwnerRevenue: monthly.faturamentoAdminDono,
    monthNetProfit: monthly.lucroLiquido,
    ticketMedio: groupedMonthAttendances.length ? monthly.totalEntradas / groupedMonthAttendances.length : 0,
    totalAttendances: groupedMonthAttendances.length,
    highlightEmployee,
    mostUsedService,
  }
}
