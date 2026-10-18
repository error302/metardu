# METARDU continuation acceptance — 18 October 2026

**Latest live status:** revision
`80940bf7537c116621eba76e42e1831cf4def1d6` is deployed and healthy with all 118
ledger entries. Additive migration 113 repairs the older observation-table gap
exposed by the earlier `2e89e143` live test. All 26 private HTTPS checks now pass,
including imports, source download and CAD save. Original hashes/checked values
and supporting services were preserved; exact disposable records independently
count zero. See `OBSERVATION_IMPORT_RELEASE_VERIFICATION.md` for current source,
live, browser/recovery, offline, provider and field boundaries. The dated failed
cutover below is historical, not the current deployed state.

**Continuing goal:** the later typography/map-readability increment is documented
in `TYPOGRAPHY_READINESS.md`. It unifies the shared font stacks and repairs
reproduced COGO clipping/contrast in source. Computer-browser checks remain
separate from physical-phone/field acceptance. The failed cutover below is
historical; the latest live status above supersedes it.

This resumes the interrupted CAD/import increment in the same checkout. It does
not repeat earlier pricing, auth, road preparation, drainage or map milestones,
and does not declare the whole engineering platform accepted.

**Earlier attempt:** source candidate `830df65310524f667026120d7647441aeea509ca`
passed its complete build and source gates, but its production cutover did not
complete successfully. The controller restored the previous healthy
`4fa998fcf597c63a0cebd83685e233865d61b616` release. The new CAD/import/auth repairs
were not live after that attempt. The precise candidate-startup failure remains unresolved; read
the failure and recovery evidence below before another promotion.

## Source work closed in this continuation

- Coordinate imports retain original UTF-8 bytes, SHA-256, explicit CRS/unit and
  height declarations, selections and a transactional point/capture receipt.
  Unknown heights remain NULL; explicit zero is a measurement. Retries do not
  duplicate captures or overwrite existing points.
- The CAD workspace and deliberate mobile navigation paging are preserved from
  the interrupted work. Camera changes do not edit model coordinates. Off-sheet
  geometry is included in SVG exports; print scale is still unverified.
- New reproduced project-CAD failures are repaired: a different-project response
  is rejected; old asynchronous loads cannot replace the selected job; unknown
  or mixed point grids and a saved drawing with a different project CRS block
  drafting. Existing saved coordinates are preserved, never relabeled or
  silently transformed. Authoritative point/reference load failures are visible.
- A project CAD save needs an explicit server acknowledgement. A device-storage
  quota failure no longer prevents a server save; copy tells the operator which
  copy exists. Late saves cannot label another job synced; duplicate save taps
  are coalesced. CAD saving does not replace adjusted survey observations.
- Authentication returns signed-in crews to the requested safe internal route,
  including checkout options. External/recursive destinations are refused.
  Next's own middleware normalizer was independently observed rewriting the QA
  origin to localhost; `skipMiddlewareUrlNormalize` and checked redirect origins
  preserve the owned origin without reflecting arbitrary forwarded hosts.

Source verification: both strict TypeScript projects passed. The related source
run passed **290 tests in 34 suites**. Six new project-CAD regressions and nine
middleware tests passed. The first lint run found only the generated preview
reference and new test-fixture issues; the generated reference was restored and
the fixtures corrected. Final lint/pinned release receipts follow below.

## Browser and real synthetic database evidence

Normal CUA sign-in, file chooser, project/CRS review, NULL/zero-height distinction,
incomplete-row exclusion, explicit datum/notice acknowledgement and save passed
on the owned `127.0.0.1:3021` origin. Repeating the reviewed file returned the
original capture. A normal browser source download matched every original byte.
At phone width there was no page overflow; the saved receipt is in
`.cache/point-import/browser-confirmation.png`.

The project CAD workspace opened **505 points / 0 edges** in the declared grid.
Fit changed only the camera; a normal project save retained all coordinates,
without creating adjusted stations or parcel topology. At 1280 px there was no
page overflow or marketing footer. The viewport was reset and the test tab
closed. The user's localhost training drawing/storage was not accessed.

`verify-point-import.mjs` passed 16 real HTTP/PostgreSQL checks, including private
access, stale reference/hash rejection, concurrent idempotence, multi-chunk
501-point delivery and actual transaction rollback after a capture-write failure.
Its exact new fixtures were removed. Six independent checks of the retained
browser fixture also passed; its exact project and two accounts were removed,
with zero remaining project/point/capture/session/user rows and its stored QA
password invalidated. Browser-created device copies were not erased by storage
internals. These checks use the marked synthetic database, never customer data.

## Live runtime and external providers

Fresh host-access `npm run docker:verify` passed: one production app and all
required supporting services, HTTP/database/Redis health, no duplicate app or
dated verification image/builder. The scheduled backup completed at
`2026-10-18T02:00:04Z`. Archive/header checks are distinct from an actual restore.

Before this increment's release, public HTTPS health reports production revision
`4fa998fcf597c63a0cebd83685e233865d61b616`. Health, payment availability,
ChatGPT notice and the branded PNG email asset return HTTP 200.

Read-only checks using effective production credentials authenticated successfully
to PayPal live and retrieved all **12 configured Pro/Team/Firm USD/EUR/GBP/AUD
plans**. Each is ACTIVE, monthly, matches the source catalog, has zero setup fee
and no configured extra tax, and has an unlimited regular cycle. No order,
subscription, approval, charge or refund was created. Additional-seat recurring
plans and a customer-safe purchase/webhook/cancellation/entitlement exercise
remain separate acceptance work. Other advertised payment providers remain
disabled when credentials are absent.

Resend's effective production key returns `401 restricted_api_key` on domain
reads. This is a permission boundary for its send-only key, not proof of an
invalid sending credential or failed delivery. The saved October 15 authentication
release/inbox receipts cover welcome, verification, password reset and change
messages; no new email was sent. Current domain dashboard status and a fresh
inbox delivery are distinct checks. See `PRODUCTION_AUTH_RELEASE_2026-10-15.md`.

The public ChatGPT notice remains version `chatgpt-sharing-v1`, waiting and
ineligible, with linking unconfigured. Its recorded period ends **10 November
2026, 20:56:45.516 EAT**. No publication was backdated, notice replaced, consent
created or linking enabled. Matching notice evidence, deployment and real human
consent remain mandatory even after the date passes.

## Remaining acceptance, kept separate

**Source/workflow:** complete evaluated asymmetric road transitions/corridor and
superelevation work, issued design/control/revision binding, independently
measured middle-section quantity schedules, cadastral boundary-to-issued-document
acceptance, and bounded terrain/mask/surface-overlay work where required. Continue
the five-family `SURVEY_WORKFLOW_UPGRADE_MATRIX.md`; menus are not proof.

**Live/release:** promote only a pinned source that passes package, schema,
synthetic, rollback-startup and backup/recovery guards; verify the promoted
ordinary-account flows and preserve supporting services/customer fingerprints.
Host free space was 9.74 GiB before planning; retain the existing 8 GiB reserve.
No cleanup, duplicate container, extra builder, customer clone or migration-hash
change is authorized by this report.

**External/field:** actual receivers/controllers, Android durable offline/quota/
conflict/reconnect behavior, independent survey-control/calculation comparisons,
physical printed scale, adopted engineering/regulatory criteria and professional
sign-off, offsite recovery, payment lifecycle and optional connector listing/
notice/consent evidence. Synthetic coordinates and source tests do not establish
any of these.

Provider API references: [PayPal subscriptions](https://developer.paypal.com/api/subscriptions/v1),
[Resend domain API specification](https://github.com/resend/resend-openapi/blob/main/resend.yaml).
Read-only receipts are under `.cache/provider-readiness/` and `.cache/point-import/`;
they are summarized here without publishing private runtime metadata.

## Pinned build, failed cutover and independently checked recovery

The pinned source checks passed app/test types, **290 tests / 34 suites**, and lint
on all 49 changed TS/TSX files. The Linux candidate build passed compilation,
production type validation, all **219 static pages**, standalone packaging and
native dependency checks. The existing 6.02 MB precache omission remains, and is
not full offline acceptance. No dependency installation or extra builder/app
container was introduced for source QA.

The existing synthetic schema rehearsal matched all **117** migration entries,
with no pending or altered hashes. The actual existing production image passed
its strict startup verifier against that schema. The candidate image is retained
as `metardu-metardu-app:candidate`, image
`sha256:dfb499ec916e8a2cab77af90d3c03d7a7ecca1445655ad6475e6636886f77352`.

The guarded cutover took fresh checkpoints
`/backups/db_20261018_050557.sql.gz` and
`/backups/uploads_20261018_050557.tar.gz`, completed at 05:06:02 UTC. Their
integrity and the existing-record fingerprint gate passed. The unchanged ledger
remained at 117. The Compose command did not complete normally (null exit status);
the controller restored the protected prior image. No failure type/code or failed
candidate startup log was saved before that container was replaced. Lifecycle
events show no candidate healthy event; its forced exit during rollback does not
establish an out-of-memory cause. Do not infer a root cause or silently mark this
receipt built/promoted and rerun it.

Current production is healthy revision `4fa998fcf597c63a0cebd83685e233865d61b616`,
image `sha256:af17d7af4559e416e60be3956e89d62238e4d4aefc653782a9f0e4d3fff75dbe`.
A fresh Docker verifier and HTTPS health/pricing/import/notice checks pass.
Independent comparison confirms every original data mount and all six supporting
service IDs/start times/mounts were preserved. The reviewed rollback also adds
its **read-only migration-registry mount**; this is intentional, not a missing
data volume. The current source directory
`.cache/release-verify/unified-release/830df65310524f667026120d7647441aeea509ca/rollback-registry/f49b4385c6989239`
is now a live runtime dependency and must be retained. Original archives,
candidate and older protected images remain; no prune, VHDX operation, customer
clone, applied-hash rewrite or database restore occurred.

The host promotion controller now retains safe command failure code/signal/timeout
metadata and bounded credential-redacted candidate health/startup logs **before**
rollback removes it. Diagnostic failures do not prevent rollback. Four new tests
and ten existing release-boundary tests pass (14/14), and the controller parses
successfully. This is a host-tooling repair for a later reviewed attempt, not an
explanation of this failure or proof the candidate is safe to retry. No further
production restart was attempted. Normal-account acceptance against the new
production candidate could not run because its promoted-release gate was not met.

## Live map print follow-up

The live current-view print downloaded
`C:\Users\user\Downloads\metardu-current-map (3).pdf` without replacing earlier
downloads. Independent native parsing confirms PDF-1.3, one A4 landscape page,
3,206,203 bytes, captured-at/source-credit metadata and the uncertified-scale
notice. Its capture timestamp is `2026-10-18T04:50:51.902Z`.

The browser/tool operation took **208.6 seconds**, despite a requested 30-second
tool timeout. This does not isolate browser preflight, page capture or download
time. PDF-content proof passes; normal foreground responsiveness and physical
scale remain unaccepted. Preserve this finding for a controlled, instrumented
foreground test instead of treating a valid download as latency acceptance.
