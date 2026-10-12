# METARDU production-readiness review

**Reviewed:** 2026-10-05  
**Scope:** current local worktree plus a read-only browser inspection of `https://metardu.space`.  
**Decision:** METARDU has substantial real survey capability, but this review does not establish that the current live deployment is production-ready for end-to-end cadastral or civil-engineering work. The live site was not changed.

## What the live review showed

The live homepage loaded and exposed the underlying landing page, navigation, tool links, pricing, and footer. Its entry overlay still displayed a fixed `37%` shader-loading state and required a click to enter. The local worktree now uses an indeterminate route-loading state and keeps the cinematic splash as a preview-only component; the refreshed landing page and footer are also local changes and have not been deployed.

The live page advertises specific Kenyan surveying standards, offline operation, and broad authority workflows. Those claims need to be tested against the exact shipped workflow, evidence, and current authority requirements. A web page rendering correctly is not evidence that server integrations, migrations, GNSS processing, offline synchronization, billing, or exports work in production.

## Work completed in the local worktree

- Reworked landing-page content to describe visible workflow stages and professional review without claiming authority acceptance or certification. Added a clearly labelled private-preview ChatGPT connection section.
- Replaced the fixed-percentage route loader with an indeterminate loading state. Removed the misleading enabled save action from the unavailable PKI-signing tab; drawn or typed marks are described as acknowledgements, not certificates.
- Replaced the static METARDU University `Coming Soon` screen with links to existing field, coordinate-reference, traverse, levelling, boundary-plan, drainage, and review resources. The page explicitly does not claim to award qualifications.
- Corrected GNSS coordinate entry so it starts blank, requires measured ellipsoidal heights and positive uncertainty, and never labels a coordinate-only conversion as a processed GNSS fix. Connected the RINEX panel to the existing authenticated RTKLIB worker route and expose worker values as returned.
- Added project drainage set-out calculations and schedule exports. Inputs require a registered projected metre CRS, surveyed manhole coordinates and levels, pipe outside diameter, an entered cover criterion, and chainages consistent with straight coordinate chords. Intermediate ground and cover are left unassessed. Added an A3 schedule PDF that is marked draft/review-required and states its limitations.
- Fixed engineering project persistence so road and drainage saves, mode changes, and Save All surface database errors and reject updates that return no project row; the browser DB proxy reports some authorization/filter failures as an empty successful result. Kept Manning capacity and velocity at calculation precision until presentation, preventing threshold rounding from creating a false flow-capacity pass.
- Made offline field-photo persistence atomic with the observation and sync queue. Migration `078_offline_field_photos.sql` is present but has not been applied to a production database.
- Fixed PostgreSQL request-context handling in `db.query`: session-scoped user and organization context is applied for the leased connection and cleared before pool reuse; a connection is destroyed if cleanup fails. Transaction calls now set both local contexts. Added a focused regression test.
- Added version-based NextAuth session revocation and an account control to sign out all devices; the one-time migration `081_user_session_version.sql` must be applied before deploying this code. Survey audit reads now check project membership, writes record the authenticated user, and field-to-finish uses the same revocation-aware session path.

## Drainage and construction support

METARDU can assist a surveyor with ordered manhole-run coordinates, chainages, selected pipe geometry, interpolated invert and crown set-out levels, CSV/PDF schedules, field-shot comparison, measured cover checks at entered manholes, and a bounded full-bore pressure energy profile for a continuous-flow unbranched run when an engineer supplies the outlet HGL and each access-hole loss coefficient.

That does not yet amount to a complete drainage-design or construction-control package. The pressure profile rejects mixed free-surface/pressure flow and requires every reach to exceed its maximum free-surface capacity; it does not solve backwater or surcharge transitions, derive tailwater/critical-depth or outlet losses, model laterals/branches, or certify a standard. The current construction schedule does not establish intermediate ground cover, inlet capture, catchment hydrology, storm return-period suitability, outfall capacity, utility clashes, trench and bedding design, dewatering, traffic staging, machine-control files, or as-built acceptance. Manning and Rational Method tools are preliminary calculation aids; they do not select project design criteria. The project must use approved survey control, current project specifications and authority manuals, and independent engineering and survey review.

The full-bore pressure profile is an energy-balance aid, not a claim of HEC-22 compliance. HEC-22 evaluates HGL/EGL from an outfall boundary and includes pipe and access-hole losses; it also treats supercritical reaches differently. METARDU currently requires the outlet HGL and junction loss coefficients to be selected and entered by the responsible engineer. See the [FHWA HEC-22, 4th edition](https://www.fhwa.dot.gov/engineering/hydraulics/pubs/hif24006.pdf).

KeNHA publishes road-design manuals and standard specifications, including current updates, and its road-work scopes cover topographic, hydrological, drainage, ground-investigation, pavement, bridge/culvert, and construction requirements. METARDU should treat these as separate verified workflows and reference revisions explicitly, rather than describe the full discipline as one calculator. See [KeNHA's updated manuals and specifications](https://kenha.co.ke/document/updated-road-design-manuals-and-standard-specifications/) and the [Survey of Kenya / Land Surveyors' Board context](https://lsb.go.ke/).

## Blockers before production-readiness can be claimed

### P0 — establish shipped behavior and data safety

1. **Release and live verification:** deploy the reviewed local changes through the normal release pipeline, then smoke-test the deployed site on desktop/mobile, including initial loading, offline/restore behavior, authentication, save/reopen, project exports, and footer/legal links. This work has not deployed anything.
2. **Database state:** verify the production migration ledger and backup/restore procedure before applying pending schema. In particular, validate migrations `077`–`081` against a production-like database, then apply them in order. No `.env` migration was run.
3. **Tenant isolation:** the local connection-context fix has a regression test, but production row-level-security policies still need integration tests using separate users, organizations, projects, and pooled connections. Exercise both `db.query` and multi-statement transactions.
4. **GNSS worker:** verify the deployed RTKLIB worker with representative base/rover/navigation RINEX from known control, antenna heights, reference frame, epoch overlap, timeouts, file-size limits, and uncertain/failure solutions. Local wiring does not prove worker availability or survey suitability.
5. **Offline records:** test field-photo capture, airplane-mode restart, queued retries, duplicate prevention, project access, and server reconciliation on physical devices after the migration is applied.

### P1 — close honest but unfinished product paths

- **Organization management:** the database schema and role helpers exist, but `/organization` is still a static placeholder; creation, invitations, member administration, and permission-tested shared projects need working UI/API flows. The production migration adds and current policies must be tested before enabling them.
- **Registry integrations:** `parcelSearch.ts`, Tanzania land-registry submission, Uganda NLIS, and Kenya NLIMS currently throw `not implemented`. These require official API contracts, environment-specific credentials, sandboxes, error/receipt semantics, and partner approval. METARDU must not simulate a successful submission. Until access exists, provide truthful export/manual handoff states and do not market a live integration.
- **Certificate signatures:** PKI signing remains unavailable until certificate authority/provider, key custody, identity proofing, revocation, and audit requirements are implemented and tested. Typed/drawn acknowledgements are not PKI signatures.
- **Session revocation:** implemented locally with per-user JWT versions, account-wide revocation, and a regression test. Existing sessions must sign in again after release; apply migration `081` before deployment. Device-by-device session listing is still unavailable, and production revocation has not been tested.
- **Parcel search and authority acceptance:** imported or project-owned parcel records can be searched locally, but a live land-registry lookup and authority acceptance cannot be claimed without the official service and validation evidence.
- **Survey evidence lifecycle:** continue wiring revisions, source hashes, approval/supersession and measured QA evidence across every calculation and export path; the older [`READINESS_AUDIT.md`](./READINESS_AUDIT.md) identifies further stage and document-control gaps and must be reconciled as implementation progresses.
- **Field workflow:** unify `/field` and `/mobile/field`, verify offline basemap licensing and caching, durable GNSS observation capture, station/antenna metadata, and field-to-office reconciliation.

### P2 — professional coverage and presentation

- Expand engineering from isolated calculators into controlled project workflows for levelling, topographic capture, road/corridor profiles and cross-sections, utilities, drainage, earthworks, structures, as-builts, monitoring, and deliverable review.
- Test printed sheets and PDFs at intended paper sizes, scales, orientations, fonts, clipping, units, CRS/vertical datum, revision identity, and source references. A schedule PDF is not a scaled construction drawing.
- Run accessibility and responsive review across public pages and authenticated survey tools; validate focus, keyboard operation, contrast, labels, tables, mobile field inputs, and loading/error/empty/offline states.
- Verify every marketing statement and plan entitlement against measured production behavior, especially claims about standards compliance, supported authorities, offline capability, exports, and team features.

## Verification recorded in this pass

- `npm run typecheck` passed after the GNSS and learning-page work.
- Focused tests passed: 7 suites / 49 tests covering database RLS context, GNSS UI and baseline client, drainage calculations and project network tools, and the engineering schedule PDF.
- Session revocation and survey-audit authorization tests passed: 3 suites / 10 tests. `npm run typecheck` passed after the implementation; migration-state verification could not connect because `DATABASE_URL` is not configured in this worktree.
- Current engineering regression suite passed: 15 suites / 215 tests, including an independent 300 mm Manning reference value, a rounded-threshold exceedance case, and error/zero-row save responses.
- Current read-only health probes returned HTTP 200 from `http://127.0.0.1:3000/api/health/live` and `https://metardu.space/api/health/live`. Health responses do not prove the local source edits are deployed or that authenticated workflows pass.
- `node --check scripts/prepare-standalone.mjs` passed.
- Scoped `git diff --check` passed; a repository-wide diff check still reports whitespace in other already-modified files and was not mass-cleaned.
- `npm run build` passed against this worktree: optimized bundle compiled, types validated, and all 215 static pages generated. The postbuild script copied static/public assets but warned that the local build environment has no `canvas` native binding.
- This Windows build reported PWA support disabled by the platform guard. Docker runtime verification is unavailable on this workstation because the Docker engine pipe is inaccessible; Linux PWA output and native canvas loading in the target image therefore remain unverified here.
- The rebuilt standalone server returned HTTP 200 for `/` (129,957 bytes) and `/api/health/live`. The home HTML included the updated landing heading, footer disclaimer, ChatGPT private-preview copy, and corrected metadata; it did not contain the prior “complete surveying platform” claim or fixed `37%` splash. The visual browser smoke for the local server timed out, so this verifies server-rendered HTML and status only, not pixel-level appearance or interaction.
- The server logged that Upstash Redis rate-limit credentials are absent and the in-process limiter is active. This is acceptable only for a verified single-container deployment; use shared rate limiting before scaling across replicas or serverless instances.

## Go/no-go

**No-go for a blanket “production-ready for every surveyor workflow” claim today.** Continue with the P0 deployment, database, GNSS, and field-data verification first; then enable organization and authority workflows only after their migrations, authorization rules, provider contracts, and end-to-end tests are concrete. The current worktree contains useful local fixes, not evidence that `metardu.space` has received or passed them.
