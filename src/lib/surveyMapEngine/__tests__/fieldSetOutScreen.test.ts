/**
 * Field set-out screen contracts (blueprint §11.3, §27).
 *
 * The field screen is where a surveyor acts on a verdict, so the safety rules
 * are pinned here: a coarse fix must not be shown as "on target", missing
 * evidence must remain unassessed, and every recorded shot must be the same
 * judgement the office engine makes.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeSetoutDeltas } from '../../engineering/verticality'
import { evaluateSetoutCaptureEvidence } from '../../field/setoutCapture'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const page = readFileSync(join(repoRoot, 'src/app/field/setout/page.tsx'), 'utf8')
const hub = readFileSync(join(repoRoot, 'src/app/field/page.tsx'), 'utf8')
const fixtureCrs = 'EPSG:21037'
const point = { easting: 500000, northing: 9800000, rl: null }
const profile = { id: 'synthetic-criteria', name: 'Synthetic criteria', jurisdiction: 'Synthetic job', version: 'R1', horizontalM: 0.01, verticalM: 0.005, effectiveDate: '2026-10-14', source: 'Synthetic drawing', approvedBy: 'Synthetic reviewer' }
const evidence = { horizontalCrs: fixtureCrs, definitionCrs: fixtureCrs, deviceCrs: fixtureCrs, verticalDatum: null, capturedAt: null, design: point, capturedDesign: point, observed: point, reportedAccuracyM: 0.001, capturedToleranceProfileId: profile.id, profile }

describe('the field screen walks one project definition', () => {
  test('it reads the definition and its points from the project set-out API', () => {
    expect(page).toMatch(/api\/project\/\$\{projectId\}\/setout\?definitionId=/)
    expect(page).toMatch(/api\/project\/\$\{projectId\}\/setout`/)
    expect(page).toMatch(/definitionId/)
  })

  test('it is reachable from the field hub', () => {
    expect(hub).toMatch(/\/field\/setout\?projectId=/)
  })

  test('it works a single target at a time with big numeric entry', () => {
    expect(page).toMatch(/Target \{target\.label\}/)
    expect(page).toMatch(/inputMode="decimal"/)
    expect(page).toMatch(/aria-label="Observed easting"/)
    expect(page).toMatch(/aria-label="Observed northing"/)
    expect(page).toMatch(/aria-label="Observed reduced level"/)
    // An absent accuracy remains unassessed rather than becoming a perfect fix.
    expect(page).toMatch(/aria-label="Fix accuracy"/)
  })
})

describe('safety rules on the field screen', () => {
  test('the local judgement uses current capture authority without fallback criteria', () => {
    expect(/evaluateSetoutCaptureEvidence\(/.test(page)).toBe(true)
    expect(page.includes('DEFAULT_SETOUT_TOLERANCE')).toBe(false)
    const assessment = evaluateSetoutCaptureEvidence({ ...evidence, profile: null }, false)
    expect(assessment.tolerance.horizontalM).toBeNull()
    expect(assessment.tolerance.verticalM).toBeNull()
    expect(assessment.assessment.result).toBe('INFO')
  })

  test('a coarse fix yields INFO, never "on target"', () => {
    const result = evaluateSetoutCaptureEvidence({ ...evidence, reportedAccuracyM: 0.05 }, false).assessment
    expect(/evaluateSetoutCaptureEvidence\(/.test(page)).toBe(true)
    expect(result.result).toBe('INFO')
    expect(result.message).toMatch(/cannot prove/i)
  })

  test('the move instruction is the inverse of the error (it tells the surveyor where to go)', () => {
    const result = computeSetoutDeltas({
      designE: 100, designN: 200, designZ: 10,
      observedE: 100.02, observedN: 199.99, observedZ: 10.03,
    })
    expect(result.moveE).toBeCloseTo(-result.dE, 9)
    expect(result.moveN).toBeCloseTo(-result.dN, 9)
    if (result.dZ === null) throw new Error('The supplied levels must produce a vertical delta.')
    expect(result.moveZ).toBeCloseTo(-result.dZ, 9)
    expect(page).toMatch(/Correction to design \(project grid\)/)
    expect(page).toMatch(/verdict\.moveE/)
    expect(page).toMatch(/verdict\.moveN/)
  })

  test('an INFO shot cannot be recorded as a clean stake', () => {
    expect(page).toMatch(/verdict\??\.result === 'INFO'/)
    expect(/disabled=\{saving \|\| !verdict \|\| verdict\.result === 'INFO' \|\| \(usingOfflinePlan && !offlinePlanConfirmed\)\}/.test(page)).toBe(true)
    expect(page.includes('Save unassessed observation')).toBe(true)
    expect(/recordShot\(true\)/.test(page)).toBe(true)
  })

  test('shots are queued on the device, then delivered (offline-safe)', () => {
    expect(page).toMatch(/saveShotLocally\(\{/)
    expect(page).toMatch(/deliverShot\(local\)/)
    expect(page).toMatch(/observedEasting: e/)
    expect(page).toMatch(/accuracyM: fix\.value/)
    // The field verdict is preserved with the shot so the record is self-describing.
    expect(page).toMatch(/result: verdict\.result/)
  })
})
