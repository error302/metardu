# Saved surfaces and retained draft DXF — 23 October 2026

This is a source and isolated-synthetic acceptance checkpoint in the active
production goal. No production promotion, provider payment, field verification,
professional approval or receiving-CAD acceptance is established here.

## Repaired behavior

The saved-surface route previously filtered unknown heights away, omitted the
original point references/provenance, replaced the global breakline register,
and accepted some silent database failures. The project topography page loaded
a different, filtered set of current points alongside historical contours. Its
DXF route trusted client geometry, closed open contours, flattened heights and
registered against an unrelated engineering revision; a failed registration
still delivered bytes. Its GeoJSON/Shapefile actions could mislabel projected
coordinates. Those page actions were removed pending properly bound exporters;
the legacy Shapefile endpoint itself remains a separate repair item.

Saved-surface computation now admits only complete finite measured XYZ in the
declared compatible horizontal/height basis. Missing heights remain unknown;
soft-deleted points stay excluded. Explicit selected point identities and a
reviewed reference hash are supported. Unreferenced legacy breaklines refuse
automatic reuse; explicit lines need their own matching declaration. Original
breakline records are preserved. Immutable v2 snapshots retain source IDs,
references, provenance, parameters and `fieldVerified: false`.

Input hashes are computed from the JSON value actually retained as JSONB,
including serialized timestamps, using the existing canonical-key convention.
Contour/mesh hashes bind the saved outputs. Reads require one exact project,
revision and contour set, verify the retained hashes and references, and never
fall back to current points/current project settings. Unverified legacy records
are retained and refused for this verified-draft path; no historical migration
or hash rewrite was performed. Revision creation checks every write's returned
identity and the current-head acknowledgement inside the same transaction.

The project page now offers explicit ground-source review and a separate exact
saved-revision selector. It shows unknown heights, revokes review after selection
changes, clears private state across account/project changes, ignores late
responses, and previews the retained source with the retained contours. It
does not invent a progress percentage or professional approval. Preview and
server DXF use the same entity builder. Zero-contour flat surfaces remain valid
saved drafts. The point-only page states its observation-hull limitation.

The DXF endpoint accepts only `{projectId, surfaceRevisionId}`. It checks
ownership and the central paid-feature decision, loads/verifies that exact
record, retains real point XYZ/open elevated contours, and annotates the source
revision, CRS, height basis, input hash and computed-draft status. It writes a
new private artifact, checks its stored bytes, then atomically commits its file
metadata, document revision and export evidence. A failed metadata/register/
evidence write rolls back the database transaction and removes only that new
owned artifact. The existing register can join a caller-owned transaction; its
default independent transaction behavior remains covered separately.

The document's `source_revision` is the actual surface revision UUID. Its
manifest retains output/reference hashes and explicit false field/approval
flags. `IN_REVIEW` is register state, not professional acceptance. Retained
surface artifacts use a reserved namespace: generic upload/delete refuses to
overwrite/erase them, and owner downloads fail closed on missing/ambiguous file
acknowledgements or mismatched stored content hashes.

## Evidence

| Boundary | Result |
| --- | --- |
| Focused source tests | 61 passing tests across five suites: source admission, exact-revision binding, workspace behavior (including an unconfirmed-computation response), storage ownership/integrity, existing persistence contracts. `.cache/surface-revisions/source-tests.json`. |
| Type/lint | Both existing strict TypeScript projects pass; scoped ESLint and `git diff --check` pass. A parallel engineering-data test's dot-all expression was changed to an equivalent ES2017-compatible expression without changing its behavior. |
| Real SQL and local storage | `node scripts/verify-surface-revisions.mjs green`: 29 passing cases, actual source handler/math/register/storage reads, uniquely owned temporary schema and local storage. `.cache/surface-revisions/green.json` records instantiated source hashes and cleanup. |
| Register default behavior | Existing `node scripts/verify-deliverable-register.mjs green`: eight passing actual-PostgreSQL failure/concurrency/preservation checks after the optional transaction-client extension. |
| Independent artifact | Existing Python 3.12 runtime and the existing isolated `ezdxf` installation run `scripts/verify-retained-surface-dxf.py`. Five original XYZ points, three open contours at -1/0/+1 m, independent analytical-plane endpoints, draft/reference/revision annotations; zero audit errors or repairs. `.cache/surface-revisions/independent-dxf.json`. |
| Real HTTP/session | `node scripts/verify-surface-http.mjs`: eight passing checks through `http://127.0.0.1:3021`, normal ordinary-account login, source/reference load, exact saved revision, cross-project refusal and real free-plan DXF denial. `.cache/surface-revisions/http.json`. |
| Browser | Chrome/CUA on the owned loopback origin loads the five points, selects and restores the exact saved R1, renders its draft preview, and visibly refuses the restored free account's paid DXF request. Screenshot/receipt accompany this record. |

The collected evidence is also retained under
`test-results/saved-surface-acceptance/`, including the full-page and focused
browser screenshots, native artifact, source-test result, separate HTTP/browser
receipts, native register regression receipt and an index with source/file
hashes. The index records completed checks; it is not a release attestation.

The native SQL test uses the exact existing marked synthetic service
`metardu-schema-rehearsal-20261008`, loopback port 55433, with service ID/label/
port/database-comment guards. It executes the relevant migration definitions
only in its uniquely marked fixture schema. It covers missing/mixed references,
unknown/soft-deleted/foreign selected sources, stale review, four silent-write
faults, a mismatched historical head, observed lock contention and immutable
R1/R2 history. It also proves that R1 exports retain original measurements after
today's points and current head change; foreign/duplicate/legacy bindings refuse;
export metadata/evidence faults preserve prior state and prior files; downloaded
bytes match, foreign owners are denied and an owned corruption fixture returns
409. The exact schema/storage fixtures were removed and the public applied
migration ledger stayed unchanged.

That native test adapts the HTTP/session/RLS wrapper and positive/negative plan
decision. It does **not** create a Pro subscription or prove a real paid export.
The separate HTTP proof uses the existing ordinary synthetic account
`99f15c47-7a36-43c4-b98c-1171da777039`, project
`474f92f6-0e90-4129-83fb-d514db596876`. One named synthetic surface was created by
normal HTTP, then reused on verification replay:
`8fcb2c19-5b9e-4768-8a3b-0ebee2317aef` (R1). Its original five point rows,
reference, ordinary role, free subscriptions, file rows and document register
were unchanged. No customer/project source was replaced. The earlier approved
one-hour Pro fixture remains removed; this work never recreated it.

## Remaining gates and next work

- Surface POST and export do not yet have durable request-id replay/lost-
  acknowledgement recovery. The page warns users to reload saved revisions
  before recomputing after an unconfirmed request. A helper script's reuse of
  its own named fixture is not application idempotency.
- The page computes reviewed point-only terrain over the observation hull.
  Reviewed boundary/hole masks, durable breakline-source declarations and the
  broader terrain editing/review workflow remain open. Automatic reuse of
  legacy unreferenced lines stays blocked.
- The new server export needs real paid-account HTTP/browser acceptance; the
  prior authorized Pro drawing-composer check is a different export path.
  Receiving CAD, paper output, surveyor review, physical instruments and field
  control remain separate gates. Mobile and interrupted/offline acceptance of
  this revised page remains open.
- Recoverable local artifact storage is proven for the isolated native case.
  Provider object storage, offsite backup/restore, provider payment lifecycle,
  production deployment and promoted ordinary-account behavior are not proven.
- Preserve the owner-deferred signing-key rotation, broader engineering work,
  migration/recovery/rollback review and one planned production promotion in
  `PRODUCTION_GOAL.md`. International adoption still requires a separately
  accepted workflow/jurisdiction; declared CRS support alone is insufficient.

Runtime verification earlier in this goal turn used the required read-only
`npm run docker:verify`: one production app and required services passed. Backup
completion was `2026-10-23T10:25:43Z`, archive/header evidence only. No service
lifecycle operation, new application container, builder, prune, production
migration or production promotion was performed.
