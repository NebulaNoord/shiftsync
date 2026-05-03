import type { Deduction, PayrollSettings, Shift } from '../lib/payroll'

export const settingsSeed: PayrollSettings = {
  hourlyRate: 0,
  periodType: 'bi-weekly',
  province: '',
  currency: 'CAD',
}

export const deductionsSeed: Deduction[] = []

export const shiftsSeed: Shift[] = []
