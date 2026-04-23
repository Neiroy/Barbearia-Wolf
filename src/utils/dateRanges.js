import dayjs from 'dayjs'

const TUESDAY = 2
const BARBER_WEEK_LENGTH_DAYS = 4

export function getBarberWeekRange(referenceDate = dayjs()) {
  const base = dayjs(referenceDate)
  const dayOfWeek = base.day()
  const daysSinceTuesday = dayOfWeek >= TUESDAY ? dayOfWeek - TUESDAY : dayOfWeek + 5
  const start = base.subtract(daysSinceTuesday, 'day').startOf('day')
  const end = start.add(BARBER_WEEK_LENGTH_DAYS, 'day').endOf('day')

  return {
    start,
    end,
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
  }
}

export function formatBarberWeekLabel(referenceDate = dayjs(), dateFormat = 'DD/MM/YYYY') {
  const range = getBarberWeekRange(referenceDate)
  return `${range.start.format(dateFormat)} ate ${range.end.format(dateFormat)}`
}
