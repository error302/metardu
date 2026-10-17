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

Release outcomes belong below after execution. Until then, this document does
not claim these changes are on the public website.

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
