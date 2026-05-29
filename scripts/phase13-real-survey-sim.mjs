const demoProjects = {
  topographicRoad: {
    projectName: 'Kangundo Road Junction Improvement Topographic Survey',
    regNo: 'RS149',
    submissionNo: 'RS149_2026_002_R00',
  },
  cadastral: {
    projectName: 'Subdivision Survey for L.R. No. Kajiado/Kaputiei North/18462',
    submissionNo: 'RS087_2026_014_R00',
  },
  engineeringControl: {
    projectName: 'Athi River Industrial Park Control Extension',
    submissionNo: 'RS233_2026_006_R01',
  },
}

const detailTolerances = [
  ['Structures, buildings, paved roads', 0.025, 0.015],
  ['Gravel pavements', 0.05, 0.025],
  ['All other areas', 0.1, 0.05],
]

function logCheck(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`)
  if (!ok) process.exitCode = 1
}

function buildSubmissionNumber({ registrationNo, year, sequence, revision }) {
  return `${registrationNo}_${year}_${String(sequence).padStart(3, '0')}_R${String(revision).padStart(2, '0')}`
}

function validateSubmissionNumber(value) {
  return /^[A-Z]{1,4}\d{1,6}_\d{4}_\d{3}_R\d{2}$/.test(value)
}

function traverseMisclosure(legs) {
  let sumDep = 0
  let sumLat = 0
  let perimeter = 0

  for (const leg of legs) {
    const rad = leg.bearingDeg * Math.PI / 180
    sumDep += leg.distance * Math.sin(rad)
    sumLat += leg.distance * Math.cos(rad)
    perimeter += leg.distance
  }

  const linear = Math.hypot(sumDep, sumLat)
  return { linear, perimeter, precision: perimeter / linear }
}

function levellingClosure(readings, openingRL, closingRL, distanceKm) {
  const sumBS = readings.reduce((sum, row) => sum + (row.bs || 0), 0)
  const sumFS = readings.reduce((sum, row) => sum + (row.fs || 0), 0)
  const computedClosing = openingRL + sumBS - sumFS
  const misclosure = computedClosing - closingRL
  const allowableMm = 10 * Math.sqrt(distanceKm)
  return { computedClosing, misclosureMm: misclosure * 1000, allowableMm }
}

const road = demoProjects.topographicRoad
const generated = buildSubmissionNumber({ registrationNo: road.regNo, year: 2026, sequence: 2, revision: 0 })
logCheck('SRVY2025-1 submission format', generated === road.submissionNo, generated)
logCheck('Cadastral submission sample', validateSubmissionNumber(demoProjects.cadastral.submissionNo), demoProjects.cadastral.submissionNo)
logCheck('Control submission sample', validateSubmissionNumber(demoProjects.engineeringControl.submissionNo), demoProjects.engineeringControl.submissionNo)

const traverse = traverseMisclosure([
  { distance: 242.420, bearingDeg: 36.8698976 },
  { distance: 242.420, bearingDeg: 126.8698976 },
  { distance: 242.420, bearingDeg: 216.8698976 },
  { distance: 242.416, bearingDeg: 306.8698976 },
])
logCheck('Road traverse computes', Number.isFinite(traverse.linear), `linear misclosure ${traverse.linear.toFixed(4)} m`)
logCheck('Road traverse professional precision', traverse.precision > 10000, `1:${Math.round(traverse.precision)}`)

const level = levellingClosure([
  { station: 'BM01', bs: 1.422 },
  { station: 'TP02', fs: 1.114 },
  { station: 'TP02', bs: 1.392 },
  { station: 'BM03', fs: 1.878 },
], 1538.426, 1538.250, 1.2)
logCheck('Levelling closure computes', Number.isFinite(level.misclosureMm), `${level.misclosureMm.toFixed(1)} mm`)
logCheck('Levelling tolerance applies', Math.abs(level.misclosureMm) <= level.allowableMm, `${level.allowableMm.toFixed(1)} mm allowable`)

logCheck('RDM Table 5.2 loaded', detailTolerances.length === 3, `${detailTolerances.length} tolerance classes`)
