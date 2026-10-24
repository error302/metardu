# Topographic project review

Source checkpoint: 23 October 2026, Africa/Nairobi.

## Problem and behavior

The previous `/topographic-workflow` page described an integrated completed
pipeline, but its tools were unbound links and its completion percentage came
from manual checkmarks in one global device-storage key. It could display those
marks without a session or selected project. It did not demonstrate that source
observations, a terrain computation and a deliverable belonged to the same job.

The entry now checks the authenticated account and uses the existing project
picker. Its selected-project view reads the owner-checked point-import context
without caching, then resolves the saved declaration through the shared stage
reference authority. Missing or malformed declarations stay missing; neither a
country nor old project defaults supplies a replacement CRS. Load errors have a
retry and an account/project switch unmounts the previous context. Late responses
are ignored after cancellation.

The existing tool list is retained with these project-aware destinations:

| Review item | Destination |
| --- | --- |
| Project reference/control | Selected project's settings |
| Original observations | Selected project's observation stage |
| Contours | Contour generator with its supported `project` parameter |
| Drawing | Topographic composer with its supported `project` parameter |
| Review/delivery | Selected project's delivery stage |
| Optional slope/volume/section tools | Existing standalone tools, explicitly requiring their own source selection/review |

The page reports device **review notes** rather than a completion percentage or
professional acceptance. Notes are scoped to the account, project and the saved
reference hash. A reference change starts a separate checklist, keeping the old
one. The global legacy notes are not read, migrated or removed. Storage errors
are visible and a failed write is labelled as available only in the current
view. Reset affects only the currently scoped review notes. The original CAD
training drawing and its storage were not accessed.

This remains navigation and a personal review aid. It does not convert notes
into approval, infer source authenticity or certify that all linked tools use
one computed revision. Supported project-bound links are distinct from the
standalone optional tools. Changed observation data still needs actual review;
the manual checklist is not a source-revision attestation.

## Verification

Nine initial component regressions failed against the old page, then passed
after the repair. They cover anonymous isolation, project-aware links, legacy
storage preservation, account/project/reference isolation, visible storage
failure, reference retry and missing declaration. An additional late-response
regression checks that a previous project's response cannot replace the current
reference or tool destinations.
The final combined run passed **65 tests across four suites** (10 workflow UI,
34 API admission and existing stage/project-reference checks). Both strict
TypeScript projects and scoped ESLint passed; tracked-file whitespace checks
also passed.

The source preview listener was inspected with host access and reused at
`127.0.0.1:3021`. CUA navigation initially timed out; inspection of the same tab
then showed the actual updated anonymous page, its sign-in link and no global
completion checklist. No tab/browser storage or authentication state was
injected, no source preview restarted, and no production browser was used.

Follow-through is recorded in `TOPOGRAPHIC_SOURCE_ACCEPTANCE_2026-10-23.md`:
a fresh ordinary fixture created its project and declaration through the UI,
passed 13 native HTTP/database import checks, and generated/exported the known
plane through the actual browser contour worker. Four downloaded formats passed
independent file checks. This also exposed and repaired the unconnected drawing
composer and guessed drawing CRS. The free drawing gate passed. The owner
subsequently approved the temporary Pro fixture; paid drawing admission and two
independently checked DXFs passed, and exact restoration to free access was
verified. `TOPOGRAPHIC_DRAWING_AND_SUBSCRIPTION_ACCEPTANCE_2026-10-23.md` records
the subscription RLS, measured point-height and preview/grid repairs this exposed.
Browser upload,
workflow-selection persistence/reload, mobile and receiving-CAD/field evidence
remain open. The previously revoked account was not reactivated.

No production service, customer record, migration or field observation changed
in this UI batch. Source work does not establish deployed or physical-field
acceptance. Continue with `PRODUCTION_READINESS_EXECUTION.md`.
