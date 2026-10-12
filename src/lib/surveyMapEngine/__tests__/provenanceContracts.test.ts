/**
 * Deliverable register + provenance contracts (blueprint §15, §28, §5.3, §2.5).
 *
 * These are the guarantees that turn "METARDU produced a correct document"
 * into "the document is provable": every export is registered with a revision,
 * a server-side content hash, the source data revision and the CRS it states;
 * every computation records algorithm identity and input/output hashes; every
 * QA PASS carries rule, measurement, threshold and the revisions it judged.
 *
 * No database is available in unit tests, so these tests pin the *contracts*
 * (shape, hashing determinism, immutability rules, wiring into export paths)
 * rather than database behaviour.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8')

/**
 * The hashing rule the register depends on, mirrored from
 * `lib/deliverables/deliverableRegister` so this suite stays database-free.
 */
const hashDeliverableContent = (content: string | Buffer | Uint8Array) =>
  createHash('sha256').update(content).digest('hex')

describe('content hashing (tamper evidence)', () => {
  test('the same bytes always hash the same, and a one-character change does not', () => {
    const a = Buffer.from('PARCEL PLAN R01')
    const b = Buffer.from('PARCEL PLAN R02')
    expect(hashDeliverableContent(a)).toBe(hashDeliverableContent(Buffer.from('PARCEL PLAN R01')))
    expect(hashDeliverableContent(a)).not.toBe(hashDeliverableContent(b))
    expect(hashDeliverableContent(a)).toMatch(/^[0-9a-f]{64}$/)
  })

  test('string and byte inputs agree', () => {
    expect(hashDeliverableContent('abc')).toBe(hashDeliverableContent(Buffer.from('abc')))
  })
})

describe('deliverable schema (blueprint §15, §28)', () => {
  const migration = read('src/lib/db/migrations/072_deliverables_computations_qa.sql')

  test('deliverables carry status, reviewer, approval and supersession', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS deliverables/)
    expect(migration).toMatch(/status\s+VARCHAR\(20\) NOT NULL DEFAULT 'DRAFT'/)
    expect(migration).toMatch(/'APPROVED'/)
    expect(migration).toMatch(/'SUPERSEDED'/)
    expect(migration).toMatch(/superseded_by\s+UUID REFERENCES deliverables\(id\)/)
    expect(migration).toMatch(/reviewed_by/)
    expect(migration).toMatch(/approved_at/)
    expect(migration).toMatch(/source_revision/)
  })

  test('revisions are append-only and content-addressed', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS deliverable_revisions/)
    expect(migration).toMatch(/content_hash\s+VARCHAR\(128\) NOT NULL/)
    expect(migration).toMatch(/deliverable_revisions are append-only/)
    expect(migration).toMatch(/BEFORE UPDATE OR DELETE ON deliverable_revisions/)
    // One live document per (project, type); a re-issue supersedes, never duplicates.
    expect(migration).toMatch(/idx_deliverables_project_type_current/)
  })

  test('computation runs store algorithm identity and input/output hashes (§5.3)', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS computation_runs/)
    for (const column of ['algorithm_id', 'algorithm_version', 'input_version', 'parameters', 'input_hash', 'output_hash', 'qa_summary']) {
      expect(migration).toMatch(new RegExp(column))
    }
  })

  test('QA results cannot be a bare verdict (§2.5)', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS qa_results/)
    expect(migration).toMatch(/check_type\s+VARCHAR\(80\) NOT NULL/)
    expect(migration).toMatch(/measured_value\s+NUMERIC/)
    expect(migration).toMatch(/threshold_value\s+NUMERIC/)
    // The run records which revisions and which tolerance profile judged it.
    expect(migration).toMatch(/tolerance_profile_version/)
    expect(migration).toMatch(/data_revision/)
    expect(migration).toMatch(/design_revision/)
  })
})

describe('provenance writers are wired into the real workflow', () => {
  const fieldToFinish = read('src/app/api/project/[id]/field-to-finish/route.ts')
  const exportRoute = read('src/app/api/project/[id]/export/route.ts')
  const qaRoute = read('src/app/api/project/[id]/qa/route.ts')
  const dashboard = read('src/components/dashboard/QADashboard.tsx')

  test('the compute path records the run and the QA evidence', () => {
    expect(fieldToFinish).toMatch(/recordComputationRun\(\{/)
    expect(fieldToFinish).toMatch(/algorithmId: 'field-to-finish\.pipeline'/)
    expect(fieldToFinish).toMatch(/inputHash: hashDeliverableContent/)
    expect(fieldToFinish).toMatch(/outputHash: hashDeliverableContent/)
    expect(fieldToFinish).toMatch(/recordQaRun\(\{/)
    // A PASS always carries its threshold.
    expect(fieldToFinish).toMatch(/thresholdValue: TRAVERSE_PRECISION_STANDARDS\[input\.surveyType\]/)
    expect(fieldToFinish).toMatch(/trigger: 'on_compute'/)
  })

  test('exports register a revision and emit EXPORTED evidence', () => {
    expect(exportRoute).toMatch(/registerDeliverable\(\{/)
    expect(exportRoute).toMatch(/sourceRevision: dataRevision/)
    expect(exportRoute).toMatch(/projectCrs: projectCrsCode/)
    // Registration must never silently fail.
    expect(exportRoute).toMatch(/X-Metardu-Register-Warning/)
  })

  test('the QA endpoint validates verdicts instead of trusting the client', () => {
    expect(qaRoute).toMatch(/z\.enum\(\['PASS', 'WARN', 'FAIL', 'INFO'\]\)/)
    expect(qaRoute).toMatch(/Each result needs a checkType/)
    expect(qaRoute).toMatch(/requireProjectOwnership/)
  })

  test('the QA dashboard persists what it shows', () => {
    expect(dashboard).toMatch(/persistQaRun/)
    expect(dashboard).toMatch(/checkType: `dashboard\.\$\{check\.id\}`/)
  })
})

describe('the dashboard never reports an unearned pass', () => {
  const dashboard = read('src/components/dashboard/QADashboard.tsx')

  test('an unmeasured misclosure is pending, not failed or passed', () => {
    expect(dashboard).toMatch(/Number\.isFinite\(traverseData\.angularMisclosureSec\)/)
    expect(dashboard).toMatch(/Independent angular observations were not supplied\./)
  })

  test('pending checks block the ready verdict', () => {
    expect(dashboard).toMatch(/stats\.pending > 0 \|\| stats\.total === 0 \|\| stats\.pass === 0/)
    expect(dashboard).toMatch(/NOT ASSESSED YET/)
  })

  test('the stable empty-parcels default prevents a render loop', () => {
    expect(dashboard).toMatch(/const EMPTY_PARCELS: ExistingParcel\[\] = \[\]/)
    expect(dashboard).not.toMatch(/parcels = \[\],/)
  })
})

describe('recorders are typed so a verdict cannot be invented', () => {
  const provenance = read('src/lib/provenance/computationAndQa.ts')

  test('the QA result kind is a closed union and tolerance stays versioned', () => {
    expect(provenance).toMatch(/export type QaResultKind = 'PASS' \| 'WARN' \| 'FAIL' \| 'INFO'/)
    expect(provenance).toMatch(/tolerance_profile_version/)
    expect(provenance).toMatch(/resolveToleranceProfile/)
    // A run is refused when nothing was checked.
    expect(read('src/app/api/project/[id]/qa/route.ts')).toMatch(
      /A QA run needs at least one result/
    )
  })
})
