# Topographic source acceptance, 23 October 2026

This record concerns the existing host source preview at `http://127.0.0.1:3021`
and the labelled synthetic PostgreSQL service on loopback port 55433. It is not
a production promotion, payment-provider test, receiving-CAD check or field test.

## Ordinary account and retained input

A new isolated ordinary account (`users.role=user`, no admin bypass) was prepared
in the explicitly marked synthetic database. Its first project was created
through the normal browser form:

- Project `474f92f6-0e90-4129-83fb-d514db596876`:
  `SYNTHETIC topographic acceptance 2026-10-23 - not field evidence`.
- Project creation initially retained an unset reference. The reference was
  subsequently declared through the normal project settings UI: EPSG:21037,
  Arc 1960 / UTM 37S, grid metres, local heights, and
  `Synthetic local benchmark - no field evidence`.
- No measured benchmark or professional verification was asserted. Settings
  notes explicitly identify the fictional plane and lack of field control.
- The retained source CSV contains these five points; zero and negative values
  are measurements in this fixture, not missing-value replacements.

| Point | Easting | Northing | Height |
| --- | ---: | ---: | ---: |
| P1 | 500000 | 9850000 | -2 |
| P2 | 500020 | 9850000 | 0 |
| P3 | 500020 | 9850020 | 2 |
| P4 | 500000 | 9850020 | 0 |
| P5 | 500010 | 9850010 | 0 |

Each row retains source feature code `SPOT`. An unrecognised code is not silently
reclassified as an established surveyed feature.

Chrome file-chooser automation was refused because the extension lacks file-URL
access. That permission was not changed. Browser file-upload acceptance remains
open. Import proceeded through normal HTTP authentication and the actual import
API, with native PostgreSQL verification; no browser storage/session injection
or direct SQL point insertion was used.

The guarded native harness passed **13 checks**: anonymous rejection, normal
ordinary-account login, cross-owner context rejection, exact declared reference,
bad file-hash rejection, five-point import, idempotent replay, exact saved
coordinates/heights, original UTF-8 source recovery, changed-content UUID conflict,
duplicate point-name conflict, database capture/point consistency, and unchanged
applied-migration/source hashes. Its receipts and replay request are retained in
`.cache/topographic/`; credentials are deliberately omitted from this document.
Read-only inspection after browser export reconfirmed all five measurements.
The earlier revoked account was not reactivated. Another active chat uses a
different retained QA account/project; this record makes no blanket claim about
concurrent changes to that separate fixture.

## Browser contour and independent file acceptance

The signed-in ordinary free account opened the project-bound contour generator.
The UI loaded all five saved points, the recorded CRS and local height reference.
After the metre confirmation, its browser worker reported four TIN triangles,
three contours at -1, 0 and +1, and **800 m3** above the minimum level of -2.

The independent arithmetic oracle is
`z = -2 + 0.1*(E-500000) + 0.1*(N-9850000)` on a 20 m by 20 m square.
Its mean height above -2 is 2 m, hence the expected volume is 800 m3.
The zero contour must pass through the centre point; the interior contour
endpoints are specified independently in the verifier.

Four files were downloaded through the actual UI. The automation's download
event wait timed out after the DXF had already been saved; the actual owned
download was inspected and copied, without recreating it using source functions.
Subsequent CSV, SVG and PDF downloads were likewise retained. Old Downloads
files were preserved.

`scripts/verify-topographic-acceptance-files.py`, using the existing Python 3.12
runtime and native CAD verifier packages, established:

- Normal ezdxf parsing, zero audit errors/repairs, metre units, three open
  elevated polylines, exact independently specified contour endpoints, every
  vertex on the plane, and the zero index contour with its index lineweight.
- Nine CSV vertices, exact CRS/height-reference columns and matching index flags.
- Valid A3 SVG with three polylines, explicit synthetic/draft/reference labels
  and no script element.
- One A3 landscape PDF with synthetic/draft/reference/review labels, and all
  extracted text within page bounds. This does not establish physical print
  scale, rendered label clearance or receiving-application acceptance.

Receipt root: `test-results/topographic-source-acceptance/`, including four
original browser artifacts, SHA-256 file hashes in `native-verification.json`,
source test results and browser screenshots. System Python 3.14 cannot use the
existing Python 3.12 native package wheels; using the existing bundled 3.12
runtime passed without installing packages. The volume is browser-display
evidence; it is not encoded in these four contour files.

## Drawing repairs

Browser preparation exposed that the drawing composer previously used its
`project` parameter only in the title/filename. It did not load saved project
points. It also inferred a supposed Arc 1960 zone from easting and printed a
fixed Kenyan title, while its private CSV/manual parsers lost zero heights.

The source now:

- Gates private project loading on the current session and keys the workspace
  by account/project; cancels old requests and rejects mismatched project IDs.
- Reads complete project points and the canonical declaration without caching.
  It preserves IDs, names, codes, zero/negative and unknown heights. Mixed or
  undeclared references, invalid coordinates and duplicate identities are
  refused atomically. Source rows are not filtered to manufacture a surface.
- Keeps saved project coordinates read only in the drawing view. Local feature
  code edits affect a draft, not saved observations. Unknown heights remain
  visible and block partial terrain/export. Reload and source-review links are
  available. The synchronous drawing review is bounded to 2,500 points.
- Reuses the coordinate CSV parser and strict numeric parser for standalone
  input. Bad files are rejected atomically, CSV replaces the local set, late
  reads cannot replace newer edits, and explicit metre CRS/height-reference/unit
  declarations are required before local export.
- Uses the declared CRS and height reference in output. Neutral draft/reference
  annotations survive hiding the decorative title block; no country or zone is
  inferred. Degenerate one-point extents still receive finite positive padding.
- Rechecks private access and the saved reference hash before project export,
  refuses a drawing changed during that check, and prevents concurrent exports.
  This is a source snapshot, not an attestation of field truth or of a later
  observation revision.

The original drawing-title/project-loading regressions failed before repair.
Focused component/source/entity tests cover those defects, foreign registered
CRS handling, bad and mixed records, unknown heights, quotas, account changes,
late responses, reference-change export refusal and manual zero-height entry.
The final combined run passed **44 tests across four suites** (10 workflow UI,
7 drawing UI, 23 drawing-source and 4 drawing-entity checks). Both strict
TypeScript projects, scoped ESLint and tracked-file whitespace checks passed.

## Drawing browser gate and permission history

The ordinary free account correctly received `Pro plan required` on the drawing
route. This initial negative browser test passed. No client gate or role was
bypassed. The subsequently approved paid drawing UI/DXF follow-through is
recorded in `TOPOGRAPHIC_DRAWING_AND_SUBSCRIPTION_ACCEPTANCE_2026-10-23.md`.

A concrete guarded helper, `.cache/topographic/drawing-subscription.mjs`, was
prepared to add a one-hour Pro fixture for only the newly created synthetic QA
account, keep its ordinary role, avoid all billing/provider calls, fingerprint
other subscriptions, then remove exactly its generated fixture and restore the
prior free state. **Automatic approval review rejected execution** because this
paid-tool entitlement change needs the owner's specific authorization, even
within the synthetic database. The rejected process did not execute; no Pro
fixture was granted by that rejected attempt. The owner later explicitly
approved this exact temporary fixture. Its paid drawing checks and exact
restoration to free access are complete in the follow-through record. That
specific approval rejection is now resolved; do not report it as pending.

## Remaining acceptance

Complete browser upload once the required extension permission is available,
the remaining account/free-gate reload checks after browser detachment, workflow-selection persistence
and mobile layout, receiving CAD/physical print review, instrument/offline/field
acceptance, and the broader release/recovery/security/provider gates. In
particular these browser downloads are not registered deliverables or a signed
computed-revision approval. See `PRODUCTION_READINESS_EXECUTION.md` and the main
production goal for the remaining platform families.

`npm run docker:verify` passed with host read access during this work: one app,
required services, HTTP/database/Redis and migration-image agreement. Backup
receipt `2026-10-23T10:25:43Z` is archive/header evidence, not restore proof.
Source preview PID 14112 was reused; no service was built, started, restarted,
stopped, migrated or promoted. Customer production and the user's CAD training
drawing were untouched by this work. The completion goal remains active.
