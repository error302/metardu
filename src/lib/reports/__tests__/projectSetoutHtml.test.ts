import { createSetoutCaptureSnapshot,parseSetoutCaptureSnapshot } from '@/lib/field/setoutCapture'
import archived from '@/test-utils/fixtures/setout-capture-v1.json'
import { defined } from '@/test-utils/defined'
import { generateProjectSetoutHtml } from '../projectSetoutHtml'
import type { SavedShotRow } from '../projectSetoutCsv'
const captureCrs = 'EPSG:' + 21037
const editedCrs = 'EPSG:' + 21036

const snapshot = defined(parseSetoutCaptureSnapshot(archived))
const row: SavedShotRow = {
  id: 'shot-1', project_id: 'project-1', definition_id: 'definition-1', definition_name: 'Synthetic drain line',
  definition_crs: editedCrs, design_revision: 3, setout_point_id: 'point-1', label: 'MH-01',
  design_easting: '500000.000', design_northing: '9860000.000', design_rl: '100.000',
  observed_easting: '500000.003', observed_northing: '9860000.004', observed_rl: '100.005',
  d_e: '0.0032', d_n: '0.0043', d_z: '0.0054', horizontal_error: '0.0054', vertical_error: '0.0054',
  threshold_h: '0.0100', threshold_v: '0.0050', result: 'WARN', reported_accuracy_m: '0.0010',
  tolerance_profile_id: null, tolerance_version: 'METARDU-1', instrument: 'Synthetic total station', instrument_serial: null,
  operator_name: null, crew: null, observation_batch_id: null, staked_by: 'user-1', staked_at: '2026-10-08T06:35:00Z',
  notes: '<script>alert(1)</script>', client_shot_id: 'device-1', capture_snapshot: snapshot,
}
test('uses captured precision and CRS after the definition changes, retaining a near-limit warning', () => {
  const html = generateProjectSetoutHtml([row], { revision: 3, synthetic: true })
  expect(html).toContain('+0.0054')
  expect(html).toContain('WARN')
  expect(html).toContain(captureCrs)
  expect(html).not.toContain(editedCrs)
  expect(html).not.toContain('WITHIN ENTERED LIMITS')
  expect(html).toContain('shot-1')
  expect(html).toContain('2026-10-08T06:30:00.000Z')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
})
test('does not reconstruct a PASS, CRS, timestamp or criteria for legacy observations', () => {
  const html = generateProjectSetoutHtml([{ ...row, capture_snapshot: null, result: 'PASS', definition_crs: null }], { revision: 3 })
  expect(html).toContain('Legacy observations — NOT ASSESSED')
  expect(html).not.toContain('WITHIN ENTERED LIMITS')
  expect(html).not.toContain('EPSG:')
})
test('missing capture reference evidence cannot earn a report PASS', () => {
  const incomplete = createSetoutCaptureSnapshot({ ...snapshot, deviceCrs: null, profile: null })
  const html = generateProjectSetoutHtml([{ ...row, result:incomplete.assessment.result,tolerance_version:incomplete.tolerance.version,capture_snapshot: incomplete }], { revision: 3 })
  expect(html).toContain('Capture CRS was not confirmed by both device and definition')
  expect(html).toContain('NOT ASSESSED')
})
test('rejects corrupted snapshot evidence instead of silently exporting the rounded row', () => {
  expect(() => generateProjectSetoutHtml([{ ...row, capture_snapshot: { ...snapshot, projectId: 'other-project' } }], { revision: 3 })).toThrow(/capture evidence/)
})

test('keeps different recorded criteria in separate sections instead of applying the newer limit to old shots', () => {
  const profile = { id: 'profile-2', name: 'Synthetic issued criteria', jurisdiction: 'Synthetic contract', version: 'R02',
    horizontalM: 0.02, verticalM: 0.01, effectiveDate: '2026-10-08', source: 'Synthetic drawing D02', approvedBy: 'Synthetic approver' }
  const newer = createSetoutCaptureSnapshot({ ...snapshot, profile,capturedToleranceProfileId:profile.id,deviceVerticalDatum:snapshot.verticalDatum,reportedVerticalAccuracyM:0.001 })
  const html = generateProjectSetoutHtml([row, { ...row, id: 'shot-2', result: 'PASS', tolerance_profile_id: profile.id,
    tolerance_version: profile.version, threshold_h: profile.horizontalM, threshold_v: profile.verticalM, capture_snapshot: newer }], { revision: 3 })
  expect((html.match(/<section class="capture-section">/g) ?? []).length).toBe(2)
  expect((html.match(/<!DOCTYPE html>/g) ?? []).length).toBe(1)
  expect(html).toContain('WARN')
  expect(html).toContain('Synthetic drawing D02 / R02')
  expect(html).toContain('± 0.005 m')
  expect(html).toContain('± 0.01 m')
})

test('includes revision-bound drainage chainage and grade without inventing missing cover', () => {
  const drainageRow = { ...row, target_revision: 3, target_metadata: {
    pipeId: 'MH-A-MH-B', stationRole: 'Intermediate', runChainageM: 150, pipeChainageM: 50,
    horizontalTarget: 'Pipe centreline', verticalTarget: 'Pipe invert RL',
    pipeLengthM: 100, pipeFallM: 1, pipeGradientPercent: 1,
    coverAboveCrownM: null, coverAssessment: 'Not assessed between surveyed manholes',
  } }
  const html = generateProjectSetoutHtml([drainageRow], { revision: 3 })
  expect(html).toContain('Chainage: 150 m')
  expect(html).toContain('Pipe chainage: 50 m')
  expect(html).toContain('Fall: 1 m; gradient: 1%')
  expect(html).toContain('Not assessed between surveyed manholes')
  expect(html).toContain('Survey control is not verified by this report')
  const rounded = generateProjectSetoutHtml([{ ...drainageRow,
    target_metadata: { ...drainageRow.target_metadata, coverAboveCrownM: 1.6850000000000023 } }], { revision: 3 })
  expect(rounded).toContain('Cover: 1.685 m')
  expect(rounded).not.toContain('1.6850000000000023')
  expect(rounded).toContain('100.0054')
})

test('does not attach target context from a different revision or reconstruct missing pipe grade', () => {
  const html = generateProjectSetoutHtml([{ ...row, target_revision: 4,
    target_metadata: { pipeId: 'WRONG-REVISION', runChainageM: 999 } }], { revision: 3 })
  expect(html).not.toContain('WRONG-REVISION')
  expect(html).not.toContain('Chainage: 999')
})

test('exports current unassessed coordinates without substituting rounded rows or invented criteria',()=>{
  const capture=createSetoutCaptureSnapshot({...snapshot,profile:null,observed:{...snapshot.observed,easting:500000.0001234567},reportedVerticalAccuracyM:null})
  const html=generateProjectSetoutHtml([{...row,result:'INFO',tolerance_version:null,threshold_h:null,threshold_v:null,capture_snapshot:capture}],{revision:3})
  expect(html).toContain('Captured observations — NOT ASSESSED')
  expect(html).toContain('500000.0001234567')
  expect(html).not.toContain('METARDU default numeric criteria')
  expect(html).not.toContain('WITHIN ENTERED LIMITS')
})
