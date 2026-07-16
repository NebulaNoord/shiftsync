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
  /** Unpaid break minutes deducted from paid hours. */
  breakMinutes?: number
  /** Manually set paid hours, overriding clock-time calculation (use when your
   * stub rounds hours differently than the start/end times imply). */
  hoursOverride?: number
}

export interface Deduction {
  id: string
  name: string
  type: DeductionType
  value: number
  active: boolean
  /** When true and type === 'earned', value is a % of its base (e.g. 4% vacation pay). */
  earnedPercent?: boolean
  /**
   * What this row's amount is computed against:
   * - 'base'    = straight shift earnings only (excludes other earnings/deductions)
   * - 'running' = the running gross so far (all prior rows applied in order)
   * Defaults to 'running' for backwards compatibility.
   */
  basedOn?: 'base' | 'running'
  /** Non-cash benefit (e.g. scholarship accrual). Included in gross for display
   * but excluded from the running base used by later % rows (EI-insurable
   * earnings exclude non-cash). */
  nonCash?: boolean
}

export interface PayrollSettings {
  hourlyRate: number
  periodType: PayPeriodType
  province: string
  currency: string
  /**
   * The user's real pay-period start date (YYYY-MM-DD). When set, every
   * period is anchored to this date so shifts land in the correct cycle
   * instead of a fixed calendar grid they can't control.
   */
  payPeriodStart?: string
  /** Daily paid hours before overtime kicks in. */
  overtimeThresholdDaily?: number
  /** Weekly paid hours before overtime kicks in. */
  overtimeThresholdWeekly?: number
  /** Overtime multiplier (e.g. 1.5). */
  overtimeMultiplier?: number
  /** Net-pay goal for the active period. */
  netGoal?: number
  /** True once the user has completed first-run setup. */
  onboarded?: boolean
}

export interface DeductionResult extends Deduction {
  amount: number
  note?: string
}

export interface PaySummary {
  gross: number
  totalDeductions: number
  net: number
  positiveAdjustments: number
  /** Non-cash benefits (e.g. scholarship accrual) shown for tracking only — excluded from gross/net. */
  trackedBenefits: number
  overtimePay: number
  rows: DeductionResult[]
}

const dayMs = 24 * 60 * 60 * 1000

export function toDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
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

export function addMonths(date: Date, months: number) {
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export function formatDateRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

export function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

/** Raw clock length of a shift in hours (before break deduction).
 * Keeps full float precision — rounding happens only at display time
 * (hours()) so payroll math matches employers that don't truncate partial minutes. */
export function shiftClockHours(shift: Pick<Shift, 'startTime' | 'endTime'>) {
  const [startHour, startMinute] = shift.startTime.split(':').map(Number)
  const [endHour, endMinute] = shift.endTime.split(':').map(Number)
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  if (minutes < 0) minutes += 24 * 60
  return minutes / 60
}

/** Paid hours = clock hours minus unpaid break.
 * Rounded half-up to 2 decimals so payroll matches employer stubs that
 * bill on the hundredth of an hour. A manal hoursOverride (if set)
 * takes precedence — use it when your stub's hours differ from the clock math. */
export function shiftHours(shift: Pick<Shift, 'startTime' | 'endTime' | 'breakMinutes' | 'hoursOverride'>) {
  if (shift.hoursOverride != null && !Number.isNaN(shift.hoursOverride)) {
    return Math.round(shift.hoursOverride * 100) / 100
  }
  const paid = shiftClockHours(shift) - (shift.breakMinutes || 0) / 60
  return Math.round(paid * 100) / 100
}

export function shiftGross(shift: Shift, defaultRate: number) {
  return shiftHours(shift) * (shift.hourlyRateOverride || defaultRate)
}

export interface ShiftOT {
  straightHours: number
  overtimeHours: number
  straightPay: number
  overtimePay: number
  gross: number
}

/**
 * Split a single shift into straight + overtime pay using the daily and
 * weekly thresholds. Daily OT is applied to the portion of this shift above
 * the daily limit; weekly OT is applied to hours above the weekly limit
 * across all shifts in the period.
 */
export function shiftOvertime(
  shift: Shift,
  defaultRate: number,
  thresholds: { daily?: number; weekly?: number; multiplier: number },
  weeklyStraightSoFar: number,
): ShiftOT {
  const rate = shift.hourlyRateOverride || defaultRate
  const paid = shiftHours(shift)
  const multiplier = thresholds.multiplier || 1.5

  // Daily overtime: hours above the daily threshold within this shift.
  let dailyOT = 0
  let straight = paid
  if (thresholds.daily && paid > thresholds.daily) {
    dailyOT = paid - thresholds.daily
    straight = paid - dailyOT
  }

  // Weekly overtime: any hours that push the running weekly total above the
  // weekly threshold count as OT (once daily OT is already carved out).
  let weeklyOT = 0
  const weeklyAfterStraight = weeklyStraightSoFar + straight
  if (thresholds.weekly && weeklyAfterStraight > thresholds.weekly) {
    weeklyOT = weeklyAfterStraight - thresholds.weekly
    straight -= weeklyOT
  }

  const overtimeHours = dailyOT + weeklyOT
  const straightPay = straight * rate
  const overtimePay = overtimeHours * rate * multiplier
  return {
    straightHours: straight,
    overtimeHours,
    straightPay,
    overtimePay,
    gross: straightPay + overtimePay,
  }
}

export function summarizePay(
  shifts: Shift[],
  deductions: Deduction[],
  defaultRate: number,
  settings?: Pick<PayrollSettings, 'overtimeThresholdDaily' | 'overtimeThresholdWeekly' | 'overtimeMultiplier'>,
): PaySummary & { overtimeHours: number } {
  const ot = settings?.overtimeMultiplier
    ? {
        daily: settings.overtimeThresholdDaily,
        weekly: settings.overtimeThresholdWeekly,
        multiplier: settings.overtimeMultiplier,
      }
    : undefined

  let weeklyStraight = 0
  let grossBeforeAdjustments = 0
  let overtimePay = 0
  let overtimeHours = 0
  for (const shift of shifts) {
    if (ot) {
      const result = shiftOvertime(shift, defaultRate, ot, weeklyStraight)
      weeklyStraight += result.straightHours
      grossBeforeAdjustments += result.gross
      overtimePay += result.overtimePay
      overtimeHours += result.overtimeHours
    } else {
      grossBeforeAdjustments += shiftGross(shift, defaultRate)
    }
  }

  const rows: DeductionResult[] = []
  let running = grossBeforeAdjustments
  for (const deduction of deductions.filter((d) => d.active)) {
    const isPercent = deduction.type === 'percentage' || (deduction.type === 'earned' && Boolean(deduction.earnedPercent))
    const base = deduction.basedOn === 'base' ? grossBeforeAdjustments : running
    const amount = isPercent ? base * (deduction.value / 100) : deduction.value
    rows.push({ ...deduction, amount })
    if (deduction.type === 'earned') {
      if (!deduction.nonCash) running += amount
    } else {
      running -= amount
    }
  }
  const positiveAdjustments = rows
    .filter((row) => row.type === 'earned' && !row.nonCash)
    .reduce((total, row) => total + row.amount, 0)
  const negativeAdjustments = rows
    .filter((row) => row.type !== 'earned')
    .reduce((total, row) => total + row.amount, 0)
  const trackedBenefits = rows
    .filter((row) => row.nonCash)
    .reduce((total, row) => total + row.amount, 0)
  const gross = grossBeforeAdjustments + positiveAdjustments
  const net = gross - negativeAdjustments
  return {
    gross,
    totalDeductions: negativeAdjustments,
    net,
    positiveAdjustments,
    trackedBenefits,
    overtimePay,
    overtimeHours,
    rows,
  }
}

/** Summarize Jan 1 -> end of the given period's year-to-date window. */
export function summarizeYearToDate(
  shifts: Shift[],
  deductions: Deduction[],
  defaultRate: number,
  asOf: Date,
  settings?: Pick<PayrollSettings, 'overtimeThresholdDaily' | 'overtimeThresholdWeekly' | 'overtimeMultiplier'>,
) {
  const yearStart = new Date(asOf.getFullYear(), 0, 1)
  const ytdShifts = shifts.filter((shift) => {
    const d = toDate(shift.date)
    return d >= yearStart && d <= asOf
  })
  return summarizePay(ytdShifts, deductions, defaultRate, settings)
}

/**
 * Resolve the pay period that contains `date`.
 *
 * When `customStart` is provided the period is anchored to that exact date,
 * so the user's real pay cycle drives which shifts are included. Without it
 * a sensible calendar default is used (Mon-Sun week, 14-day block from the
 * current week, calendar semi-month, calendar month).
 */
export function getPayPeriodRange(date: Date, type: PayPeriodType, customStart?: string) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const ref = startOfDay(date)

  if (customStart) {
    const anchor = startOfDay(toDate(customStart))
    if (type === 'weekly' || type === 'bi-weekly') {
      const length = type === 'weekly' ? 7 : 14
      const periodsBack = Math.floor((ref.getTime() - anchor.getTime()) / (length * dayMs))
      const start = addDays(anchor, periodsBack * length)
      return { start, end: addDays(start, length - 1) }
    }
    if (type === 'semi-monthly') {
      const cut = Math.min(Math.max(anchor.getDate(), 1), 28)
      if (ref.getDate() >= cut) {
        const start = new Date(year, month, cut)
        const end = new Date(year, month, lastDayOfMonth(year, month))
        return { start, end }
      }
      const start = new Date(year, month, 1)
      const end = new Date(year, month, cut - 1)
      return { start, end }
    }
    // monthly: boundaries fall on `cut` day-of-month
    const cut = Math.min(Math.max(anchor.getDate(), 1), 28)
    if (ref.getDate() >= cut) {
      const start = new Date(year, month, cut)
      const end = new Date(year, month + 1, cut - 1)
      return { start, end }
    }
    const start = new Date(year, month - 1, cut)
    const end = new Date(year, month, cut - 1)
    return { start, end }
  }

  if (type === 'weekly') {
    const start = startOfWeek(date)
    return { start, end: addDays(start, 6) }
  }
  if (type === 'bi-weekly') {
    const start = startOfWeek(date)
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

/** Move `date` forward/back by exactly one pay period. */
export function stepPayPeriod(date: Date, type: PayPeriodType, customStart: string | undefined, dir: 1 | -1): Date {
  if (customStart) {
    const anchor = startOfDay(toDate(customStart))
    if (type === 'weekly' || type === 'bi-weekly') {
      const length = type === 'weekly' ? 7 : 14
      const ref = startOfDay(date)
      const periodsBack = Math.floor((ref.getTime() - anchor.getTime()) / (length * dayMs))
      return addDays(anchor, (periodsBack + dir) * length)
    }
    // For semi-monthly/monthly, step by calendar month halves.
    if (type === 'semi-monthly') {
      if (date.getDate() >= 15) {
        // currently in 2nd half -> move to 1st half of next month (or prev)
        return new Date(date.getFullYear(), date.getMonth() + dir, 15)
      }
      return new Date(date.getFullYear(), date.getMonth() + dir, 1)
    }
    return addMonths(date, dir)
  }

  if (type === 'weekly') return addDays(date, 7 * dir)
  if (type === 'bi-weekly') return addDays(date, 14 * dir)
  if (type === 'semi-monthly') {
    if (date.getDate() >= 15) return new Date(date.getFullYear(), date.getMonth() + dir, 15)
    return new Date(date.getFullYear(), date.getMonth() + dir, 1)
  }
  return addMonths(date, dir)
}

export function isWithin(dateString: string, start: Date, end: Date) {
  const date = startOfDay(toDate(dateString))
  return date >= startOfDay(start) && date <= startOfDay(end)
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

/**
 * Canadian deduction presets — 2024 contribution rates & ceilings (employee
 * side). These are a *planning estimate*, not filing-grade: CPP/EI are annual
 * caps applied here as a per-period rate, and income tax is a rough effective
 * rate. Update the constants each tax year.
 */
export interface CanadianPreset extends Deduction {
  note?: string
}

const round2 = (value: number) => Math.round(value * 100) / 100

// CPP (base)
export const CPP_RATE = 0.0595
export const CPP_MAX_PENSIONABLE = 68500
export const CPP_BASIC_EXEMPTION = 3500
export const CPP_MAX = round2((CPP_MAX_PENSIONABLE - CPP_BASIC_EXEMPTION) * CPP_RATE) // 3867.50

// CPP2 (additional, 2024+)
export const CPP2_RATE = 0.04
export const CPP2_MAX_PENSIONABLE = 73200
export const CPP2_MAX = round2((CPP2_MAX_PENSIONABLE - CPP_MAX_PENSIONABLE) * CPP2_RATE) // 188.00

// EI
export const EI_RATE = 0.0163
export const EI_MAX_INSURABLE = 63200
export const EI_MAX = round2(EI_MAX_INSURABLE * EI_RATE) // 1049.12

/**
 * Approximate *combined federal + provincial effective* income-tax rate (% of
 * gross) for a median full-time income (~$55k). These are effective (not
 * marginal) rates meant for ballpark net-pay estimates — actual T1 brackets
 * vary widely with income, credits, and deductions.
 */
const PROVINCE_TAX_ESTIMATE: Record<string, number> = {
  AB: 22, BC: 23, MB: 24, NB: 25, NL: 25, NS: 25, NT: 21, NU: 21,
  ON: 23, PE: 25, QC: 22, SK: 24, YT: 21,
}

export function canadianTaxPresets(
  annualGrossEstimate: number,
  province = '',
): CanadianPreset[] {
  const cppCapped = annualGrossEstimate >= CPP_MAX_PENSIONABLE
  const eiCapped = annualGrossEstimate >= EI_MAX_INSURABLE
  const code = province.trim().toUpperCase().slice(0, 2)
  const provRate = PROVINCE_TAX_ESTIMATE[code] ?? 23
  return [
    { id: 'preset-federal-tax', name: 'Federal Income Tax', type: 'percentage', value: 12, active: true },
    { id: 'preset-provincial-tax', name: `${province.trim() || 'Provincial'} Tax`, type: 'percentage', value: provRate, active: true },
    {
      id: 'preset-cpp',
      name: 'CPP',
      type: 'percentage',
      value: round2(CPP_RATE * 100),
      active: true,
      note: cppCapped ? 'CPP capped at annual max' : undefined,
    },
    {
      id: 'preset-cpp2',
      name: 'CPP2',
      type: 'percentage',
      value: round2(CPP2_RATE * 100),
      active: true,
      note: annualGrossEstimate >= CPP2_MAX_PENSIONABLE ? 'CPP2 capped at annual max' : undefined,
    },
    {
      id: 'preset-ei',
      name: 'EI Premium',
      type: 'percentage',
      value: round2(EI_RATE * 100),
      active: true,
      basedOn: 'running',
      note: eiCapped ? 'EI capped at annual max' : 'On Regular + Vacation pay',
    },
  ]
}

/**
 * Common Canadian *earnings* additions to a paycheque — positive rows that
 * increase gross. Vacation pay is usually a percentage of gross (4% standard,
 * 6% after 5+ years); scholarship accrual is typically a flat per-period
 * amount. Values are starting guesses — edit them to match your actual stub.
 */
export function canadianEarningsPresets(): CanadianPreset[] {
  return [
    {
      id: 'preset-vacation-pay',
      name: 'Vacation Pay',
      type: 'earned',
      value: 4,
      active: true,
      earnedPercent: true,
      basedOn: 'base',
      note: '4% of Regular pay (6% after 5+ yrs)',
    },
    {
      id: 'preset-scholarship',
      name: 'Accrued (non-cash)',
      type: 'earned',
      value: 1.667,
      active: true,
      earnedPercent: true,
      basedOn: 'base',
      nonCash: true,
      note: 'Tracked benefit, % of Regular pay (not added to gross/net)',
    },
  ]
}
