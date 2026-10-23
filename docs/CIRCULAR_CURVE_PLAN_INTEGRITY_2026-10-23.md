# Circular curve plans and output integrity — 23 October 2026

This source checkpoint repairs the simple/compound/reverse paths on
`/tools/curves`, their underlying engine/wrappers and local draft exports. It
does not deploy the app, adopt a road standard or approve a surveyed alignment.

## Reproduced defects

The page prefilled fictional geometry, accepted numeric prefixes, kept stale
results after edits and invoked `/api/validate-geometry` using assumed speed
80 km/h, rolling terrain and zero grade. That API path has no registered route
in the current checkout. The UI nevertheless had a standards-compliance block;
the fetched result was neither bound to a project criterion nor an input
revision. Engine errors could escape the calculate handler.

The compound engine calculated `chainT1 = PCC - t1` and `chainT2 = PCC + t2`,
using tangent lengths instead of arc lengths. A PCC is on the alignment; the
stations of its connected arc endpoints must follow the arc lengths.

The reverse tool supplied no deflections. Its helper interpreted AB as a PI
distance while applying a circle-centre tangent formula, clamped impossible
geometry to zero and guessed two semicircles for total length. The wrapper
called that an approximation, but the actual data did not determine that curve.

The legacy simple set-out omitted PT unless the chosen interval happened to
reach it, had an unbounded allocation path and supplied cumulative chords under
an ambiguous generic heading. Its equations duplicated the reviewed engine.

New regressions reproduced **18 engine failures** and **four page failures**.
One later numerical case reproduced another failure (18 controls passed): an
extreme PI separation could swallow the arc contribution to total path length.
The final guard refuses that unresolved length. Test assertions were adjusted
where the same correct station legitimately appeared in both solution steps and
results, rather than treating duplicate visible evidence as an engine defect.

## Corrected source contract

### Simple circular curve

`curveElements` and `curveStakeout` use `horizontalCurveElements` and
`curveSetOut` as their shared geometry/sampling authority. Inputs must be finite,
radius positive and deflection between zero and 180 degrees. Set-out includes
exact PC/PT, follows regular global chainage intervals and is bounded to 10,000
rows. The historical `chordLength` remains the **cumulative chord from PC**;
the page and PDF now label it explicitly. Cumulative deflection is from the PC
forward tangent. Neither coordinates nor a geographical bearing is supplied.

For R=100 m, angle=60°, PI=500 m: PC=442.2649730810374 m,
PT=546.9847282006972 m and the endpoint cumulative chord is 100 m. Invalid DMS,
missing inputs and excessive allocation are refused inline. Zero/signed PI
stations remain valid. This changes the former PC-relative sampling phase to the
reviewed global stationing convention; consumers must not rely on row indices
as preserved station identities.

### Compound same-direction arcs

Inputs are positive radii, positive sub-arc deflections and an explicit PCC
station (`junctionChainage`). The supported local model requires total
deflection below 180 degrees; this is a model boundary, not a cited road rule.

`PC = PCC - L1`, `PT = PCC + L2`, where `Li = Ri * delta_i` in radians.
Individual tangent lengths remain available as elements, not substituted for
arc station offsets. Invalid/nonfinite/unresolved stations are refused.
Historical output keys `chainT1` and `chainT2` are retained for compatibility but
now contain PC/PT **arc stations**. Wrappers and UI name their meaning explicitly.

R1=100 m / 60°, R2=200 m / 30°, PCC=500 m gives both arc lengths
104.71975511966 m, PC=395.28024488034 m, PT=604.71975511966 m and total
arc length 209.43951023932 m.

### Reverse arcs with a declared intervening tangent

The historical `reverseCurveApprox` name remains exported, but both `delta1`
and `delta2` are required at runtime. They are positive arc-deflection
magnitudes, each below 180 degrees. The arcs turn in opposite directions;
these length calculations do not define which turn is left or right or provide
world placement.

AB is explicitly **PI1-to-PI2 distance along the shared tangent**. It is not
circle-centre separation. `Ti = Ri * tan(delta_i/2)` and the intervening tangent
gap is `AB - T1 - T2`. Negative gaps indicate overlapping arcs and are refused,
without clamping. `arcLength = L1 + L2`; `totalLength = L1 + gap + L2`.
Missing deflections, nonfinite values and unresolved totals are refused. For
accepted declared geometry `isApprox` is false; that does not certify transitions,
banking, sight lines or design standards.

R1=100 m / 60°, R2=200 m / 60°, AB=300 m gives tangent lengths
57.73502691896 m and 115.47005383793 m; gap=126.79491924311 m;
arc sum=314.15926535898 m; total path=440.95418460209 m. AB=150 m is
impossible in this declared model and returns an error. Old radius/AB-only
requests now fail instead of acquiring fictional semicircle angles. Optional
TypeScript angle fields remain solely to allow old callers to receive the
explicit runtime error; they are not optional mathematical inputs.

These definitions are consistent with the distinction between PI and common
points of curvature in [WSDOT's Highway Surveying Manual](https://www.wsdot.wa.gov/publications/manuals/fulltext/M22-97/highwaysurvey.pdf).
The formula checks here are independently calculated from the declared local
geometry; the reference is not adopted as a project design standard. Design
requirements for transitions/runout remain separate from a nonnegative tangent.

## Page state and exported evidence

The three tabs now begin with blank geometry. Zero minutes/seconds and a 20 m
sampling interval are representation/sampling defaults, not invented design
values. Strict finite parsing rejects numeric suffixes and invalid DMS. All
edits/tab changes clear results, errors and export actions. Calculation errors
appear inline. The unsupported standards fetch and its verdict block are removed.

Exports use the computed input snapshot. CSV is synchronous and preserves full
numeric result precision; set-out angular strings retain the shared table's DMS
display precision. PDF rendering loads lazily; a revision/unmount check prevents
late downloads after an edit. Errors are visible, temporary anchors are removed
and URLs are released after browser consumption. The actual CSV Blob and late
PDF refusal are exercised in component tests.

CSV includes supplied inputs, computed numeric geometry, simple-curve station
rows and explicit `LOCAL_CALCULATION_DRAFT / NOT_ASSESSED / NOT_VERIFIED`
metadata. PDF uses readable parameter/unit labels, four-decimal print precision,
complete cumulative-chord schedules and draft status on every page. Both identify
unverified local placement and absence of standards/field/design approval.

## Verification

- **82 focused tests across seven suites pass:** real page behavior (including
  the unchanged vertical path), engine/wrappers, adjacent circular regressions
  and the reviewed horizontal calculator. Existing reverse tests that expected
  guessed semicircles are updated to test the intentional fail-closed contract.
- Full application/test TypeScript and scoped ESLint pass. The security gate
  passes with 119 applied migration files pinned. No migration is included here.
- Standalone engine verification initially reproduced a module-resolution
  failure from the new web-style alias import. The pure engine dependency now
  uses a relative import, so the compiled CommonJS verifier does not depend on
  application alias injection. All **70 CLI checks pass**, including the
  existing core/geodesy regressions; output is retained in the CLI check log.
- `node scripts/verify-curve-plan-drafts.mjs` loads actual source wrappers and
  creates seven synthetic CSV/PDF pairs. Source hashes are checked before/after;
  temporary adapters are restored and receipts mark running/failure explicitly.
  No account, database, provider or listener is involved.
- `scripts/verify-curve-plan-drafts.py`, using existing bundled Python/pypdf,
  independently recomputes trigonometric elements, PCC stations, reverse gaps
  and totals. It checks exported CSV values and all **118 simple set-out
  stations**, then parses **10 PDF pages** and verifies every printed result and
  station to display precision, with draft/page labels on every page. All seven
  draft pairs pass. This is numerical/print verification, not survey tolerance.
- Compound and reverse PDFs were rendered and visually inspected; parameter
  units, station/tangent distinctions, review notes and draft footers are legible.
  Poppler's optional Symbol/ArialUnicode font warnings did not prevent the Latin
  report text from rendering or independent parsing.
- The legacy vertical function and later clothoid/vertical-analysis block in
  `engine/curves.ts` match the parent commit exactly, as do the reviewed road
  engine, vertical UI, spiral component and schedule renderer. Preservation
  hashes are retained; unchanged legacy code is not thereby validated.
- Read-only `npm run docker:verify` passes one-app inventory and required
  production health after host-access retry. Backup remains
  2026-10-23T10:25:43Z, archive/header evidence only. No build, lifecycle action,
  promotion, migration, real account or customer record was changed.

Browser access is disabled in Work settings, so this checkpoint has **no fresh
CUA/mobile/download proof**. Real component download tests and independently read
source files do not replace that acceptance gate. Receipts and artifacts are in
`.cache/curve-plan-integrity/`: red/green JSON, check logs, source fixture manifest,
`file-reader.json`, preservation hashes, CSV/PDF files and rendered report images.

## Still required

Fresh browser/mobile acceptance, CRS-bound project placement, saved revision and
export authority, spiral/vertical-designer standard adoption and the remaining
legacy scalar helpers need continued verification. In particular, the unchanged
legacy engine vertical helper is not certified by the shared vertical repair.
Production promotion, worker compatibility, key rotation, recovery/restore,
ordinary-account/offline/device and independent professional/field gates remain
open in the production goal.
