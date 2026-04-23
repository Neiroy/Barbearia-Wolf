import { describe, expect, it } from 'vitest'
import { getBarberWeekRange } from './dateRanges'

describe('dateRanges semana fixa da barbearia', () => {
  it('retorna ciclo terca a sabado para uma data no meio da semana', () => {
    const range = getBarberWeekRange('2026-04-23')
    expect(range.startDate).toBe('2026-04-21')
    expect(range.endDate).toBe('2026-04-25')
  })

  it('domingo e segunda continuam no ciclo anterior', () => {
    const sundayRange = getBarberWeekRange('2026-04-26')
    const mondayRange = getBarberWeekRange('2026-04-27')
    expect(sundayRange.startDate).toBe('2026-04-21')
    expect(sundayRange.endDate).toBe('2026-04-25')
    expect(mondayRange.startDate).toBe('2026-04-21')
    expect(mondayRange.endDate).toBe('2026-04-25')
  })
})
