# Road quick-compute integrity — 23 October 2026

This source checkpoint repairs the project quick-compute horizontal/banking
panels, their local DXF drafts and the registered horizontal curve API adapter.
It does not promote an image or approve a project design.

## Reproduced defects

The project `QuickComputeTab` actively loaded separate legacy panels. The
horizontal panel supplied fictional radius/angle/PI defaults and claimed sight
distance was adequate using `R >= minimum SSD / 2`. Its DXF drew one straight
line at half scale instead of a circular arc. The banking panel supplied
fictional geometry, untraced 7%/30 m rules, capped banking and an invented 30 m
export width. Both logged calculations and changed state during render.

The legacy horizontal library subtracted cumulative chords to obtain a purported
successive peg chord, omitted TC and rounded stationing before returning it.
Its singular/nonfinite-input loop could fail to advance. The first red attempt
including such inputs was interrupted; no matching owned Jest invocation
remained after inspection. The corrected finite red selection reproduced six
panel/adapter failures. Pathological inputs were restored as regressions after
the loop was replaced by the bounded shared validator.

The registered `/api/engineering/compute/curve` endpoint tried legacy parsing
after typed parsing failed. An unknown curve kind or malformed transition could
therefore return horizontal geometry. It also invented PI station zero when
missing and rejected valid signed PI stationing. Five API regressions failed
with four controls passing after the harness used the Node environment and real
NextRequest. A separate malformed-JSON regression reproduced HTTP 500.

## Corrected behavior and compatibility

- Both project panels render the reviewed shared road calculators. Geometry and
  banking criteria begin blank. No standard name, profile or project ID is
  interpreted as evidence of adopted criteria, placement or approval.
- Horizontal elements and peg tables use `horizontalCurveElements` and
  `curveSetOut`. The legacy adapter retains its response field names and decimal
  angle input, but returns unrounded numbers, includes exact TC/CT and computes
  chords between consecutive pegs. `chainageStart` means PI/IP station.
- Singular angles, nonfinite numbers, unrepresentable station precision and
  excessive tables are refused. The 10,000-row bound is computational, not a
  project design tolerance. An untraced 2,000 m radius ceiling is removed from
  the horizontal path; the shared bounded calculation governs representability.
- Explicit curve kinds stay on their own schema. Missing horizontal PI,
  malformed JSON and unrepresentable horizontal geometry return HTTP 400. The
  endpoint retains authentication; anonymous requests remain HTTP 401.
- Banking uses entered side friction, provided banking, rotated width, initial
  crossfall, maximum banking and relative gradient with a declared reference.
  Over-limit banking is retained and fails its comparison. Standard compliance
  remains NOT_ASSESSED; the reference is independently unverified.
- Edits clear results and export actions. Horizontal export additionally requires
  an explicit left/right direction. Generation is synchronous from the displayed
  calculation, with errors surfaced and temporary download resources released.
  Render-time logging/writes from the replaced panels are removed. These local
  calculations do not claim to have saved an approved project design.

The horizontal API intentionally changes previously unsafe behavior: PI is now
required; 180 degrees is rejected; signed PI is accepted; invalid typed requests
are not reinterpreted; and returned numbers retain calculation precision.

## Actual DXF evidence

`roadQuickComputeDxf` writes full-size model geometry with metre units. The
horizontal file contains an actual ARC, its tangents and all peg points. TC is
local (0,0), incoming tangent +X; direction is declared. No CRS, bearing or
surveyed placement is invented. The banking file uses the entered rotated width
and provided rise, with baseline/initial-crossfall lines. It carries criteria,
numeric inputs, actual comparison status and the NOT_ASSESSED standard verdict.
Control characters in user criteria cannot inject additional DXF records.

Primary format references: [Autodesk ARC group codes](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-0B14D8F1-0EBA-44BF-9108-57D8CE614BC8.htm)
and [Autodesk header units](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm).
These specify format; they do not establish engineering approval.

Four pure source fixtures and **two actual browser downloads** were opened with
normal **ezdxf 1.4.4**, with zero audit errors or repairs. **64 checks pass**,
including source/file hashes and these independent numerical expectations:

- R=100 m, angle=60 degrees, PI=500 m: TC=442.264973081 m,
  CT=546.984728201 m, arc length=104.71975511966 m.
- Left/right CT=(86.60254037844, +/-50) m. Radius remains 100 m; tangents
  are perpendicular to radius at the endpoints. Seven peg points include TC/CT.
  A 20 m arc interval gives a 19.9666833293656 m successive chord.
- A single 3.5 m lane at provided 10% has 0.35 m rise, not an invented 30 m
  section. With initial -2.5%, relative gradient 0.5%, maximum e=8%, the
  rotation length is 87.5 m and status FAIL. A 6% control gives 0.21 m rise
  and PASS against the same declared synthetic limits.

Reproduce source fixtures with `node scripts/verify-road-quick-dxf.mjs`.
Run `scripts/verify-road-quick-dxf.py` using the existing bundled Python 3.12 and
packages in `.cache/cad-export-verifier`; system Python 3.14 is incompatible
with those native packages. `--browser` additionally requires the two retained
browser fixtures. No package install, database, account or service is needed.
The reader confines its cache to this checkpoint's workspace folder and marks
its receipt running before checks so a failed run cannot leave a passed receipt.

## Verification and limits

- **120 focused tests across eight suites pass**: actual project panels, shared
  calculators, legacy adapter, DXF tags, actual registered API handler and
  adjacent road-safety/engineering calculations. Authentication is stubbed only
  in handler tests; this is not signed-in production authorization proof.
- Scoped strict TypeScript checks include source/tests and their imports with
  the normal Jest DOM matcher types. Scoped ESLint and the security gate are
  recorded separately. Global `npm run typecheck` found three errors in concurrent
  topographic edits (`topo/export/dxf/route.ts` and `topo/surfaceRevision.ts`);
  those changes are preserved and whole-checkout type acceptance is not claimed.
- CUA on the owned source preview `/tools/road-design` verified blank inputs,
  current curve stationing/chords, stale-result removal, declared failing banking
  and actual downloads. A 390x844 mobile viewport has no document overflow
  (380 px client and content width, excluding its scrollbar); the override is
  reset. Project-wrapper behavior is covered by real component tests; this is
  not an ordinary-account project workflow or physical field trial.
- `npm run docker:verify` passes one-app ownership and required service health
  after host-access retry. Backup remains 2026-10-23T10:25:43Z, archive/header
  evidence only. No build, migration, deployment, restart, account reactivation,
  customer-data write or browser-storage write was performed.
- The remainder of `compute.ts` from `verticalCurve` onward and the API's actual
  vertical/transition calculation branches match the parent commit exactly;
  preservation hashes are retained. This is preservation, not validation.

Receipts, original source/browser DXFs and desktop/mobile screenshots are under
`.cache/road-quick-compute/` (red/green JSON, logs, source fixture manifest,
`cad-reader.json`, `preservation.json`, `browser-left.dxf`,
`browser-bank-fail.dxf`, `banking-desktop.png`, `banking-mobile.png`).

## Still required

The legacy API's vertical and transition formulas/defaults, other legacy scalar
helpers (including the now-unreferenced UI banking helpers), `/tools/curves`,
profile DXF export, saved alignment revisions and project-bound export authority
remain under audit. This repair does not silently endorse them. Local draft
files do not substitute for CRS-bound design deliverables or a revision register.

Whole-checkout type failures, migration/recovery evidence, worker compatibility,
signing-key rotation, reviewed production promotion, ordinary-account acceptance
and physical/offline field gates remain open as recorded in the production goal.
