# ChatGPT notice, contour worker and mobile controls — 11 October 2026

## Promoted, production verified and notice published

Current healthy production is image
`sha256:44106f7a461e7e4d204f4416744ca2852cbf2ef94b5fbc15ea35d31dd9d1f5d6`,
release `working-tree-03dc5697ba72209d`, app container
`34a6af8d799fa7b9e17910489fe892c560edc6aa93363966237a8e2ec5beb817`,
started `2026-10-11T17:51:04.495175634Z`. All 46 planned normal-account HTTP
checks passed. Existing owned grants are visible and revocable with new linking
disabled, another account cannot revoke them, and the page removes revoked grants.
The fixture accounts are suspended, their sessions/passwords invalidated and
the temporary upload removed. Immutable synthetic evidence is retained.

The actual packaged contour worker completed in Chrome: 14 contours, two index
contours and eight triangles, with no TIN worker warning. The native two-page
production drainage PDF also passed independent coordinate/grade/reference,
ownership, page/margin, draft/legend and active-content checks. Evidence is in
`test-results/notice-worker-release/`.

Fresh promoted-production 390×844 CUA also verifies the login's two repaired
44 px targets and the map's six controls at least 44 px. The map is 380 px wide
with equal client/scroll widths, starts below the 65 px navbar and contains the
44×44 offline button at y=625–669 above navigation. The asynchronously initialized
north arrow is present. Temporary viewport overrides were reset. An initial
desktop capture where an override did not apply is labelled separately; the
mobile claims use the subsequent measured 390/380 px artifacts. Final read-only
verification passed at 18:06:17 UTC and binds all result artifacts by SHA-256 in
`test-results/notice-worker-release/completion.json`.

The version `chatgpt-sharing-v1`, content SHA-256
`41b7f9b8f916b710052f230b2a89ce060eb9f7d810828b6e7220e6fab9a538a1`,
was newly published **in the local production platform** at
`2026-10-11T17:56:45.516Z`. The full 30-day period ends
`2026-11-10T17:56:45.516Z` — **10 November 2026, 20:56:45.516 EAT**.
The actual production API and Chrome notice page show those exact timestamps
and 30 days remaining. No historical date was invented. The environment flag
remains false and MCP initialization returns 503. Eligibility does not enable
linking automatically or grant consent.

Post-publication archives `/backups/db_20261011_175658.sql.gz` and
`/backups/uploads_20261011_175658.tar.gz` passed archive/header checks; the notice
record was extracted from the upload archive and its version, time, scope and
hash matched exactly. These newest archives were not separately restored; earlier
actual restore/upgrade evidence remains in RECOVERY_AND_MIGRATION_REVIEW_2026-10-10.md.
The pre-promotion checkpoint uses the matching `20261011_175057` archives.
All older archives remain intact. Publication did not restart any service.

`rollback-current` protects the new verified image; the prior 0e488fe0... image
is retained as `rollback-notice-worker-baseline-verified`. Older verified 7e733...
and 650c... rollback aliases remain. Supporting identities/images/start times,
all mounts, runtime settings apart from release ID, 109 applied hashes and the
restricted database role are preserved. No migration, duplicate app, extra
builder, image/volume deletion or browser-protection change occurred.

The publisher/promoter have completed: do not rerun them as health checks.
Use the read-only `npm run docker:verify`. Publication and backup proof is in
`test-results/chatgpt-notice-publication/`, including the actual Chrome screenshot.

## Source verification

The unknown historical notice date is not used. The new versioned in-platform
notice has its own content hash and a write-once server publication timestamp.
Publication does not grant a connection. All OAuth/MCP configuration requires
the exact reviewed notice version and digest plus a full 30-day elapsed period,
an explicitly enabled deployment and an acceptable origin. Existing owned
connections remain visible and revocable while new linking is disabled.

The notice page is `/docs/chatgpt-notice`, its read-only status is
`/api/public/chatgpt-notice`, and a prominent homepage/dashboard/projects notice
links to it. The privacy page distinguishes its last-updated date from actual
notice publication. Requests never write publication metadata. The operational
publisher rejects historical date arguments, symlinks and changed existing
records and uses the existing `/app/upload` volume. It sends no email and issues
no OAuth credential.

Source SHA-256: `03dc5697ba72209d763e77593602e30a8ebec15ede4a887e3cc43fb5f47f923e`.
Evidence is in `test-results/notice-worker-release/source-checks.json`.

- 87 focused tests across 11 suites passed, including notice boundaries,
  disabled-linking revocation visibility, ownership predicates, storage errors,
  worker crash/timeout handling and asynchronous north-arrow readiness.
- Application and test type checks passed. Scoped lint passed across 28 files.
- Source CUA on the owned `127.0.0.1:3021` origin confirmed actual background
  worker execution for nine synthetic plane points: 14 contours, two index
  contours and eight TIN triangles. No worker crash/timeout warning occurred.
- The previous production bundle served uncompiled TypeScript as a worker
  asset. Keeping the literal `new URL` in the `Worker` constructor enables
  bundling; the UI reports the engine that actually completed the calculation.
- Source 390×844 CUA confirmed 44 px Forgot password and Remember me targets,
  six secondary map controls at least 44 px, a visible north arrow after map
  initialization, and the 44×44 offline button inside the map above navigation.
- Source HTTP confirmed the unrecorded notice stays unavailable, its reviewed
  copy and homepage banner render, and MCP initialization returns 503.

At the source checkpoint production was still the preceding workflow release,
and no new publication timestamp had yet been recorded. The section above gives
the subsequently verified production state.

## Completed promotion procedure and verification scope

Promote only the app after checking the exact candidate/source/proof hashes,
unchanged runtime configuration and mounts, zero active background jobs, all
109 migration hashes and the restricted runtime role. Retain private old logs
and a fresh database/upload checkpoint. Supporting services must retain their
identities, images and start times. Preserve the verified workflow rollback.

The production verifier completed 46 normal-account synthetic HTTP checks: the
existing 35 workflow checks plus notice visibility, blocked OAuth/MCP, ownership
and revocation while new linking is disabled. A synthetic revoke fixture uses
an invalid resource and has no credential. Accounts and remaining fixture
grants are disabled/revoked afterward; customer fixtures remain untouched.
Actual packaged worker execution was confirmed in the browser. The new
in-platform notice was then published and its exact timestamp, 30-day eligibility
instant, unchanged disabled flag and MCP 503 were checked. The publication record
is retained in the fresh upload backup described above.

## Boundaries

Local Docker delivery does not prove public HTTPS, external customer receipt,
ChatGPT account consent, public-directory acceptance, provider sign-in/payment,
physical touch/instrument/receiver behavior, construction acceptance or a
finished engineering platform. Public HTTPS and actual human linking remain
separate release gates. Source synthetic browser QA preserves the user's
localhost CAD training drawing.
