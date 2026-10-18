# Unified METARDU continuation

The user requested continuation of this chat together with **Explore METARDU
ChatGPT plugin** (`01a1081c-4e70-7750-bb05-da73c3da3b65`). That chat's recent
failed turns ended with connection errors. Its source work is already in this
checkout's history; no second checkout, cherry-pick or application is needed.

## Combined scope

- Mobile fieldbook and Android/controller workflows: comfortable entry, real
  transport state, durable local saves, acknowledged server saves, recovery,
  explicit project selection and validated transfer.
- Consistent dashboard, owner administration, desktop navigation and mobile
  dock; organized map, deliberate GPS control and actual map printing.
- Cadastral, engineering, road, construction and topographical workflows with
  project CRS, raw observations, revision-bound calculations and honest evidence.
- Auth, branded verification/reset email, subscriptions, provider configuration
  and business operations. Source changes do not establish provider delivery,
  payment or physical instrument acceptance.
- Private ChatGPT/MCP tools with access control and evidence-backed notice
  eligibility. Do not backdate a missing publication record. CAD automation and
  proprietary DWG remain separate integration/approval work.
- Affordable acquisition: organic marketing drafts and consent-aware customer
  follow-up. No paid LinkedIn spend is authorized by the promotional credit.

Recent shared commits include `a5a769af` (dashboard/field workflows), `01f444cd`
(instrument collector), `00ad570b` (saved project CRS for GNSS), `daa272b0`
(workflow repairs) and `52eb3f57` (mobile fieldbook/save/dashboard recovery).
The source checkpoint before this continuation was `d8f72dcc`.

## Release baseline and safeguards

Live inspection on October 18, 2026 found one healthy `metardu-app` at revision
`eac2835e377f59dd0d1b1ff98cb3fbc311401f22`, image
`sha256:3f97a2ebefae129a7262d0d02ce99c4fd406f60f307d4b067d1a46aceace7bc8`.
Its restricted runtime has 115 applied migrations, with no changed or unknown
hashes against current source. Pending migrations are exactly
`111_personal_project_reader_rls` and `112_project_reader_snapshot_lock`.
They add request-scoped personal-member reads and a checked read-lock helper;
they do not grant membership management or general project updates.

The reusable `--unified` release namespace keeps evidence under the full source
revision and preserves earlier survey/auth and failed-source receipts. It retains
pinned Git builds, the 8 GiB free-space guard, real source
checks, synthetic forward migration/preservation proof, actual rollback startup
verification, fresh backup, customer-row fingerprints and supporting-service
identity checks. Earlier rollback images retain content-based aliases without
copying image layers. No customer database is cloned for this release.

The already-running host preview and its development cache are preserved.
Only inspected, regenerable host webpack `client-production` and
`server-production` cache directories were removed for build space; compiled
output, source, browser storage, drawings and Docker data were retained.
The exact pre-cleanup manifest is local `.cache/host-webpack-cache-manifest.json`.

## Production outcome and follow-up

Application revision `603d88b89dee0daaf4150e8dfb9002b4b8eb1a73` was built from
the pinned Git archive and promoted into the existing application service.
Image: `sha256:b2e12ba5e0a2c41467032453b632189bc42799b6aea1e392e19398d0bccd0154`.
The public HTTPS health endpoint reports that exact revision and HTTP 200.
All required supporting service IDs, start times and mounts were preserved;
exactly one application container remains. No image/volume pruning occurred.

Fresh checkpoints are `/backups/db_20261017_233859.sql.gz` and
`/backups/uploads_20261017_233859.tar.gz`, completed at 23:39:03 UTC.
Archive/header integrity passed; this is not a new restore exercise. The normal
migrator exited zero at 117 entries, preserving historical hashes and the
controller's existing-record fingerprints. The previous production image is
protected as `rollback-current`; older rollback aliases remain available.

Seventeen actual HTTPS checks passed: public health, anonymous API refusal,
two disposable credential sessions, exact fieldbook acknowledgement, idempotent
retry and durable payload preservation, cross-account read/overwrite protection,
alignment access/cache protection, profile authority refusal/ordinary editing,
and empty pipeline history. QA accounts, projects and books were removed;
no customer records or measured evidence were created/changed, and no email
was sent. The original failed negative-test expectations are preserved locally.
A zero-row guarded upsert intentionally returns `data:null,error:null`; the
probe now requires both no acknowledgement and independently unchanged stored
ownership/content, rather than assuming every denial is HTTP 403.

The public map showed the new interface and the mobile attribution cleared the
dock. Production browser inspection also exposed recoverable React #418 on
each initial render. Origin HTML preserved the footer email anchor, while
Cloudflare replaced it and injected its decoder. The documented per-address
`email_off` exemption now wraps the entire fixed public anchor. It contains
no user-controlled HTML. Reference:
[Cloudflare Email Address Obfuscation](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/).

The keyboard shortcut now detects Mac after mounting so Linux SSR and a Mac
client have the same first render. Focused server-render/hydration tests passed.
There were no pending SQL migrations for that follow-up; the controller still
requires matching complete production/synthetic registries, rollback startup
verification, source checks, a fresh checkpoint and supporting-service checks.
It records forward-upgrade proof as not required when no SQL is pending,
rather than fabricating an upgrade success.

### Final deployed revision

`4fa998fcf597c63a0cebd83685e233865d61b616` is now deployed, image
`sha256:af17d7af4559e416e60be3956e89d62238e4d4aefc653782a9f0e4d3fff75dbe`.
The pinned Linux build passed compilation, strict type validation, all 219 pages,
standalone packaging and native dependency checks. Both source/test type checks,
the two focused hydration tests, scoped lint and ten release/probe boundary tests
passed. GitHub gitleaks run `39080843590` passed for this exact revision.
The preceding combined application checkpoint passed 853 tests in 140 suites;
seven tests in two suites were skipped. These are separate source checkpoints.

The final promotion took fresh checkpoints
`/backups/db_20261018_001422.sql.gz` and
`/backups/uploads_20261018_001422.tar.gz`, completed at 00:15:01 UTC.
The ledger remains 117, every historical hash and checked existing record was
preserved, and all supporting service IDs/start times/mounts remained unchanged.
The preceding deployed image `b2e12ba5...` is protected as `rollback-current`;
older protected images retain their aliases. The final Docker verifier passes
with exactly one application container. Scheduled backup execution and a new
restore exercise remain separate acceptance work; manual backups do not prove
the scheduler.

All 17 HTTPS checks passed again on the final release. An independent read-only
query across all four probe receipts confirmed zero remaining QA users,
projects, alignments and fieldbooks. Public HTTPS reports the exact release ID;
origin and Cloudflare footer anchors match, with zero email rewrite/decoder
injections. Fresh 390x844 and 1280x900 map loads captured no browser errors.
The mobile tools expand, map attribution is visible above the dock, and the
temporary viewport override was reset. The user's original tab and localhost
CAD drawing were preserved. The local screenshot is
`.cache/metardu-released-map-mobile.jpg`.

The live desktop print action downloaded
`C:\Users\user\Downloads\metardu-current-map (2).pdf` without overwriting prior
downloads. Independent PDF parsing confirms a valid PDF-1.3, one A4 landscape
page, two image objects and 3,892,002 bytes. This is a current-view reference,
not certified survey/physical-print evidence. The browser download tool call
reported about 97 minutes before returning; app versus browser/tool delay was
not isolated. PDF structure passed, but normal print latency is not accepted
on this evidence and needs a controlled foreground check.

Final local receipts are in
`.cache/release-verify/unified-release/4fa998fcf597c63a0cebd83685e233865d61b616/`
(`promotion.json`, `source-checks.json`, `live-survey.json`, `public-render.json`,
`browser-checks.json`, `build-1.log`), with independent cleanup evidence at
`.cache/release-verify/unified-release/qa-cleanup.json`. These ignored files can
contain internal release metadata and are summarized here instead of uploaded.
The 6.02 MB offline-precache omission remains unchanged and is not full offline
acceptance. The broader goal stays active.

The first combined source check passed both strict type checks and 844 tests,
but failed UUID uniqueness after the road-quantity test changed Node's shared
WebCrypto object without restoring it. Road-quantity and plumb fixtures now
restore the original property descriptor after each test. This is test isolation,
not a replacement of runtime UUID generation. The initial failed report is
preserved in `.cache/release-verify/unified-release/source-checks.json`.

The repaired combined check passed 853 tests across 140 suites (seven tests in
two suites skipped), both strict type checks and lint on 125 changed TS/TSX
files. Phone-width browser inspection then found a 12-pixel overlap between
the floating navigation and map attribution. The final source reserves one
additional rem plus the device safe-area inset below the mobile map; desktop
height is unchanged. Final pinned checks and deployed browser evidence follow.

## Remaining platform acceptance

Physical controller/rover tests and manufacturer sample audits; proprietary/CSV
import staging with explicit CRS; offline/quota/conflict/reconnect acceptance on
real Android hardware; complete field-to-computation-to-export/print comparisons;
broader engineering/revision approval gates; provider/payment/public-directory
and notice evidence remain separate from this deployment milestone. Continue
using `SURVEY_WORKFLOW_UPGRADE_MATRIX.md` and `FIELDBOOK_MOBILE_READINESS.md`.
