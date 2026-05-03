import type { Deduction, PayrollSettings, Shift } from '../lib/payroll'

export const settingsSeed: PayrollSettings = {
  hourlyRate: 31.5,
  periodType: 'bi-weekly',
  province: 'British Columbia',
  currency: 'CAD',
}

export const deductionsSeed: Deduction[] = [
  { id: 'fed', name: 'Federal Income Tax', type: 'percentage', value: 12.4, active: true },
  { id: 'prov', name: 'Provincial Tax', type: 'percentage', value: 5.1, active: true },
  { id: 'ei', name: 'EI Premium', type: 'percentage', value: 1.66, active: true },
  { id: 'cpp', name: 'CPP', type: 'percentage', value: 5.95, active: true },
  { id: 'vacation', name: 'Vacation Pay', type: 'earned', value: 84, active: true },
  { id: 'union', name: 'Union Dues', type: 'flat', value: 18, active: true },
]

export const shiftsSeed: Shift[] = [
  {
    id: 'shift-1',
    date: '2026-04-27',
    startTime: '08:00',
    endTime: '16:30',
    location: 'North Campus Lab',
    notes: 'Inventory and receiving.',
  },
  {
    id: 'shift-2',
    date: '2026-04-29',
    startTime: '09:30',
    endTime: '15:00',
    location: 'Riverfront Clinic',
    hourlyRateOverride: 34,
  },
  {
    id: 'shift-3',
    date: '2026-05-01',
    startTime: '07:45',
    endTime: '14:45',
    location: 'Downtown Ops Center',
    notes: 'Training overlap.',
  },
  {
    id: 'shift-4',
    date: '2026-05-02',
    startTime: '10:00',
    endTime: '18:00',
    location: 'North Campus Lab',
    attachmentName: 'schedule-shot.png',
  },
  {
    id: 'shift-5',
    date: '2026-05-05',
    startTime: '08:30',
    endTime: '17:00',
    location: 'Riverfront Clinic',
  },
]
