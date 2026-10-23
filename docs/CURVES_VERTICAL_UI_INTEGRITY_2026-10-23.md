# Curves vertical tab and draft exports — 23 October 2026

This source checkpoint replaces the duplicate vertical calculation on
`/tools/curves` with the reviewed `VerticalCurveCalculator`. It retains PDF and
CSV export and adds them to the same shared calculator used on road design.
It does not deploy an application, validate every curve tab or complete the
field-to-finish production goal.

## Reproduced behavior

The previous vertical tab prefilled grades, station, level and K. It accepted
numeric prefixes, replaced missing station parts with zero, retained stale
outputs after edits, rejected equal grades and omitted the sag minimum. Its
20 m loop was independent of the reviewed bounded engine. A fixed MIN_K table
produced RDM compliance verdicts without adopted criteria. Those verdicts were
also exported. The page passed edited grades into an older result's profile.

Five real page regressions initially failed. They cover blank inputs, exact sag
station, removal of stale profile/table/export actions, straight profiles and
actual CSV download content. The replacement delegates to the shared engine and
component rather than maintaining a third copy of the equations.

## Corrected behavior

- The vertical tab begins with blank geometry/level inputs. Sampling interval
  alone defaults to 20 m; it is not an adopted design criterion. Strict finite
  parsing, exactly one length/K authority and bounded sampling come from the
  reviewed calculator/engine. Zero and negative stations/levels remain valid.
- Exact BVC/EVC and unique in-curve stationary points are retained. Equal grades
  yield a straight profile with undefined K and no unique stationary point.
  Dense profile samples use the same parabola. The tab no longer reports an
  unadopted K or RDM compliance result.
- Every input/mode edit clears the result and export actions. A late PDF module
  load cannot download an earlier design after an edit or component unmount;
  source tests exercise this through the actual download boundary.
- CSV runs synchronously from the loaded calculator without loading the PDF
  renderer. A dedicated regression first reproduced that unintended dependency
  (one failure, four controls passing), then passed after separation.
- PDF/CSV are generated from the current computed input snapshot. Errors appear
  inline. Temporary download anchors are removed and blob URLs are released
  after browser consumption. No project record or approval is fabricated.
- CSV retains calculation precision plus input grades, station/level, length/K
  authority, interval, model, draft status, standard assessment and unverified
  datum status on each row. A flat profile records undefined K explicitly.
- The A3 landscape PDF includes supplied inputs, summary, complete schedule,
  endpoint/stationary labels and review notes. Printed numbers use four decimal
  places; this is display precision, not a survey tolerance. It states that
  the local draft has no assigned project or verified vertical datum.
- Independent multi-page review found that continuation pages lacked an explicit
  unapproved status. The file-reader assertion reproduced a failure on dense
  page 2. The shared engineering-schedule footer now states **DRAFT - NOT
  APPROVED FOR CONSTRUCTION on every page**, retaining the existing page counter
  and professional review instruction. This changes footer text only.

The other tabs remain visible. Their calculation body, the solution wrappers,
spiral component and shared road engine match the parent commit exactly. Their
existing defaults, async validation and standards/export paths are preserved,
not certified by this repair.

## Verification evidence

**89 tests across five suites pass:** actual curves page, shared vertical UI,
vertical numerical integrity, adjacent engineering-schedule PDF and curve API.
The CSV test reads the actual browser Blob and verifies the unrounded stationary
station and provenance; it does not replace the export builder with a mock.
The external anchor click is intercepted only to avoid test navigation.

`node scripts/verify-vertical-curve-draft.mjs` produces five pure source CSV/PDF
pairs: sag, crest/K, flat zero, negative level/station and a dense multi-page
schedule. No network, account, database, customer drawing or service is involved.
Source hashes are verified before/after, adapters are restored in finally and
the receipt records running/failed states rather than leaving stale success.

`scripts/verify-vertical-curve-draft.py --browser`, using existing bundled Python
and pypdf, reads those files and the actual source-preview download pair. All
**six pairs / 241 schedule rows / 11 PDF pages pass**. Independent 50-digit
Decimal calculations verify station, level, tangent offset, grade, K, exact
endpoints and the unique stationary point. PDF text is parsed independently:
every printed row matches its source to display precision, table headers recur
on continuation pages, draft status and page numbers appear on every page.
The browser CSV is byte-identical to the final source fixture.

The numerical anchor is G1=-2%, G2=4%, VPI station 1003 m / RL 100 m,
length 200 m: BVC 903 m / RL 102 m; EVC 1103 m / RL 104 m; low point
969.6666666667 m / RL 101.3333333333 m. A 37 m sampling interval retains that
point independently of ordinary pegs. K=40 derives length 240 m and a low point
at station 963 m / RL 101.6 m.

CUA on the owned preview `127.0.0.1:3021/tools/curves` verified blank entry,
L/K calculations, the exact sag point, inline missing-grade error, stale-output
removal and actual PDF/CSV downloads. The profile was inspected at desktop and
390x844 mobile size; document client/content width both measured 380 px excluding
the scrollbar. The viewport override was reset. This was a public local
calculation, not signed-in project/production/field acceptance.

Poppler rendered the actual downloaded PDF and the dense report's first/last
pages for visual inspection. The final last page visibly retains its repeated
table header, EVC row, notes, explicit draft footer and page 6 of 6. Poppler
reported missing optional Symbol/ArialUnicode display fonts; this report uses
the normal Latin font, and the rendered data and parsed text were verified.

After this browser verification, the CSV/PDF dependency split was tested in
source. A final browser repeat was unavailable because local browser use became
disabled in Work settings. The retained download files still pass the final
reader, and their numeric builders are exercised directly. Do not describe the
final dependency-loading adjustment as repeated live browser proof.

Final full application/test TypeScript, scoped ESLint and the security gate pass.
A test-only role option was corrected to match installed Testing Library types.
Read-only `npm run docker:verify` passed
one-app inventory and required production services after host-access retry.
Backup remains 2026-10-23T10:25:43Z, archive/header evidence only. No build,
migration, promotion, restart, account reactivation or browser-storage write was
performed. Concurrent account/topographic/migration edits are preserved.

Receipts are under `.cache/curves-vertical-ui/`: red/green test JSON, check logs,
`source-fixtures.json`, `file-reader.json`, preservation hashes, source files,
`browser-sag.csv`, `browser-sag.pdf`, parsed text, PDF renderings and
`desktop-profile.png` / `mobile-profile.png`.

## Still open

The simple/compound/reverse tabs and multi-VIP designer still need their own
standards/input/export audit. Project-bound saved revisions, CRS/datum evidence,
profile DXF authority and independent professional/field acceptance remain
separate. Worker compatibility, recovery/restore, key rotation, reviewed
production promotion and offline/ordinary-account gates remain open in the
production goal. This is a verified source milestone, not platform completion.
