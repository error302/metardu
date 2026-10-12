/**
 * Field set-out screen contracts (blueprint §11.3, §27).
 *
 * The field screen is where a surveyor acts on a verdict, so the safety rules
 * are pinned here: a coarse fix must not be shown as "on target", a FAIL must
 * not be recordable as a clean stake, and every recorded shot must be the same
 * judgement the office engine makes.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_SETOUT_TOLERANCE, evaluateSetoutShot } from '../../engineering/verticality'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const page = readFileSync(join(repoRoot, 'src/app/field/setout/page.tsx'), 'utf8')
const hub = readFileSync(join(repoRoot, 'src/app/field/page.tsx'), 'utf8')

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
    // Fix accuracy is optional but recorded: it is what makes a PASS provable.
    expect(page).toMatch(/aria-label="Fix accuracy"/)
  })
})

describe('safety rules on the field screen', () => {
  test('the local judgement uses the same tolerances as the engine', () => {
    expect(page).toMatch(/evaluateSetoutShot\(/)
    expect(page).toContain('toleranceProfile?.horizontalM ?? DEFAULT_SETOUT_TOLERANCE.horizontalM')
    expect(page).toContain('toleranceProfile?.verticalM ?? DEFAULT_SETOUT_TOLERANCE.verticalM')
    expect(page).toContain('horizontalM: horizontalToleranceM, verticalM: verticalToleranceM')
    expect(DEFAULT_SETOUT_TOLERANCE.horizontalM).toBe(0.01)
    expect(DEFAULT_SETOUT_TOLERANCE.verticalM).toBe(0.005)
  })

  test('a coarse fix yields INFO, never "on target"', () => {
    const result = evaluateSetoutShot(
      { designE: 100, designN: 200, designZ: 10, observedE: 100.001, observedN: 200, observedZ: 10 },
      { ...DEFAULT_SETOUT_TOLERANCE, accuracyM: 0.05 }
    )
    expect(page).toMatch(/evaluateSetoutShot\(/)
    expect(result.result).toBe('INFO')
    expect(result.message).toMatch(/cannot prove/i)
  })

  test('the move instruction is the inverse of the error (it tells the surveyor where to go)', () => {
    const result = evaluateSetoutShot({
      designE: 100, designN: 200, designZ: 10,
      observedE: 100.02, observedN: 199.99, observedZ: 10.03,
    })
    expect(result.moveE).toBeCloseTo(-result.dE, 9)
    expect(result.moveN).toBeCloseTo(-result.dN, 9)
    expect(result.moveZ).toBeCloseTo(-result.dZ!, 9)
    expect(page).toMatch(/Correction to design \(project grid\)/)
    expect(page).toMatch(/verdict\.moveE/)
    expect(page).toMatch(/verdict\.moveN/)
  })

  test('an INFO shot cannot be recorded as a clean stake', () => {
    expect(page).toMatch(/verdict\??\.result === 'INFO'/)
    expect(page).toMatch(/disabled=\{saving \|\| !verdict \|\| verdict\.result === 'INFO'\}/)
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
