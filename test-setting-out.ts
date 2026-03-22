import { computeSettingOut, checkCoordinate } from './src/lib/computations/settingOutEngine.js'

// TEST 1: BS Bearing computation
console.log('=== TEST 1: BS Bearing ===')
const station1 = { e: 484620.000, n: 9863280.000, rl: 50.100, ih: 1.540 }
const bs1 = { e: 484693.000, n: 9863310.000 }
const pts1 = [{ id: 'CL0+000', e: 484780.000, n: 9863390.000, rl: 48.900, th: 2.000 }]
const r1 = computeSettingOut(station1, bs1, pts1)
const designHz = r1.rows[0].HzDecimal
const designBearing = r1.bsBearingDecimal + designHz
console.log('BS bearing:', r1.bsBearing, '(brief had 067°36\'06", we compute 067°39\'33.7")')
console.log('BS bearing correct:', r1.bsBearing === '067°39\'33.7"' ? 'PASS ✓' : 'FAIL ✗')

// TEST 2: Setting out table for design point
console.log('\n=== TEST 2: Setting Out Table ===')
const row = r1.rows[0]
console.log('Hz angle:', row.HzAngle + '"', '(should be a valid DMS)')
console.log('HD:', row.HD.toFixed(3), 'm (should be positive)')
console.log('VA:', row.VA, '(should be DMS with sign)')
console.log('SD:', row.SD.toFixed(3), 'm (should be > HD)')
console.log('Height diff:', row.heightDiff.toFixed(3), 'm')
console.log('SD > HD:', row.SD > row.HD ? 'PASS ✓' : 'FAIL ✗')

// TEST 3: Tolerance check
// Bearing change: affects both E and N proportionally
// E error = HD * cos(bearing) * dθ → dθ = dE / (HD * cos(bearing)) for E-only shift
// HD change: E = sin(bearing) * HD → deltaE = sin(bearing) * deltaHD
// For 20mm E-only: deltaHD = 0.020 / sin(bearing) = 0.02427m (HD-only, N change = cos(bearing)*deltaHD = 13.8mm < 25mm)
// For 30mm combined: HD change + bearing change → N = 20.6mm, E = 30.0mm
console.log('\n=== TEST 3: Tolerance Check ===')
const station3 = { e: 484620.000, n: 9863280.000, rl: 50.100, ih: 1.540 }
const bs3 = { e: 484693.000, n: 9863310.000 }
const pt3 = { id: 'TEST', e: 484780.000, n: 9863390.000, rl: 48.900, th: 2.000 }

// 30mm case: use HD change + small bearing change
const deltaHD30 = 0.030 / Math.sin(designBearing * Math.PI / 180)
const newHD30 = r1.rows[0].HD + deltaHD30
const dTheta30 = (0.030 - Math.sin(designBearing * Math.PI / 180) * deltaHD30) / (r1.rows[0].HD * Math.cos(designBearing * Math.PI / 180))
const obsHz30 = designHz + dTheta30 * 180 / Math.PI
const checkR3 = checkCoordinate(station3, r1.bsBearingDecimal, {
  observedHz: obsHz30,
  observedHD: newHD30,
  observedRL: 48.870,
}, pt3)
console.log('30mm case:')
console.log('  deltaE:', checkR3.deltaE.toFixed(4), 'm')
console.log('  deltaN:', checkR3.deltaN.toFixed(4), 'm')
console.log('  Status (expect RED):', checkR3.hAccuracy, checkR3.hAccuracy === 'RED' ? 'PASS ✓' : 'FAIL ✗')

// 20mm case: HD-only (pure E-direction error)
const deltaHD20 = 0.020 / Math.sin(designBearing * Math.PI / 180)
const newHD20 = r1.rows[0].HD + deltaHD20
const checkR3b = checkCoordinate(station3, r1.bsBearingDecimal, {
  observedHz: designHz,
  observedHD: newHD20,
  observedRL: 48.885,
}, pt3)
console.log('\n20mm case (HD-only):')
console.log('  deltaE:', checkR3b.deltaE.toFixed(4), 'm')
console.log('  deltaN:', checkR3b.deltaN.toFixed(4), 'm')
console.log('  Status (expect GREEN):', checkR3b.hAccuracy, checkR3b.hAccuracy === 'GREEN' ? 'PASS ✓' : 'FAIL ✗')
