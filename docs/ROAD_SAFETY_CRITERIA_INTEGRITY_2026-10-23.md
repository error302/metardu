# Road safety comparison integrity — 23 October 2026

This is a source and host-preview checkpoint. The production goal remains
active; these changes have not been promoted or accepted in the field.

## Reproduced failures and source review

The original sight-distance engine compared its own computed requirement with
a hardcoded minimum, rather than assessing the caller's available distance.
It could return green for missing or zero available SSD, always reported PSD
compliant, discarded the sign of grade correction and accepted nonpositive
braking denominators. Unsupported speeds/terrains could use a guessed/default
minimum. The standalone page compared curve radius directly with SSD to claim
visibility, without obstruction or sight-line geometry.

The banking engine reused a braking-friction series as lateral friction,
automatically capped banking at 8%, and called an uncapped case compliant.
Its transition expression mixed speed, width and an unexplained percent/metre
constant. The standalone page applied a second untraced radius table and a
fixed 150 m radius threshold. Missing inputs could become default geometry.

The integrated panel's purported Python validation actually called a local
mock with unrelated hardcoded checks. The mock supplied no adopted criteria
or worker evidence. Async results and input edits could leave old verdicts
visible. No active worker call for that panel was found.

An independent review used the [official KURA-hosted RDM 1.3,
2025 edition](https://kura.go.ke/wp-content/uploads/2025/06/RDM-1.3-Geometric-Design-of-Highways-Rural-Roads-and-Urban-Roads.pdf).
Its Table 3.14 distinguishes longitudinal and side friction by surface/speed;
Tables 3.15–3.16 distinguish stopping criteria by grade. Table 5.1 distinguishes
paved-road radius limits by superelevation. The old terrain-based lookup and
claimed table references are not a substantiated implementation of that edition.
No automatic adoption or wholesale transcription of its tables is introduced.

The inspected PDF is retained only in ignored audit cache, with SHA-256
`199a36611e6f08e57ebcd42ffa722271ce7d65562c760bcc24dd3660bad1535b`.
Relevant PDF pages are 80–81 and 129 (printed pages 44–45 and 93).
The local extraction is `.cache/road-criteria-review/manual-text.json`.

The corrected independent fixture reproduced **17 initial failures**. Two
additional numeric cases reproduced silent zero braking/lateral demand from
overflow/underflow, while 36 controls passed. Both now fail with range errors.

## Resulting source behavior

- `roadSafetyCriteria.ts` provides the calculation authority. Criteria require
  a nonblank reference/revision, with a maximum 512-character reference. The
  result copies the declared values and reference. It explicitly records
  `assessmentBasis: declared-project-criteria` and
  `standardCompliance: NOT_ASSESSED`; a typed reference is not independent
  verification, professional adoption or a project approval record.
- SSD uses the declared longitudinal friction and reaction time. Reaction
  distance uses exact SI conversion `Vt/3.6`; braking distance is
  `V²/[254(f + grade/100)]`. Signed grade correction is retained. The required
  comparison value is the greater of model SSD and a supplied project minimum.
  Available SSD is compared with that value. Missing availability gives null
  and `UNASSESSED`; entered zero remains zero and fails a positive requirement.
- PSD requires its own adopted minimum and available distance. Either missing
  means null/`UNASSESSED`, never an automatic pass or an invented zero minimum.
- Radius is compared only with an explicitly supplied applicable minimum and
  reference. This comparison makes no claim about available visibility. Radius
  alone cannot replace sight-line/obstruction, curve-length and lane-position
  evidence; the old radius-versus-SSD heuristic is removed.
- Banking uses declared **lateral** friction, a declared maximum banking ratio
  and a supplied banking value. The value is retained even when above the limit.
  Its two reported banking checks are lateral demand and the supplied limit.
  The equilibrium expression remains `e + f = V²/(127R)`; its minimum banking
  demand is bounded below by zero, not automatically adopted as the design.
- Crossfall rotation length uses the actual rotated width and the absolute
  change from signed initial crossfall to supplied inward banking, divided by
  declared edge-to-axis relative gradient. A zero change gives zero length.
  It is one relative-gradient calculation, not a complete transition/spiral,
  width-adjustment, comfort or drainage design. No provided transition length
  is being certified.
- Numeric inputs must be finite; speeds/dimensions/time/declared minima must
  be positive; available distances can be zero; rotated lane count must be a
  positive safe integer. Friction and banking/relative-gradient ratios are
  supported below one, with positive limits/longitudinal friction. Initial
  crossfall is signed within (-1,1). These are model input bounds, not legal
  project design criteria. Nonpositive braking denominators and unrepresentable
  positive distances/demands are refused rather than becoming zero or JSON null.
- Old untraced lookup tables and nearest/default helpers are removed from
  `roadDesignEngine.ts`; safety functions/types are re-exported from the shared
  authority. This intentionally changes the internal source contract: old calls
  without criteria fail closed, and radius comparison requires a criterion
  object. All active consumers in this checkout were updated.
- Both standalone pages reuse the same components as `/tools/road-design`.
  Geometry/criteria start blank. Every edit clears result and steps; invalid
  values produce inline accessible errors. No Python validation panel remains.
  The legacy `validateGeometry` adapter remains callable but always returns
  `UNASSESSED`, `fallback: true`, `source: not-assessed` with a reason.

## Independent fixtures and verification

The fixtures are synthetic criteria, **not adopted Kenyan design criteria**:

1. At 80 km/h, grade 0%, longitudinal friction 0.35 and reaction time 2.5 s,
   an independent 40-digit Decimal evaluation gives SSD
   **127.5465566804149481314835645544306961630 m**. With a declared minimum of
   140 m, 100 m available fails; missing availability remains unassessed.
2. At 80 km/h, radius 300 m and lateral friction 0.14, minimum equilibrium
   banking is **2.79790026246719%**. One rotated 3.5 m lane, initial crossfall
   -2.5%, final banking +6%, and relative gradient 0.5% gives **59.5 m** rotation
   length. Supplied +10% is retained and fails an adopted +8% limit.

- Final regression run: **168 tests across twelve suites pass**, including
  new safety engine/UI/legacy-adapter coverage and existing horizontal,
  vertical and road-coordinate-setout checks. Reports are
  `.cache/road-criteria-review/{red,numeric-red,green}.json`.
- App/test TypeScript checks pass. Scoped ESLint passes without errors or
  warnings. Security gate passes with 119 applied migrations pinned.
- Owned CUA on the existing `127.0.0.1:3021` source preview verifies standalone
  unassessed/failing SSD, stale removal, 59.5 m rotation and uncapped +10% banking
  failure. Integrated banking/sight tabs render the same criteria controls.
  Mobile banking at 390 × 844 has document width 380 px; viewport was reset.
  Screenshots are `sight-failure.png`, `banking-over-limit.png` and
  `banking-mobile.png` under `.cache/road-criteria-review/`.
- Preservation comparison with `67c38051` confirms geometry parts 1–3 are
  unchanged (apart from the file header outside those parts), and all six other
  Python-service function declarations are unchanged. Receipt:
  `.cache/road-criteria-review/preservation.json`; geometry SHA-256
  `d36fea75531b4f5043f1c2f2c49f16c5a09d18dd048692cb11228c74bf0b3a7b`.
- Fresh `npm run docker:verify` passes required production health/inventory,
  with one application container. Backup completion is
  2026-10-23T10:25:43Z, archive/header evidence only.

No database write, credential/account change, worker request, service restart,
container build or production promotion was performed. Other standards modules
(`standards/engineering.ts`, `standards/rdm11.ts`) and the unreferenced legacy
Python geometric-validator file retain their own audit requirements. Project
criterion storage/revision binding, independently verified criterion packs,
complete road design, measured visibility, physical set-out and professional
approval remain open. Existing release, recovery, worker and deferred signing-key
rotation blockers remain open; this does not complete the platform goal.
