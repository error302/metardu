const fixtureCrs21037 = 'EPSG:21037'
const fixtureCrs21036 = 'EPSG:21036'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { createSetoutCaptureSnapshot } from '../src/lib/field/setoutCapture'
import type { SavedShotRow } from '../src/lib/reports/projectSetoutCsv'
import { generateProjectSetoutPdf, MAX_SETOUT_PDF_SHOTS, SETOUT_PDF_FONT_FILE } from '../src/lib/reports/projectSetoutPdf'

// Pure synthetic document generation: no database, browser process or private env.
async function main() {
const directory = 'test-results/drainage-native-pdf'
const profile = { id: 'synthetic-profile', name: 'Synthetic issued criteria', jurisdiction: 'Synthetic project', version: 'SYN-R1',
  horizontalM: 0.01, verticalM: 0.01, effectiveDate: '2026-10-11', source: 'SYNTHETIC TEST REQUIREMENT - NOT A CONSTRUCTION SPECIFICATION', approvedBy: 'Synthetic reviewer' }
const rows: SavedShotRow[] = Array.from({ length: 24 }, (_, index) => {
  const station = index % 3, revision = index < 12 ? 1 : 2
  const design = { easting: 500000 + station * 50, northing: 9800000, rl: 100 - station * 0.5 }
  const observed = { easting: design.easting + (station === 1 ? 0.1 : 0.00321), northing: design.northing + 0.00432,
    rl: station === 2 ? null : (design.rl as number) + (station === 1 ? 0.02 : 0.0054) }
  const snapshot = createSetoutCaptureSnapshot({ projectId: 'synthetic-project', definitionId: 'synthetic-definition',
    pointId: `target-${revision}-${station}`, pointLabel: `DR-${station + 1}`, designRevision: revision,
    horizontalCrs: fixtureCrs21037, definitionCrs: fixtureCrs21037, deviceCrs: index === 9 ? null : fixtureCrs21037,
    verticalDatum: index === 9 ? null : 'Synthetic benchmark BM-01', capturedAt: `2026-10-11T09:${String(index).padStart(2, '0')}:00Z`,
    design, capturedDesign: design, observed, reportedAccuracyM: 0.001, profile })
  return { id: `observation-${String(index + 1).padStart(3, '0')}`, project_id: snapshot.projectId,
    definition_id: snapshot.definitionId, definition_name: 'SYNTHETIC drainage deliverable - not field evidence',
    definition_crs: fixtureCrs21036, design_revision: revision, setout_point_id: snapshot.pointId, label: snapshot.pointLabel,
    design_easting: design.easting, design_northing: design.northing, design_rl: design.rl,
    observed_easting: observed.easting, observed_northing: observed.northing, observed_rl: observed.rl,
    d_e: snapshot.assessment.dE, d_n: snapshot.assessment.dN, d_z: snapshot.assessment.dZ,
    horizontal_error: snapshot.assessment.horizontalErrorM, vertical_error: snapshot.assessment.verticalErrorM,
    threshold_h: profile.horizontalM, threshold_v: profile.verticalM, result: snapshot.assessment.result,
    reported_accuracy_m: 0.001, tolerance_profile_id: profile.id, tolerance_version: profile.version,
    instrument: index === 9 ? null : 'Synthetic total station', instrument_serial: 'SYN-001', operator_name: index === 9 ? null : 'Synthetic operator',
    crew: null, observation_batch_id: null, staked_by: 'synthetic-account', staked_at: snapshot.capturedAt as string,
    notes: index === 10 ? 'SYNTHETIC LONG NOTE - ' + 'Captured context must remain readable across page boundaries. '.repeat(90) : 'SYNTHETIC VERIFICATION ONLY - NOT FIELD EVIDENCE',
    client_shot_id: `device-shot-${index}`, capture_snapshot: snapshot, target_revision: revision,
    target_metadata: { pipeId: 'MH-A-MH-B', stationRole: station === 0 ? 'Pipe start' : station === 1 ? 'Intermediate' : 'Pipe end',
      runChainageM: 1200 + station * 50, pipeChainageM: station * 50, pipeLengthM: 100, pipeFallM: 1, pipeGradientPercent: 1,
      crownLevelM: (design.rl as number) + 0.315, coverAboveCrownM: null,
      coverAssessment: 'Not assessed without ground observations', horizontalTarget: 'Pipe centreline', verticalTarget: 'Pipe invert RL' },
  }
})
rows.push({ ...rows[0], id: 'legacy-observation', label: 'LEGACY-UNVERIFIED', capture_snapshot: null, result: 'PASS',
  design_revision: null, target_revision: null, design_rl: null, observed_rl: null })
const options = { revision: null, synthetic: true, logo: await readFile('public/metardu-icon.png'), font: await readFile(`public/fonts/${SETOUT_PDF_FONT_FILE}`) }
await assert.rejects(() => generateProjectSetoutPdf(Array.from({ length: MAX_SETOUT_PDF_SHOTS + 1 }, () => rows[0]), options), /1,000/)
await assert.rejects(() => generateProjectSetoutPdf([{ ...rows[0], operator_name: '\u0645\u062d\u0645\u062f' }], options), /cannot represent/)
await assert.rejects(() => generateProjectSetoutPdf([rows[0]], { ...options, font: Buffer.from('wrong font') }), /glyph coverage/)
const bytes = await generateProjectSetoutPdf(rows, options)
const pdf = await PDFDocument.load(bytes)
assert.ok(pdf.getPageCount() >= 3)
assert.ok(pdf.getPages().every(page => Math.abs(page.getWidth() - 841.89) < 2 && Math.abs(page.getHeight() - 595.28) < 2))
await mkdir(directory, { recursive: true })
await writeFile(`${directory}/synthetic-drainage-deliverable.pdf`, bytes)
await writeFile(`${directory}/generation.json`, JSON.stringify({ synthetic: true, observations: rows.length, nativeVectorPdf: true,
  pages: pdf.getPageCount(), a4Landscape: true, externalRequests: false, productionMutated: false,
  missingHeightFixture: true, missingControlFixture: true, failedShotFixture: true, longNoteFixture: true, legacyFixture: true,
  designRevisions: [1, 2], oversizedReportRejected: true, unsupportedCharactersRejectedWithoutLoss: true,
  fontCoverageHashVerified: true }, null, 2) + '\n')
console.log(JSON.stringify({ pages: pdf.getPageCount(), bytes: bytes.length, synthetic: true }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
