import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileJson,
  FileText,
  Import,
  LayoutDashboard,
  Plus,
  Save,
  Settings,
  Trash2,
  UploadCloud,
  WalletCards,
} from 'lucide-react'
import './App.css'
import { deductionsSeed, settingsSeed, shiftsSeed } from './data/seed'
import {
  addDays,
  formatDateRange,
  getPayPeriodRange,
  getWeekDays,
  hours,
  isWithin,
  isoDate,
  money,
  shiftGross,
  shiftHours,
  startOfWeek,
  summarizePay,
  type Deduction,
  type DeductionType,
  type PayrollSettings,
  type PayPeriodType,
  type Shift,
} from './lib/payroll'

type View = 'dashboard' | 'summary' | 'add' | 'settings'

interface AppState {
  shifts: Shift[]
  deductions: Deduction[]
  settings: PayrollSettings
  lifetimeMode: boolean
}

const storageKey = 'shiftsync-local-v2'

const canadianPresetDeductions: Deduction[] = [
  { id: 'preset-federal-tax', name: 'Federal Income Tax', type: 'percentage', value: 12, active: true },
  { id: 'preset-provincial-tax', name: 'Provincial Tax', type: 'percentage', value: 5, active: true },
  { id: 'preset-cpp', name: 'CPP', type: 'percentage', value: 5.95, active: true },
  { id: 'preset-ei', name: 'EI Premium', type: 'percentage', value: 1.66, active: true },
]

const blankShift = (date = isoDate(new Date())): Shift => ({
  id: '',
  date,
  startTime: '09:00',
  endTime: '17:00',
  location: '',
  notes: '',
})

function loadState(): AppState {
  const fallback = loadEmptyState()
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback
  } catch {
    return fallback
  }
}

function loadEmptyState(): AppState {
  return {
    shifts: shiftsSeed,
    deductions: deductionsSeed,
    settings: settingsSeed,
    lifetimeMode: false,
  }
}

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [appState, setAppState] = useState<AppState>(loadState)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [draftShift, setDraftShift] = useState<Shift>(() => blankShift())
  const [toast, setToast] = useState('')
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<Shift[]>([])
  const [restoreText, setRestoreText] = useState('')
  const [clearArmed, setClearArmed] = useState(false)

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(appState))
  }, [appState])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const { shifts, deductions, settings, lifetimeMode } = appState
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekEnd = addDays(weekStart, 6)
  const period = getPayPeriodRange(weekStart, settings.periodType)
  const periodShifts = shifts.filter((shift) => isWithin(shift.date, period.start, period.end))
  const visibleShifts = lifetimeMode ? shifts : periodShifts
  const weekShifts = shifts.filter((shift) => isWithin(shift.date, weekStart, weekEnd))
  const periodSummary = summarizePay(visibleShifts, deductions, settings.hourlyRate)
  const weekSummary = summarizePay(weekShifts, deductions, settings.hourlyRate)
  const totalHours = visibleShifts.reduce((total, shift) => total + shiftHours(shift), 0)
  const locations = Array.from(new Set(shifts.map((shift) => shift.location).filter(Boolean)))

  const showToast = (message: string) => setToast(message)

  const updateState = (partial: Partial<AppState>) => setAppState((current) => ({ ...current, ...partial }))

  const saveShift = (event: FormEvent) => {
    event.preventDefault()
    const id = draftShift.id || crypto.randomUUID()
    const nextShift = { ...draftShift, id }
    updateState({
      shifts: shifts.some((shift) => shift.id === id)
        ? shifts.map((shift) => (shift.id === id ? nextShift : shift))
        : [...shifts, nextShift],
    })
    setEditingShift(null)
    setDraftShift(blankShift(draftShift.date))
    setView('dashboard')
    showToast('Shift saved locally')
  }

  const deleteShift = (id: string) => {
    updateState({ shifts: shifts.filter((shift) => shift.id !== id) })
    setEditingShift(null)
    showToast('Shift deleted')
  }

  const parseImport = () => {
    const trimmed = importText.trim()
    if (!trimmed) return setImportPreview([])
    try {
      const parsed: Shift[] = trimmed.startsWith('[')
        ? JSON.parse(trimmed).map((item: Record<string, string>) => ({
            id: crypto.randomUUID(),
            date: item.date,
            startTime: item.startTime || item.start,
            endTime: item.endTime || item.end,
            location: item.location || item.workplace || 'Imported shift',
          }))
        : (() => {
        const lines = trimmed.split(/\r?\n/).filter(Boolean)
        const dataLines = lines[0].toLowerCase().includes('date') ? lines.slice(1) : lines
        return dataLines.map((line) => {
          const parts = line.includes(',') ? line.split(',') : line.split('|')
          return {
            id: crypto.randomUUID(),
            date: parts[0]?.trim(),
            startTime: parts[1]?.trim(),
            endTime: parts[2]?.trim(),
            location: parts[3]?.trim() || 'Imported shift',
          }
        })
      })()
      setImportPreview(parsed.filter((shift) => shift.date && shift.startTime && shift.endTime))
      showToast('Import preview ready')
    } catch {
      showToast('Import format needs date, start, end, location')
    }
  }

  const confirmImport = () => {
    updateState({ shifts: [...shifts, ...importPreview] })
    setImportPreview([])
    showToast('Imported shifts saved')
  }

  const exportCsv = () => {
    const rows = ['date,start_time,end_time,hours,location,gross']
    shifts.forEach((shift) => {
      rows.push(
        [shift.date, shift.startTime, shift.endTime, shiftHours(shift), shift.location, shiftGross(shift, settings.hourlyRate)]
          .map(String)
          .join(','),
      )
    })
    download('shiftsync-export.csv', rows.join('\n'), 'text/csv')
    showToast('CSV exported')
  }

  const exportJson = () => {
    download('shiftsync-backup.json', JSON.stringify(appState, null, 2), 'application/json')
    showToast('Backup downloaded')
  }

  const exportPdf = () => {
    const lines = [
      'ShiftSync Pay Summary',
      `Generated: ${new Date().toLocaleString()}`,
      `Period type: ${settings.periodType}`,
      `Hourly rate: ${money(settings.hourlyRate, settings.currency)}`,
      '',
      `Gross pay: ${money(periodSummary.gross, settings.currency)}`,
      `Total deductions: ${money(periodSummary.totalDeductions, settings.currency)}`,
      `Net pay: ${money(periodSummary.net, settings.currency)}`,
      `Total hours: ${hours(totalHours)}`,
      '',
      'Deductions & earnings:',
      ...(deductions.length
        ? deductions.map((row) => `${row.name} - ${row.type} - ${row.value}${row.type === 'percentage' ? '%' : ''} - ${row.active ? 'active' : 'inactive'}`)
        : ['None']),
      '',
      'Shifts:',
      ...(shifts.length
        ? shifts.map((shift) => `${shift.date} ${shift.startTime}-${shift.endTime} ${shift.location} ${hours(shiftHours(shift))}`)
        : ['None']),
    ]
    download('shiftsync-summary.pdf', createSimplePdf(lines), 'application/pdf')
    showToast('PDF exported')
  }

  const restoreBackup = () => {
    try {
      const parsed = JSON.parse(restoreText) as Partial<AppState>
      const next: AppState = {
        shifts: Array.isArray(parsed.shifts) ? parsed.shifts : [],
        deductions: Array.isArray(parsed.deductions) ? parsed.deductions : [],
        settings: { ...settingsSeed, ...parsed.settings },
        lifetimeMode: Boolean(parsed.lifetimeMode),
      }
      setAppState(next)
      setRestoreText('')
      showToast('Backup restored')
    } catch {
      showToast('Paste a valid ShiftSync backup JSON file')
    }
  }

  const clearLocalData = () => {
    if (!clearArmed) {
      setClearArmed(true)
      showToast('Tap clear again to confirm')
      return
    }
    const fresh = loadEmptyState()
    localStorage.removeItem(storageKey)
    setAppState(fresh)
    setWeekStart(startOfWeek(new Date()))
    setDraftShift(blankShift())
    setImportPreview([])
    setRestoreText('')
    setClearArmed(false)
    showToast('Local data cleared')
  }

  const updateDeduction = (id: string, patch: Partial<Deduction>) => {
    updateState({ deductions: deductions.map((deduction) => (deduction.id === id ? { ...deduction, ...patch } : deduction)) })
  }

  const addDeduction = () => {
    updateState({
      deductions: [
        ...deductions,
        { id: crypto.randomUUID(), name: 'Custom row', type: 'flat', value: 0, active: true },
      ],
    })
  }

  const addCanadianPresets = () => {
    const existingNames = new Set(deductions.map((deduction) => deduction.name.toLowerCase()))
    const missing = canadianPresetDeductions
      .filter((deduction) => !existingNames.has(deduction.name.toLowerCase()))
      .map((deduction) => ({ ...deduction, id: crypto.randomUUID() }))
    if (!missing.length) {
      showToast('Canadian presets already added')
      return
    }
    updateState({ deductions: [...deductions, ...missing] })
    showToast('Canadian deduction presets added')
  }

  return (
    <AeroShell>
      <div className="app-shell">
        <aside className="sidebar glass-card">
          <div className="brand-lockup">
            <img src="/logo.jpg" alt="ShiftSync" className="brand-mark" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            <div>
              <strong>ShiftSync</strong>
              <span>Local pay tracker</span>
            </div>
          </div>
          <nav className="nav-stack" aria-label="Primary">
            <NavButton active={view === 'dashboard'} icon={<LayoutDashboard />} label="Dashboard" onClick={() => setView('dashboard')} />
            <NavButton active={view === 'summary'} icon={<WalletCards />} label="Pay Period" onClick={() => setView('summary')} />
            <NavButton active={view === 'add'} icon={<Plus />} label="Add Shift" onClick={() => setView('add')} />
            <NavButton active={view === 'settings'} icon={<Settings />} label="Settings" onClick={() => setView('settings')} />
          </nav>
        </aside>

        <main className="workspace">
          <header className="topbar glass-card">
            <div>
              <span className="eyeline">{settings.periodType} pay period</span>
              <h1>{viewTitles[view]}</h1>
            </div>
            <div className="profile-chip">
              <div className="avatar">L</div>
              <div>
                <strong>Local data</strong>
                <span>Saved in this browser</span>
              </div>
            </div>
          </header>

          {view === 'dashboard' && (
            <Dashboard
              weekStart={weekStart}
              weekEnd={weekEnd}
              weekDays={weekDays}
              shifts={shifts}
              settings={settings}
              summary={weekSummary}
              period={period}
              onPrev={() => setWeekStart(addDays(weekStart, -7))}
              onNext={() => setWeekStart(addDays(weekStart, 7))}
              onAdd={(date) => {
                setDraftShift(blankShift(isoDate(date)))
                setView('add')
              }}
              onEdit={(shift) => {
                setEditingShift(shift)
                setDraftShift(shift)
              }}
            />
          )}

          {view === 'summary' && (
            <Summary
              summary={periodSummary}
              settings={settings}
              totalHours={totalHours}
              lifetimeMode={lifetimeMode}
              onToggleLifetime={() => updateState({ lifetimeMode: !lifetimeMode })}
              onCsv={exportCsv}
              onJson={exportJson}
              onPdf={exportPdf}
            />
          )}

          {view === 'add' && (
            <AddShift
              draft={draftShift}
              setDraft={setDraftShift}
              onSubmit={saveShift}
              settings={settings}
              deductions={deductions}
              locations={locations}
              importText={importText}
              setImportText={setImportText}
              importPreview={importPreview}
              onParse={parseImport}
              onConfirmImport={confirmImport}
            />
          )}

          {view === 'settings' && (
            <SettingsPanel
              settings={settings}
              deductions={deductions}
              onSettings={(next) => updateState({ settings: next })}
              onDeduction={updateDeduction}
              onAddDeduction={addDeduction}
              onAddCanadianPresets={addCanadianPresets}
              onDeleteDeduction={(id) => updateState({ deductions: deductions.filter((item) => item.id !== id) })}
              onBackup={exportJson}
              restoreText={restoreText}
              setRestoreText={setRestoreText}
              onRestore={restoreBackup}
              clearArmed={clearArmed}
              onClearLocalData={clearLocalData}
            />
          )}

        </main>
      </div>

      <div className="mobile-tabs glass-card">
        <NavButton active={view === 'dashboard'} icon={<LayoutDashboard />} label="Week" onClick={() => setView('dashboard')} />
        <NavButton active={view === 'summary'} icon={<WalletCards />} label="Pay" onClick={() => setView('summary')} />
        <NavButton active={view === 'add'} icon={<Plus />} label="Add" onClick={() => setView('add')} />
        <NavButton active={view === 'settings'} icon={<Settings />} label="Settings" onClick={() => setView('settings')} />
      </div>

      {editingShift && (
        <ShiftModal
          shift={draftShift}
          setShift={setDraftShift}
          onClose={() => setEditingShift(null)}
          onSave={saveShift}
          onDelete={() => deleteShift(editingShift.id)}
        />
      )}
      {toast && <Toast message={toast} />}
    </AeroShell>
  )
}

const viewTitles: Record<View, string> = {
  dashboard: 'Weekly Shift Viewer',
  summary: 'Pay Period Summary',
  add: 'Add Shift',
  settings: 'Settings',
}

function AeroShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="aero-bg">
      <div className="blob blob-one" />
      <div className="blob blob-two" />
      <div className="blob blob-three" />
      <div className="wave-layer" />
      <div className="noise-layer" />
      {children}
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <span className="icon-bubble">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function Dashboard(props: {
  weekStart: Date
  weekEnd: Date
  weekDays: Date[]
  shifts: Shift[]
  settings: PayrollSettings
  summary: ReturnType<typeof summarizePay>
  period: { start: Date; end: Date }
  onPrev: () => void
  onNext: () => void
  onAdd: (date: Date) => void
  onEdit: (shift: Shift) => void
}) {
  const today = isoDate(new Date())
  const totalHours = props.shifts
    .filter((shift) => isWithin(shift.date, props.weekStart, props.weekEnd))
    .reduce((total, shift) => total + shiftHours(shift), 0)
  const shiftCount = props.shifts.filter((shift) => isWithin(shift.date, props.weekStart, props.weekEnd)).length

  return (
    <section className="dashboard-grid">
      <div className="week-card glass-card">
        <div className="section-head">
          <div>
            <span className="eyeline">Pay period {formatDateRange(props.period.start, props.period.end)}</span>
            <h2>{formatDateRange(props.weekStart, props.weekEnd)}</h2>
          </div>
          <div className="week-controls">
            <button className="glass-icon" type="button" onClick={props.onPrev} aria-label="Previous week"><ChevronLeft /></button>
            <button className="glass-icon" type="button" onClick={props.onNext} aria-label="Next week"><ChevronRight /></button>
          </div>
        </div>
        <div className="calendar-grid">
          {props.weekDays.map((day) => {
            const dateKey = isoDate(day)
            const dayShifts = props.shifts.filter((shift) => shift.date === dateKey)
            return (
              <div className={`day-column ${dateKey === today ? 'today' : ''}`} key={dateKey}>
                <div className="day-head">
                  <span>{day.toLocaleDateString('en-CA', { weekday: 'short' })}</span>
                  <strong>{day.getDate()}</strong>
                </div>
                <div className="shift-stack">
                  {dayShifts.map((shift) => (
                    <button className="shift-block" type="button" key={shift.id} onClick={() => props.onEdit(shift)}>
                      <span><Clock3 size={13} /> {shift.startTime} - {shift.endTime}</span>
                      <strong>{hours(shiftHours(shift))}</strong>
                      <em>{shift.location}</em>
                    </button>
                  ))}
                  {!dayShifts.length && (
                    <button className="empty-day" type="button" onClick={() => props.onAdd(day)}>
                      <Plus size={16} /> Add
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="week-summary">
          <span>Total {hours(totalHours)}</span>
          <span>{shiftCount} shifts</span>
          <span>{money(props.summary.gross, props.settings.currency)} gross</span>
        </div>
      </div>
      <StatsRow summary={props.summary} settings={props.settings} hoursValue={totalHours} />
    </section>
  )
}

function StatsRow({ summary, settings, hoursValue }: { summary: ReturnType<typeof summarizePay>; settings: PayrollSettings; hoursValue: number }) {
  const stats = [
    { label: 'Hours This Period', value: hours(hoursValue), width: 72 },
    { label: 'Gross Pay', value: money(summary.gross, settings.currency), width: 88 },
    { label: 'Total Deductions', value: money(summary.totalDeductions, settings.currency), width: 54 },
    { label: 'Net Pay', value: money(summary.net, settings.currency), width: 76 },
  ]
  return (
    <div className="stats-row">
      {stats.map((stat) => (
        <article className="stat-card glass-card" key={stat.label}>
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
          <div className="mini-bar"><i style={{ width: `${stat.width}%` }} /></div>
        </article>
      ))}
    </div>
  )
}

function Summary({
  summary,
  settings,
  totalHours,
  lifetimeMode,
  onToggleLifetime,
  onCsv,
  onJson,
  onPdf,
}: {
  summary: ReturnType<typeof summarizePay>
  settings: PayrollSettings
  totalHours: number
  lifetimeMode: boolean
  onToggleLifetime: () => void
  onCsv: () => void
  onJson: () => void
  onPdf: () => void
}) {
  const netWidth = summary.gross ? Math.max(4, Math.min(100, (summary.net / summary.gross) * 100)) : 0
  return (
    <section className="summary-layout">
      <StatsRow summary={summary} settings={settings} hoursValue={totalHours} />
      <div className="glass-card earnings-panel">
        <div className="section-head">
          <div>
            <span className="eyeline">{lifetimeMode ? 'Lifetime accumulator' : 'Active period'}</span>
            <h2>Net vs. gross</h2>
          </div>
          <button className="pill-toggle" type="button" onClick={onToggleLifetime}>{lifetimeMode ? 'Lifetime on' : 'Period only'}</button>
        </div>
        <div className="earnings-bar"><i style={{ width: `${netWidth}%` }} /></div>
        <div className="deduction-list">
          {summary.rows.length ? (
            summary.rows.map((row) => (
              <div className={`deduction-row ${row.type === 'earned' ? 'positive' : 'negative'}`} key={row.id}>
                <span>{row.name}</span>
                <em>{row.type === 'percentage' ? `${row.value}%` : row.type === 'flat' ? 'flat' : 'earned'}</em>
                <strong>{row.type === 'earned' ? '+' : '-'}{money(row.amount, settings.currency)}</strong>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-illustration">+</div>
              <strong>No deductions or earnings yet</strong>
              <span>Add taxes, dues, bonuses, or vacation pay in Settings.</span>
            </div>
          )}
        </div>
        <div className="export-row">
          <button className="primary-button" type="button" onClick={onCsv}><FileText /> CSV</button>
          <button className="primary-button" type="button" onClick={onJson}><FileJson /> Backup</button>
          <button className="primary-button" type="button" onClick={onPdf}><Download /> PDF</button>
        </div>
      </div>
    </section>
  )
}

function AddShift({
  draft,
  setDraft,
  onSubmit,
  settings,
  deductions,
  locations,
  importText,
  setImportText,
  importPreview,
  onParse,
  onConfirmImport,
}: {
  draft: Shift
  setDraft: (shift: Shift) => void
  onSubmit: (event: FormEvent) => void
  settings: PayrollSettings
  deductions: Deduction[]
  locations: string[]
  importText: string
  setImportText: (value: string) => void
  importPreview: Shift[]
  onParse: () => void
  onConfirmImport: () => void
}) {
  const preview = summarizePay([{ ...draft, id: draft.id || 'preview' }], deductions, draft.hourlyRateOverride || settings.hourlyRate)
  return (
    <section className="add-layout">
      <form className="glass-card form-panel" onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Date"><input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></Field>
          <Field label="Start time"><input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} required /></Field>
          <Field label="End time"><input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} required /></Field>
          <Field label="Hourly override"><input type="number" min="0" step="0.01" placeholder={String(settings.hourlyRate)} value={draft.hourlyRateOverride || ''} onChange={(event) => setDraft({ ...draft, hourlyRateOverride: Number(event.target.value) || undefined })} /></Field>
        </div>
        <Field label="Location / Workplace">
          <input list="locations" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} required />
          <datalist id="locations">{locations.map((location) => <option value={location} key={location} />)}</datalist>
        </Field>
        <Field label="Notes"><textarea value={draft.notes || ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></Field>
        <label className="drop-zone">
          <UploadCloud />
          <span>{draft.attachmentName || 'Attach PNG, JPG, or PDF'}</span>
          <input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={(event) => setDraft({ ...draft, attachmentName: event.target.files?.[0]?.name })} />
        </label>
        <button className="primary-button" type="submit"><Save /> Save shift</button>
      </form>

      <aside className="side-stack">
        <div className="glass-card live-preview">
          <span className="eyeline">Live preview</span>
          <strong>{hours(shiftHours(draft))}</strong>
          <p>{money(preview.gross, settings.currency)} gross</p>
          <p>{money(preview.net, settings.currency)} estimated net</p>
        </div>
        <div className="glass-card import-panel">
          <div className="section-head compact">
            <h2>Import</h2>
            <Import />
          </div>
          <textarea value={importText} onChange={(event) => setImportText(event.target.value)} />
          <button className="primary-button" type="button" onClick={onParse}>Preview import</button>
          {importPreview.length > 0 && (
            <div className="preview-table">
              {importPreview.map((shift) => (
                <span key={shift.id}>{shift.date} {shift.startTime}-{shift.endTime} {shift.location}</span>
              ))}
              <button className="primary-button" type="button" onClick={onConfirmImport}>Confirm save</button>
            </div>
          )}
        </div>
      </aside>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field">{label}{children}</label>
}

function SettingsPanel({
  settings,
  deductions,
  onSettings,
  onDeduction,
  onAddDeduction,
  onAddCanadianPresets,
  onDeleteDeduction,
  onBackup,
  restoreText,
  setRestoreText,
  onRestore,
  clearArmed,
  onClearLocalData,
}: {
  settings: PayrollSettings
  deductions: Deduction[]
  onSettings: (settings: PayrollSettings) => void
  onDeduction: (id: string, patch: Partial<Deduction>) => void
  onAddDeduction: () => void
  onAddCanadianPresets: () => void
  onDeleteDeduction: (id: string) => void
  onBackup: () => void
  restoreText: string
  setRestoreText: (value: string) => void
  onRestore: () => void
  clearArmed: boolean
  onClearLocalData: () => void
}) {
  return (
    <section className="settings-layout">
      <div className="settings-stack">
        <div className="glass-card form-panel">
          <h2>Pay info</h2>
          <div className="form-grid">
            <Field label="Hourly rate"><input type="number" step="0.01" value={settings.hourlyRate} onChange={(event) => onSettings({ ...settings, hourlyRate: Number(event.target.value) })} /></Field>
            <Field label="Pay period">
              <select value={settings.periodType} onChange={(event) => onSettings({ ...settings, periodType: event.target.value as PayPeriodType })}>
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="semi-monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Province / territory"><input value={settings.province} onChange={(event) => onSettings({ ...settings, province: event.target.value })} /></Field>
            <Field label="Currency"><input value={settings.currency} onChange={(event) => onSettings({ ...settings, currency: event.target.value.toUpperCase() })} /></Field>
          </div>
        </div>
        <div className="glass-card local-panel">
          <h2>Local storage</h2>
          <p>ShiftSync saves data only in this browser on this device. Back up before clearing browser data or switching devices.</p>
          <div className="export-row wrap">
            <button className="primary-button" type="button" onClick={onBackup}><FileJson /> Backup data</button>
            <button className="danger-button" type="button" onClick={onClearLocalData}><Trash2 /> {clearArmed ? 'Confirm clear' : 'Clear local data'}</button>
          </div>
          <Field label="Restore from backup">
            <textarea value={restoreText} onChange={(event) => setRestoreText(event.target.value)} placeholder="Paste a ShiftSync backup JSON file here" />
          </Field>
          <button className="primary-button" type="button" onClick={onRestore}><Import /> Restore backup</button>
        </div>
      </div>
      <div className="glass-card deductions-editor">
        <div className="section-head">
          <h2>Deductions & Earnings</h2>
          <div className="export-row wrap">
            <button className="primary-button" type="button" onClick={onAddCanadianPresets}>Add Canadian presets</button>
            <button className="primary-button" type="button" onClick={onAddDeduction}><Plus /> Add row</button>
          </div>
        </div>
        {deductions.length ? (
          deductions.map((deduction) => (
            <div className="deduction-edit-row" key={deduction.id}>
              <input value={deduction.name} onChange={(event) => onDeduction(deduction.id, { name: event.target.value })} />
              <select value={deduction.type} onChange={(event) => onDeduction(deduction.id, { type: event.target.value as DeductionType })}>
                <option value="percentage">%</option>
                <option value="flat">$</option>
                <option value="earned">+</option>
              </select>
              <input type="number" step="0.01" value={deduction.value} onChange={(event) => onDeduction(deduction.id, { value: Number(event.target.value) })} />
              <label className="switch"><input type="checkbox" checked={deduction.active} onChange={(event) => onDeduction(deduction.id, { active: event.target.checked })} /><span /></label>
              <button className="glass-icon danger" type="button" onClick={() => onDeleteDeduction(deduction.id)}><Trash2 /></button>
            </div>
          ))
        ) : (
          <div className="empty-state settings-empty">
            <div className="empty-illustration">%</div>
            <strong>No tax or earnings rows yet</strong>
            <span>Use Add row to create the exact deductions you want tracked.</span>
          </div>
        )}
      </div>
    </section>
  )
}

function ShiftModal({
  shift,
  setShift,
  onClose,
  onSave,
  onDelete,
}: {
  shift: Shift
  setShift: (shift: Shift) => void
  onClose: () => void
  onSave: (event: FormEvent) => void
  onDelete: () => void
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="modal-card glass-card" onSubmit={onSave}>
        <div className="section-head">
          <h2>Edit shift</h2>
          <button className="glass-icon" type="button" onClick={onClose}>x</button>
        </div>
        <div className="form-grid">
          <Field label="Date"><input type="date" value={shift.date} onChange={(event) => setShift({ ...shift, date: event.target.value })} /></Field>
          <Field label="Start"><input type="time" value={shift.startTime} onChange={(event) => setShift({ ...shift, startTime: event.target.value })} /></Field>
          <Field label="End"><input type="time" value={shift.endTime} onChange={(event) => setShift({ ...shift, endTime: event.target.value })} /></Field>
          <Field label="Location"><input value={shift.location} onChange={(event) => setShift({ ...shift, location: event.target.value })} /></Field>
        </div>
        <Field label="Notes"><textarea value={shift.notes || ''} onChange={(event) => setShift({ ...shift, notes: event.target.value })} /></Field>
        <div className="export-row">
          <button className="primary-button" type="submit"><Save /> Save</button>
          <button className="danger-button" type="button" onClick={onDelete}><Trash2 /> Delete</button>
        </div>
      </form>
    </div>
  )
}

function Toast({ message }: { message: string }) {
  return <div className="toast glass-card">{message}</div>
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function createSimplePdf(lines: string[]) {
  const safeLines = lines.map((line) =>
    line
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, ''),
  )
  const textCommands = safeLines
    .slice(0, 42)
    .map((line, index) => `BT /F1 11 Tf 48 ${760 - index * 16} Td (${line}) Tj ET`)
    .join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${textCommands.length} >>\nstream\n${textCommands}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefAt = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`
  return pdf
}

export default App
