# Declared road evidence in export quality checks — 23 October 2026

The pre-export quality gate's road checks now use explicit caller-supplied
criteria and the reviewed safety authority. Missing/invalid evidence for a
requested check blocks that check as unassessed. This is not a complete road
design, verified standards adoption, live export or professional/field acceptance.

## Reproduced defects and corrected behavior

The former gate inferred a minimum radius from default 7% banking and 0.15 side
friction. Its SSD helper assumed reaction time, longitudinal friction and level
grade. Banking used untraced 7%/10% national limits, with an unrelated portal
source label and assertions about vehicle safety or official approval. NaN,
invalid speed or missing evidence could skip a rule or leave no blocking result.
The first bounded regression run reproduced **14 failures and two controls**.

Rule version is now **1.3.0**. Road findings use `metardu_qc` and these identifiers:

| Previous rule | New rule |
| --- | --- |
| `rdm_1_1.min_curve_radius` | `metardu_qc.road_radius` |
| `rdm_1_1.sight_distance` | `metardu_qc.road_sight_distance` |
| `kenha.superelevation_rate`, emitted high/absolute-max IDs | `metardu_qc.road_superelevation` |

- Radius is compared only with `criteria.minimumRadiusM` and a nonblank declared
  reference/revision. Legacy friction/banking fields do not invent that minimum.
- SSD requires explicit speed, signed grade, available distance, longitudinal
  friction and reaction time. Its required distance is the greater of the shared
  model and a supplied minimum SSD, if any. Zero availability is retained and
  fails a positive requirement. No level grade is guessed.
- Banking compares the retained ratio with `criteria.maximumSuperelevation`.
  The new shared `checkSuperelevationLimit` is also used by the fuller banking
  calculator. This limit check alone does not assess lateral demand, visibility,
  rotation/transition, comfort, drainage or project approval.
- Numeric domains and the 512-character reference bound come from the shared
  authority. Invalid measurements, absent/invalid criteria and malformed or
  empty explicit road requests produce blocking `UNASSESSED` findings rather
  than silence, a warning-only fallback or invented thresholds.
- Successful comparisons are informational `PASS` findings; unmet criteria are
  blocking `FAIL`. Both preserve actual/allowable values, the declared reference,
  `standardCompliance: NOT_ASSESSED` and a `roadEvidence` snapshot containing the
  exact consumed parameters. Unknown minimum SSD is null, not invented zero.
  The formatted report includes these parameters for numerical review.
- No road request on a generic engineering survey gives an informational
  `UNASSESSED` finding; it does not block unrelated survey checks. The panel
  shows this state in amber outside the collapsed findings and the formatter
  keeps its heading explicitly unassessed. Blocking evidence expands normally,
  without duplicating the same message. The panel preserves metadata through
  its response schema and notifies its parent of the real blocking state.
- Findings are not all violations: the panel's disclosure label now reflects
  informative comparisons as well as problems. Existing generic official-review
  caveats remain. A declared reference is not independent standards verification.

The [KURA-hosted Ministry RDM 1.3, 2025 manual](https://kura.go.ke/wp-content/uploads/2025/06/RDM-1.3-Geometric-Design-of-Highways-Rural-Roads-and-Urban-Roads.pdf)
was re-opened as primary reference context. No table is automatically adopted,
transcribed or represented as a universal project criterion by this repair.

## Input and compatibility boundaries

`StatutoryGateInput.engineering.criteria` accepts `reference` and the parameters
needed by the requested check: `minimumRadiusM`, `maximumSuperelevation`,
`longitudinalFriction`, `reactionTimeSeconds`, optional `minimumStoppingDistanceM`.
Speed is needed only for SSD. Banking/friction are ratios, grade is signed percent,
reaction time seconds, speed km/h and radius/distance metres.

**Intentional breaking semantics:** road rules no longer use national defaults;
old requests with measurements but no criteria now block as unassessed. Rule IDs
and version change, successful requested comparisons add info findings, and
consumers must use `passed` / blocking counts rather than an empty finding array.
The gate's aggregate `passed` still means no configured blocking finding, not
that all possible road/survey requirements were supplied or verified.

The existing project loader does **not** automatically populate road parameters
or declared criteria from saved road design data. It therefore yields visible
unassessed road context for generic engineering input. This change does not
claim that an approved saved road revision, control, measured visibility or
criteria adoption has been loaded/validated. That binding and a real authenticated
field-to-deliverable exercise remain required.

## Evidence and release limits

- **142 focused tests in five suites** cover gate legacy controls, requested
  road evidence/fuzz cases, shared safety calculations, calculator components,
  response-schema preservation, parent notification, default-visible unassessed
  UI and formatted evidence. UI and formatter regressions were observed red
  before their repairs. Full-precision percentage results use numerical
  comparisons rather than demanding exact decimal display rounding.
- `node scripts/verify-road-export-gate.mjs` runs the actual pure gate/formatter
  for **15 cases**, captures source hashes, records running/failure status and
  restores TS/path adapters. No DB/persistence client is loaded or real account,
  project, service or network used. The Python reader independently recomputes
  **11 comparisons** with 60-digit Decimal and checks **six unassessed states**,
  references, evidence snapshots, severity and formatted output.
- **70 engine CLI checks** and the security gate pass, with **119 applied
  migration hashes pinned**. Script syntax, full working-tree TypeScript and
  scoped lint pass on the final source; logs retain intermediate
  concurrent settings errors and the test-typing repair instead of hiding them.
- Read-only `npm run docker:verify` passed one application and required service
  health after host-access retry. Revalidation on 24 October passed the same
  inventory with backup completion `2026-10-24T02:00:04Z`, archive/header evidence
  only. No production lifecycle, build/promotion, migration,
  customer record or account changed. Unrelated checkout work is excluded.

Receipts/logs are in `.cache/road-export-gate/`. UI proof is component/schema
evidence, with no fresh CUA/mobile or authenticated project export. Saved design/
criteria revision authority, remaining legacy helpers in `engineering/compute.ts`
and `engineering/volume.ts`, other gate failure/coverage semantics, provider,
worker, key rotation, recovery, payment, offline/device/professional/field and
production promotion gates remain open. The platform goal remains active.
