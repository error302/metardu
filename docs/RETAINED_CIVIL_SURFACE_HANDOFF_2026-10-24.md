# Retained civil surface handoff integrity

24 October 2026. Source checkpoint in the continuing production goal. No
production promotion, payment, field survey or receiving-CAD acceptance occurred.

## Problem and resulting behavior

The legacy civil-export surface action described a usable TIN while writing a
live point list without retained faces. Several point exporters also converted
unknown measurements to zero or accepted an undeclared reference. Those outputs
could appear complete while representing different survey evidence.

The surface option now selects an exact saved revision through a private,
owner-bound read. It exports that revision's original TIN vertices, faces,
constrained-edge flags, reference and provenance; today's points and point
filters cannot alter it. Clipped revisions retain their saved faces around
exclusions instead of retriangulating across a hole. Output is explicitly a
computed draft, with field verification and professional approval false.

The old `exportLandXMLSurface(points, ...)` entry point explicitly refuses and
directs callers to the saved-revision workspace. It cannot turn a point cloud
into an apparently finished surface. Other point formats require finite XYZ,
nonblank unique names, a supported declared projected grid and valid coordinate
ranges. Unknown coordinates/heights remain unknown and prevent export; recorded
zero remains zero. Record separators and unknown export formats are refused.

The new `/api/project/[id]/civil-surface-export` GET handler checks project
access and binds its SELECT to the admitted owner. Inventory returns at most
200 revisions and a truncation indicator; an older exact revision ID can be
entered explicitly. Artifact access checks the central LandXML paid feature
before loading the mesh. A missing, foreign, transferred or inconsistent revision
returns a refusal rather than a substitute file. No mutation, migration,
triangulation or deliverable-register success is claimed by this read route.

Retained admission checks the raw JSON snapshot/mesh hashes, reference hash,
project/revision IDs, parameter binding, observation identities/counts and
reference declarations. It checks finite mesh coordinates, face indices,
degenerate/duplicate faces, nonmanifold edge use and constrained-edge presence.
Clipped records additionally bind their saved domain definition and parent mesh,
and reconcile retained face area. The output uses standard LandXML 1.2 TIN Pnts
and Faces with one-based indices. These checks are structural and provenance
checks, not independent certification of every terrain surface or height datum.

## UI failure and project-switch repair

New DOM checks reproduced three defects in the initial implementation:

- A failed inventory request also displayed “No saved surface revisions”.
- An aborted previous project's response could overwrite the next project's
  loading/error state.
- A late previous-project download failure could leak its error or busy state
  into the next project.

The component now distinguishes confirmed empty inventory from failed loading,
uses per-effect admission for list responses, and invalidates a previous download
when its project changes. Failed downloads retain the selected revision and
produce no file. A manual older UUID is validated and used unchanged for both
the request and downloaded filename. Loading, refusal and computed-draft notices
are visible and accessible. These are mounted DOM checks, not paid browser proof.

## Verification

| Evidence boundary | Observed result and limit |
| --- | --- |
| Regression reproduction | `.cache/civil-surface/ui-red.json`: three failing new cases reproduced the false empty state and the two stale-project cases. |
| Focused source/component | Seven suites / 67 tests pass in `.cache/civil-surface/jest.json`, including shared LandXML/reference and retained surface/API checks. A subsequent type-only test assertion correction passed all six download component tests in `ui-final.json`. |
| Type/lint/security | Both strict TypeScript projects pass; final test typing passes again after the assertion correction. Scoped ESLint reports zero errors/warnings. `security:gate` passes with 119 historical migration pins and API/PWA guards; 698 test files and 3216 source files scanned at that run. This is not a complete historical secret or security audit. |
| Actual synthetic SQL/handler | `native.json`, checked 14:42:49 UTC: seven cases against the exact admitted rehearsal database. The writer/route are unchanged since that run. Real JSONB reads emit four original vertices/two faces and a clipped eight-face annulus of area 84 m2 around a 16 m2 exclusion. Plan refusal performs no mesh query; transferred ownership and altered stored geometry refuse. Original six-table fingerprints and migration ledger were unchanged; the uniquely owned fixture schema was removed. Auth/plan adapters are bounded, not ordinary paid HTTP or RLS acceptance. |
| Official schema | `schema-result.json`, checked 14:42:50 UTC: `retained-native.xml` and `retained-exclusion-native.xml` both pass the pinned official LandXML 1.2 XSD with no issues. Files and metadata use synthetic observations. |
| Ordinary browser | Earlier CUA navigation on the owned loopback preview reached the Pro-plan feature gate. `browser-plan-gate.png` records it. No session, entitlement or storage bypass was used; a successful paid UI download remains unproven. |
| Production health | Fresh `npm run docker:verify` passes the one existing app and required supporting services. Backup completion `2026-10-24T02:00:04Z` is archive/header evidence only. No service lifecycle action or promotion occurred. |
| Public reachability | Fixed read-only origin/home/pricing/login/health probes all pass HTTP 200 at 14:58:02 UTC / 17:58 EAT. Public health reports release ID `unknown`; it does not identify this source as deployed. Receipt `.cache/public-availability/current.json`. |

Reproduce the focused tests and admitted native probe using the commands in
`CIVIL_MAP_AND_OPERATIONS_HANDOFF_2026-10-24.md`. Inspect identity guards before
running fixture helpers. The native probe creates only a uniquely marked schema
on the existing exact synthetic service; never redirect it to customer data.

## Remaining source, live and external gates

**Source/release:** reconcile the concurrently edited saved-surface request,
terrain/DXF, account and mobile work before one coherent release. This patch
does not require migration 116; the other work does, and its compatibility and
rollout remain separate. Review customer recovery, artifacts, worker drift and
verified rollback before promotion. No full Next/Linux build, remote CI or
combined release acceptance was run for this patch.

**Live/provider:** verify the actual promoted revision and ordinary paid
download when an eligible account is available. Actual purchase, webhooks,
entitlements, cancellation and current inbox delivery remain separate. The
known signing-key exposure stays open under the owner's rotation deferral.

**External/field:** import these bytes into the intended receiving application,
compare retained faces/constraints/heights and exclusions, and obtain independent
terrain/control, instrument, paper and professional acceptance. A schema pass
does not establish any of those. This is a generic retained mesh handoff, not an
Australian ePlan, cadastral lodgment or professional certificate.

All customer records, production uploads/services, applied migration hashes and
the localhost CAD training drawing remain outside this patch. Computer-browser
testing and the ChatGPT notice/deployment/human-consent gates remain in force.
The broader goal and `SINGLE_CHAT_HANDOFF_2026-10-24.md` remain authoritative.
