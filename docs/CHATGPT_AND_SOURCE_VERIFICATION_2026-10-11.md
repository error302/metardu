# METARDU ChatGPT and source verification — 11 October 2026

Current production is healthy image **44106f7a461e...**, release **working-tree-03dc5697ba72209d**. The notice/worker/mobile release passed 87 focused source tests, both type checks, scoped lint and 46 actual production normal-account HTTP checks. The packaged contour worker completed in Chrome. The new in-platform ChatGPT notice was published at 2026-10-11T17:56:45.516Z; its period ends 2026-11-10T17:56:45.516Z (10 November, 20:56:45.516 EAT). Customer linking remains disabled; public HTTPS and actual human consent remain separate gates. The notice record is verified in the fresh upload backup. All 109 hashes, restricted role, supporting service identities and mounts are preserved. Read [NOTICE_WORKER_VERIFICATION_2026-10-11.md](NOTICE_WORKER_VERIFICATION_2026-10-11.md) for the current evidence and rollback identities.

## Historical connector-source release and preservation — 12:47 UTC

| Item | Verified state |
| --- | --- |
| Image | `sha256:7e73394d95c306d1c454a8735b0cf9eb1e7795ca2859126132ff4aaa3bba142e` |
| Release | `working-tree-005381d4cdbbd68b` |
| Selected source SHA-256 | `005381d4cdbbd68b981da274d36a1574a3a3fc4dca0a44c50c0ad4c035527c42` |
| App container | `1260dd3dd406e01fd82f6811acc2f8cfdddf684c35df6c48272e08755b138264` |
| App start | `2026-10-11T12:47:25.988647478Z` |
| Migration ledger | 109; no pending, missing, mutated or ghost entries |
| Database role | Restricted `metardu_app`; original reviewed privileges preserved |
| Customer MCP | Disabled; local production endpoint returns 503 |
| Supporting runtime | PostgreSQL, Redis, worker, collaboration, NTRIP and backup identities/images/start times/mounts preserved |
| Application inventory | One production application; no duplicate preview container or new builder |

One reusable candidate was built with the existing builder and promoted after
source verification and recovery review. All composed runtime environment values
were preserved apart from the intended release ID. No new migration was required.
The actual production schema accepted the selected observation columns in a
`WHERE false` query, returning no customer rows.

Fresh archives `/backups/db_20261011_124721.sql.gz` and
`/backups/uploads_20261011_124721.tar.gz` completed at 12:47:23 UTC. Archive/header
integrity passed and earlier archives remain intact. This fresh checkpoint was not
separately restored; earlier actual restoration/upgrade rehearsal remains separate
evidence. Previous app logs remain private in the backup volume.

At this earlier checkpoint `rollback-current` protected 7e73394d...; that baseline
is now rollback-workflow-baseline-verified. `rollback-previous-verified` retains
650c1a18.... Older 80497396... and pre-migration d2b47891... tags were preserved.
The original pre-migration image requires its matching recovery state. Never
blindly restore an older database over later customer writes. No images, volumes
or caches were deleted during this connector-source promotion.

Evidence: `test-results/connector-source-release/candidate-build.json`,
`source-checks.json`, `promotion.json`, `normal-account-http.json` and
`rollback-readiness.json`. The read-only `npm run docker:verify` passed after
promotion and rollback protection. One-time promotion helpers have already run;
do not rerun them merely to check health.

## Repairs shipped

- Optional configuration errors no longer discard valid database/authentication
  settings from the parsed environment. Each valid field survives; invalid optional
  fields are omitted and the required runtime auth secret remains enforced.
- Public health accepts the existing validated working-tree release-ID format.
  Database/cache failures return generic diagnostics without connection strings.
- `list_project_observations` returns recorded horizontal CRS, vertical datum,
  fix quality, accuracy source and capture source alongside each observation.
  Legacy missing values stay null; project declarations are distinguished from
  per-observation evidence. Private IDs, notes and device fields remain excluded
  from observation rows. Consent copy and the tool contract describe the added fields.

The environment repair followed a real synthetic registration 503. Health release
identity and diagnostic-leak tests, environment retention cases, and observation
provenance/null cases first reproduced defects and then passed. No engineering
reference transformation or field verification was inferred from these fields.

## Verification and limits

| Layer | Result | What it establishes |
| --- | --- | --- |
| Focused source | 99 tests in 12 suites passed; app/test types and scoped lint passed | Connector/environment/health plus authentication/database regressions |
| Source MCP HTTP | 22 checks passed | Discovery, registration, token/PKCE rules, all seven tools, ownership/privacy, known calculations, report drafts, rotation/replay/revocation |
| Source drainage HTTP | 24 checks passed | Real synthetic sessions, declared references, saved definitions/revisions, precise captures, idempotence, rejection/history, private CSV/HTML exports |
| Production normal-account HTTP | 25 checks passed on current image | Real sessions, private project/audit isolation, exact coordinates/unknown height, CSV/GeoJSON, file byte equality/isolation/deletion, packaged PDF import, revocation |
| Source drainage browser | CUA rendered the actual exported HTML on owned loopback | Visible synthetic cut sheet, exact values, verdicts and DRAFT markings |

Source HTTP checks used the existing allowlisted database `metardu_runtime_verify`
on port 55433 with its exact synthetic beacon marker. The host source preview on
127.0.0.1:3021 is separate from customer production. MCP authorization codes were
seeded in synthetic fixtures: this does not establish human consent. The synthetic
HTTPS issuer was never contacted and no OpenAI request was made. Four MCP source
accounts and two drainage source accounts were suspended after verification;
private immutable records were retained.

Production verification added two clearly labelled synthetic users to the six
already retained from earlier attempts. All eight are disabled; their credentials
and sessions were invalidated. The latest temporary upload and metadata were
removed. No customer fixtures were modified and no external email was sent.

The drainage run deliberately reports `pdfPrintVerifiedInThisRun:false`. It does
not repeat the earlier packaged cut-sheet PDF-print proof. Current production
PDF text import is a separate check. Failed/incomplete synthetic captures remain
in history, unknown accuracy is not converted into a pass, and old revision exports
remain available after redesign. No physical receiver or instrument was tested.

CUA used normal browser rendering without writing page storage or application
heap. A temporary exact synthetic public QA copy was created exclusively for that
render, removed after content-hash validation, and absent from the candidate build.
The user's localhost CAD training drawing was preserved. After QA, the existing
source preview was restarted with its default synthetic MCP opt-in off: health 200
and MCP 503 were confirmed.

The final bounded endpoint recheck is saved in
`test-results/connector-source-release/source-preview-default.json`. Current
process ownership could not be inventoried from the restricted shell; the recorded
launch PID is no longer visible there. No additional process action was attempted.
Read fresh listener/ownership metadata before any future source-process change.

Evidence: `test-results/chatgpt-source-http/result.json` and preserved failure
reports; `test-results/drainage-source-http/result.json`,
`synthetic-drainage-cut-sheet.html`, `synthetic-drainage-observations.csv` and
`cut-sheet-browser.png`. The first registration failure identified the environment
bug. A later failure was a verifier field-name mismatch, corrected to the actual
project contract rather than changing application behavior to satisfy the verifier.

## Public delivery and customer linking gates

Authenticated Cloudflare API reads matched the account identified by the user.
The active metardu.space zone has proxied apex/www CNAMEs to tunnel
`388a6a1a-736d-47f8-825b-f7db964d4cdf`. The healthy tunnel reported four connections,
remote ingress to `http://localhost:3000` for both hostnames, and fallback 404.
Worker routes were empty. This connects the intended public hostname to the
existing local Docker deployment; no Cloudflare configuration was changed.

Actual public delivery remains unproved. Earlier probes returned 530/1033, later
direct requests timed out, Chrome reported ERR_BLOCKED_BY_CLIENT, and the independent
web tool could not fetch the endpoints. These observations do not establish a
current origin outage. A successful Cloudflare trace skipped the origin and proves
only simulated routing. Browser protections and the healthy existing tunnel
process were left intact.

The privacy page displays “Last updated October 5, 2026”; actual customer-notice
publication has not been confirmed. The app policy requires a 30-day material-change
notice period before customer data sharing is enabled. Do not substitute the page
label for publication evidence or enable MCP before that gate is fulfilled.
The runtime still exposes credentials sign-in only; Google/Azure provider keys
and registrations are absent. Real human ChatGPT authorization and tool use,
refresh/revocation through ChatGPT, public HTTPS discovery and directory approval
remain unverified.

Evidence: `test-results/chatgpt-live/cloudflare-connector-audit.json`, public-delivery
reports, `chrome-delivery-block.png` and `local-origin-after-promotion.json`.
The final local production check confirmed healthy database/cache, the exact
current release, credentials-only providers and MCP 503.
The integration contract is in [chatgpt-integration.md](chatgpt-integration.md).
OAuth guidance was checked against the official
[OpenAI authentication documentation](https://developers.openai.com/plugins/build/auth)
and [MCP server documentation](https://developers.openai.com/plugins/build/mcp-server).

## Broader unfinished gates

Payment/provider delivery, receiver/mobile/touch/offline behavior, complete offline
coverage, professional print scale, offsite disaster recovery and national/legal
acceptance still require their own evidence. A 6.02 MB bundle is excluded from
automatic offline precaching. Source and synthetic proof must not be presented as
customer-provider, physical-field or legal certification proof. Historical cache
and Windows free-space values in earlier reports predate this later build.
