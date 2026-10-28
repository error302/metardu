# GitHub source checkpoint and remaining acceptance

The pending equipment repair is collected on the existing
`codex/metardu-workflow-readiness-2026-10-12` branch. Prior source work is pushed
through `44396a812f0c176f493dfecda87b285b6aab2a2e`. See
`EQUIPMENT_CALIBRATION_REPAIR_2026-10-28.md` for new behavior and evidence.
A pushed branch and clean Git status do not establish production deployment.

Release follow-up: `WORKFLOW_UPGRADE_ADMISSION_2026-10-28.md` records 11 native
checks for the normal 119-to-128 upgrade and four legacy-state rejection cases,
with 64 release/recovery contract tests. The build gate binds this new proof to
the exact planned source registry. Original-data fingerprints now include the
cadastral/fieldbook tables and are shared by promotion and rehearsal. Production
still runs `08fae427`; no migration or deployment occurred. At `2ceadbae`, full
Jest, typing, security, native database, worker and web/mobile checks now pass;
whole lint, accessibility and all four browser shards still fail. Its results
do not establish CI acceptance for these later release-tool changes.

Map follow-up: `CADASTRAL_MAP_INTEGRITY_2026-10-28.md` records repair of bent-cut
geometry, discarded split faces, drawing CRS defaults, stale-parent delivery and
ignored secondary snapping sources. It passes 237 affected/core/wiring tests and
scoped source admission. The preceding 41a8d248 CI has completed: web/mobile,
TypeScript, security, native design/set-out and API typing pass; lint, browser and
accessibility fail and full Jest coverage is cancelled. The new map checkpoint
needs its own CI and remains source work, not a production or field acceptance.

Follow-up source admission: `CADASTRAL_INPUT_AND_RETIRED_JOBS_2026-10-28.md`
supersedes the proposed community-job persistence repair below. The blueprint
already retires that area and no current UI calls the job endpoint, so it now
returns an explicit 410 while retaining stored data. The API inventory is now
zero untyped queries across 328 routes. Cadastral input coercion is also repaired;
63 focused tests, strict typing and four-file lint pass. The calibration revision's
new CI reports 439 lint errors and 47 warnings, while web/mobile builds pass;
browser/accessibility and broader admission still require work. Review the
follow-up's own pushed revision and CI before promotion.

## Site and runtime observations

On 28 October `npm run docker:verify` passed for the existing application, worker,
database, Redis, collaboration and NTRIP services. Backup was running and its job
completed at 2026-10-28T02:00:04Z. Archive/header evidence is not restore proof.

Anonymous GET checks at 2026-10-28T11:45:41Z against `https://metardu.space`
returned 200 for home, login and public health. Dashboard, equipment and admin
returned 307 to login with intended destinations preserved; equipment API
returned 401. Health reported healthy database, Redis and disk, but release
identity was `unknown`. Home did not contain the checked direct
`href="/dashboard"` link. These checks do not establish authenticated behavior,
client rendering or visual correctness.

Computer use stopped because its helper could not reliably identify the current
browser URL. No fresh visual acceptance is claimed. Source preview, production
services and the CAD drawing were preserved.

## Completed CI before this commit

GitHub run 40571153536 at `44396a81` passed Jest coverage, TypeScript, security
audit, API row typing, Python worker and native design/set-out database checks.
Full lint completed without memory exhaustion and correctly failed on 504
errors, 47 warnings and two remaining untyped API queries. Accessibility scanned
96 routes with violations on eight pages. All four browser shards failed.
These remain blockers; baselines and admission rules are unchanged.

## Ordered next work

| Priority | Area | Required action |
| --- | --- | --- |
| P0 | CI admission | Review each checkpoint's exact checks. Repair remaining full lint and `.mjs` typed-lint coverage, accessibility and browser failures. Cadastral coercion and the obsolete community job endpoint have their recorded source repairs. |
| P1 | Navigation/browser | Diagnose all browser shards. Last desktop shard had 45 passes and three failures, including old navigation and homepage metadata expectations. Verify meaningful current behavior before changing expectations. |
| P1 | Accessibility | Repair/rescan CORS networks, drone flight plan, fee quotation, geofence, legal description, pipe network, pin cushion and stakeout report. |
| P1 | Workspace/admin | Use existing authorized accounts to verify landing/dashboard, projects, fieldbook, map, drawing and actual admin screens, including loading/errors, phone/tablet widths, keyboard and overlays. Preserve CAD and closed QA accounts. |
| P1 | Equipment | Verify primary page in browser; repair secondary read failures/history races, legacy storage ownership and helpful interval validation. Independently verify real instrument/certificate evidence. |
| P0 | Promotion/recovery | The synthetic 115–123 upgrade matrix passes; rerun it for the selected release. Resolve worker artifact drift, current-production rollback identity and actual restore evidence before one pinned promotion. Preserve the rejected-clone boundary and applied migration hashes. Expose the exact live release identity. |
| P0 | Security | Owner-deferred signing-key rotation stays open; preserve Cloudflare legacy parcel containment. |
| P1 | Professional/provider | Complete instrument/control imports, independent calculations, receiving-CAD, calibrated print and actual purchase/webhook/entitlement lifecycle acceptance. |
| P1 | Large/offline | Exercise ward-scale teams/blocks/permissions, interrupted capture, reconnect/multi-tab/device recovery, quota and acknowledged delivery using retained original evidence. |

The production-readiness goal remains active. Source, synthetic, provider,
production and physical-field evidence remain separate gates.
