import type { Deduction, PayrollSettings, Shift } from '../lib/payroll'

export const settingsSeed: PayrollSettings = {
  hourlyRate: 0,
  periodType: 'bi-weekly',
  province: '',
  currency: 'CAD',
  overtimeThresholdDaily: 8,
  overtimeThresholdWeekly: 40,
  overtimeMultiplier: 1.5,
  netGoal: 0,
  onboarded: false,
}

export const deductionsSeed: Deduction[] = []

export const shiftsSeed: Shift[] = []
