export type PayPeriodType = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
export type DeductionType = 'percentage' | 'flat' | 'earned'

export interface Shift {
  id: string
  date: string
  startTime: string
  endTime: string
  location: string
  notes?: string
  attachmentName?: string
  hourlyRateOverride?: number
}

export interface Deduction {
  id: string
  name: string
  type: DeductionType
  value: number
  active: boolean
}

export interface PayrollSettings {
  hourlyRate: number
  periodType: PayPeriodType
  province: string
  currency: string
}

export interface DeductionResult extends Deduction {
  amount: number
}

export interface PaySummary {
  gross: number
  totalDeductions: number
  net: number
  positiveAdjustments: number
  rows: DeductionResult[]
}

const dayMs = 24 * 60 * 60 * 1000

export function toDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function isoDate(date: Date) {
  const copy = new Date(date)
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset())
  return copy.toISOString().slice(0, 10)
}

export function startOfWeek(date: Date) {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1)
  copy.setDate(diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

export function formatDateRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

export function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

export function shiftHours(shift: Pick<Shift, 'startTime' | 'endTime'>) {
  const [startHour, startMinute] = shift.startTime.split(':').map(Number)
  const [endHour, endMinute] = shift.endTime.split(':').map(Number)
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  if (minutes < 0) minutes += 24 * 60
  return Math.round((minutes / 60) * 100) / 100
}

export function shiftGross(shift: Shift, defaultRate: number) {
  return shiftHours(shift) * (shift.hourlyRateOverride || defaultRate)
}

export function summarizePay(shifts: Shift[], deductions: Deduction[], defaultRate: number): PaySummary {
  const grossBeforeAdjustments = shifts.reduce((total, shift) => total + shiftGross(shift, defaultRate), 0)
  const rows = deductions
    .filter((deduction) => deduction.active)
    .map((deduction) => {
      const amount =
        deduction.type === 'percentage'
          ? grossBeforeAdjustments * (deduction.value / 100)
          : deduction.value
      return { ...deduction, amount }
    })
  const positiveAdjustments = rows
    .filter((row) => row.type === 'earned')
    .reduce((total, row) => total + row.amount, 0)
  const negativeAdjustments = rows
    .filter((row) => row.type !== 'earned')
    .reduce((total, row) => total + row.amount, 0)
  const gross = grossBeforeAdjustments + positiveAdjustments
  const net = gross - negativeAdjustments
  return {
    gross,
    totalDeductions: negativeAdjustments,
    net,
    positiveAdjustments,
    rows,
  }
}

export function getPayPeriodRange(date: Date, type: PayPeriodType) {
  const year = date.getFullYear()
  const month = date.getMonth()
  if (type === 'weekly') {
    const start = startOfWeek(date)
    return { start, end: addDays(start, 6) }
  }
  if (type === 'bi-weekly') {
    const anchor = new Date(2026, 0, 5)
    const elapsedWeeks = Math.floor((startOfWeek(date).getTime() - anchor.getTime()) / (7 * dayMs))
    const start = addDays(anchor, Math.floor(elapsedWeeks / 2) * 14)
    return { start, end: addDays(start, 13) }
  }
  if (type === 'semi-monthly') {
    const start = new Date(year, month, date.getDate() <= 15 ? 1 : 16)
    const end = date.getDate() <= 15 ? new Date(year, month, 15) : new Date(year, month + 1, 0)
    return { start, end }
  }
  const start = new Date(year, month, 1)
  return { start, end: new Date(year, month + 1, 0) }
}

export function isWithin(dateString: string, start: Date, end: Date) {
  const date = toDate(dateString)
  return date >= start && date <= end
}

export function money(value: number, currency = 'CAD') {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value)
}

export function hours(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}h`
}
