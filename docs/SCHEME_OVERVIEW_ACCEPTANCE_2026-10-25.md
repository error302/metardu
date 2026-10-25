# Bounded scheme overview

The scheme overview now reads actual project identity, whole-project parcel
counts and bounded block/traverse pages through one owner-bound SQL statement.
It replaces the full-parcel download used only to count statuses, the invented
fallback project/UTM zone, unvalidated responses and manual DOM table writes.

## Resulting behavior

- The overview preserves the actual UUID, name and nullable location. A missing,
  unavailable, foreign-owned or non-scheme project cannot become a made-up scheme.
  No coordinate reference is invented by this view.
- Project counts include parcels without a block. Unknown statuses and inconsistent
  block links remain visible for review rather than disappear from the total.
- An owner-filtered project CTE scopes every register before aggregation. Totals
  and page rows use the same PostgreSQL statement/snapshot. Blocks and computation
  records each return at most 24 rows with stable identifier tie-breaks. Stale
  out-of-range requests clamp to the final available page.
- SQL fetches only the selected computation metrics for the selected page. Full
  retained station arrays/results are not sent to the application just to render
  an overview. Oversized or malformed metric values remain unknown.
- Initial loading/failure does not display zero counts. A failed refresh retains
  the last confirmed, explicitly labelled overview and provides retry. Responses
  from an old project/page are aborted/ignored. Responses are private/no-store and
  validated for identity, bounded pages and count reconciliation.
- Header actions wrap in the normal page flow. Tables scroll inside their own
  bounded containers. Geomatics SVGs identify the parcel and traverse views.
  Deliverables navigation leads to the existing review stage instead of presenting
  an unbounded whole-project ZIP as the overview's immediate next action. This is
  source layout work; real-browser/mobile overlap acceptance remains open.
- Computed/approved are displayed as recorded workflow statuses. Order and precision
  fields alone do not establish an accuracy assessment. The older traverse-summary
  endpoint also now reports unassessed and propagates read failure rather than
  returning a successful empty summary. Its existing record fields remain available.

## Evidence

Seven UI tests failed against the previous page and pass against the replacement.
The combined focused regression run passes 42 tests in six suites, including the
existing CSV review/receipt tests, bounded request-body tests and scheme DTO/API
checks. App/test type checks and scoped lint pass separately.

`node scripts/verify-scheme-overview.mjs` runs the actual source with PostgreSQL
in an identity-checked, uniquely marked rehearsal schema. It has no public search
path fallback. All 24 cases pass, covering owner/input admission, unknown versus
zero, inconsistent links, stable pages, invalid metrics and read failures. The
10,000-parcel/100-block/100-computation fixture returns 24 rows from each register;
its overview object is approximately 9 KB. This is a synthetic bounded-read profile,
not the million-observation/concurrent-crew capacity benchmark.

Two native legacy cases first reproduced a false pass from `1st order`/ratio 1,
and an empty 200 response after an actual missing-table read. Their corrected cases
pass. A separate red case reproduced 540,651 bytes transferred from PostgreSQL for
one overview record containing 10,000 retained stations. The corrected projection
keeps the database overview below 4 KB for that fixture. Reports are under
`.cache/scheme-overview/`: `legacy-red.json`, `projection-red.json`, `native.json`
and `regression-tests.json`. The earlier UI red/green reports remain under
`.cache/scheme-import/overview-ui-*.json`.

Authentication is a bounded adapter; native owner predicates are checked but this
is not ordinary-account HTTP or production RLS acceptance. The verifier confirms
public project/block/parcel/traverse/user fingerprints, migration ledger and source
hashes unchanged, and removes only its marked schema. No migration is required
for this overview and none was applied. Production remains unchanged.

## Remaining scale/workflow acceptance

The block-detail parcel list, block-management list, scheme map geometry and older
traverse-summary consumer paths still need bounded reads where appropriate. The map
traverse-preview hook currently expects object fields from an endpoint that returns
an array; its first-parcel/default selection must be replaced with explicit retained
traverse/parcel selection and reference-bound confirmation before acceptance.
Do not declare traverse-to-parcel or whole-campaign work complete from this view.

Crew isolation/assignments, explicit adopted criteria and observation checks,
background processing, client recovery, revision-bound output packages, the new
metadata-import migration 117 and its legacy-duplicate preflight, coherent worker
release, restore, administrator/browser/mobile and physical field/receiving-CAD
gates remain in the active goal.
