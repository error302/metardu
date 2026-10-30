# METARDU release acceptance — 30 October 2026

## Deployed artifact

Production runs application revision 305d2b0139202bca035c42454b3ce59122ad16ba, image sha256:71f91ec1812f9272a117efa4390c89666de727c20f7cf049bcab0e73a7f7844d. Both the local production origin and https://metardu.space/api/public/health returned healthy with that exact release header/body after promotion. A documentation-only follow-up does not change this deployed application identity.

The database has 129 applied migrations. Migration 124_project_schedules_and_phone_reminders is the only new SQL in this release. All prior 128 ledger hashes and aggregate fingerprints of pre-existing recorded values were preserved. Upload mounts and all running required supporting-service IDs/start times/mounts were preserved through this promotion. The completed migration service was refreshed to the same candidate image and completed with an unchanged ledger. The current-production rollback image and strict forward registry are retained.

## Verified evidence

- Exact commit: application, test and tool TypeScript checks; 71 release/security/recovery contract tests; 168 related regression tests; complete lint across 3396 files with zero errors, warnings and accessibility findings.
- [CI](https://github.com/error302/metardu/actions/runs/40813975967): all 17 jobs passed, including full Jest coverage, all browser shards, axe, web/mobile builds, native design/set-out database regression and worker checks. [CodeQL](https://github.com/error302/metardu/actions/runs/40813975895) and [secret scanning](https://github.com/error302/metardu/actions/runs/40813975879) passed.
- Native isolated scheduling upgrade: 17 preservation, authorization, lifecycle, concurrent claim, retry/expiry and rejection checks passed; temporary database/role cleanup passed. Activity authorization: 15 rollback-only checks passed. These do not send to a real phone or use customer clones.
- Built artifact: packaged startup instrumentation, matching notification worker, web-push dependency, PDFKit/font metrics and native PDF canvas verified. Deployed app native PDF drawing/pixels/PNG probe passed. Unchanged worker artifact/task declarations and RTKLIB presence passed without replacing the worker.
- Public home/login/health and protected dashboard/equipment/admin redirects passed. Public/origin asset references matched. Legacy anonymous parcel paths remain denied at origin and Cloudflare.
- Manifest, icons, install guide, root service worker and survey notification worker passed on public and origin endpoints. Served assets match deployed-image bytes exactly; source text comparison permits only LF/CRLF normalization, while PNG comparison remains byte-exact. Private navigation remains NetworkOnly and activation requires deliberate safe reload.
- Authenticated live browser: Home is SVG-only, empty visible text, no tooltip, accessible name Home; Home-to-landing-to-Dashboard retains sign-in. Recent activity loads accessible project events. Scheduling loads eight project choices. At 390px width the document is 380px wide, has no modal or fixed bottom navigation, and both actions are visible. The empty form's submit is correctly disabled. The form was cancelled; no production job was created.
- Existing administrator account: overview, communications, system, customer directory and payment ledger loaded; users/payments finished loading without alerts. No role, plan, billing, announcement or account mutation was submitted. This is read-page evidence, not every administrator action.

## Retained incidents and practical limits

The original release execution receipt failed because its 30-second first-cycle wait ended before the reminder runner's normal next-minute retry. The first startup attempt logged a suppressed failure; the next cycle succeeded. Do not erase that event or claim the initial cause is established. No recurrence was observed during subsequent acceptance, but startup resilience/diagnostics still deserve follow-up. A local continuation also failed after migration parity from a missing npm helper binding; it made no second app promotion. Both failed receipts remain alongside the final verified record.

A raw PWA byte comparison initially rejected CRLF text in the image against LF Git objects; inspection proved identical manifest JSON and exact image-to-HTTP bytes. The corrected comparison retains binary equality and normalizes only text line endings. It is not permission to accept different content.

Public browser QA encountered a Cloudflare 502 followed by 530/1033 while the origin remained healthy, with no app restart/OOM. The connector log had repeated resolver timeouts and a connection interruption. Its ordinary reconnect registered four edges and public health/login/dashboard recovered without restarting services, changing DNS or editing tunnel configuration. The precise underlying network cause is unresolved; reliable public reachability remains a follow-up gate. Cloudflare documents 1033 as an unavailable healthy tunnel connection: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1033/ .

The backup age gate initially failed after service/runtime recreation. A manual fresh database/uploads pair completed on 30 October, retaining all existing archives; promotion took another fresh pair. Archive/header checks are not new restore or offsite recovery proof. The earlier approved restore proof remains distinct. Scheduled backup success after host availability still needs observation.

The documented 6.02 MB Workbox chunk remains outside precache. Installing the app does not make every survey workflow available offline. Single-container production uses the in-process rate limiter; shared rate limiting must be configured before multi-replica/serverless scaling.

## Remaining acceptance

1. Android Chrome and iPhone/iPad Safari: actual Home Screen installation/launch, Google sign-in, explicit notification permission, confirmation and due reminder with the app closed, project/time text, correct-job tap, collection entry, cancellation/rescheduling and disabled-device behavior. Browser resizing, sender mocks and provider acceptance are not physical delivery proof.
2. Instrument/control import, independent-surveyor calculations, receiving-CAD output, calibrated print and physical field-to-finish acceptance. Preserve CRS, raw-observation and professional-review boundaries.
3. Real payment/provider purchase, webhook, reconciliation and entitlement lifecycle; offsite/key recovery; owner-deferred signing-key rotation. Retain existing Cloudflare parcel containment.
4. Ward-scale collaborative/offline/reconnect/device recovery and acknowledged-delivery acceptance; availability hardening for the host/tunnel/backup scheduler and initial reminder startup failure diagnostics.

The wider production-readiness/international-adoption goal remains active. This release does not establish every survey workflow or field accuracy.

Local detailed receipts: .cache/release-verify/unified-release/305d2b0139202bca035c42454b3ce59122ad16ba/ . The consolidated release-verified.json is passed; original failed attempts are retained. Do not commit private deployment configuration, customer records, tokens or device endpoints.
