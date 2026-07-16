import { summarizePay } from './src/lib/payroll.ts'
const ok = (l, g, w) => { const p = Math.abs(g - w) < 0.005; console.log(`${p?'PASS':'FAIL'} ${l}: ${g.toFixed(2)} (want ${w})`); if(!p) process.exitCode=1 }
const shift = { id:'s', date:'2026-07-17', startTime:'09:00', endTime:'11:00', location:'', breakMinutes:0, hoursOverride:25.70 }
const rows = [
  { id:'v', name:'Vacation Pay', type:'earned', value:4, active:true, earnedPercent:true, basedOn:'base' },
  { id:'ei', name:'EI', type:'percentage', value:1.63, active:true, basedOn:'running' },
  { id:'sc', name:'Accrued (non-cash)', type:'earned', value:1.667, active:true, earnedPercent:true, basedOn:'base', nonCash:true },
]
const sum = summarizePay([shift], rows, 15)
ok('Regular', sum.gross - sum.positiveAdjustments, 385.50)
ok('Vacation', sum.rows.find(r=>r.name==='Vacation Pay').amount, 15.42)
ok('Gross', sum.gross, 400.92)
ok('EI', sum.rows.find(r=>r.name==='EI').amount, 6.53)
ok('Net', sum.net, 400.92 - 6.53)
ok('Scholarship', sum.rows.find(r=>r.nonCash).amount, 6.43)
console.log('\nDONE exitCode', process.exitCode||0)
