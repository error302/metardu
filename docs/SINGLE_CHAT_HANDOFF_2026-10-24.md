# METARDU: single-chat continuation handoff

Prepared 24 October 2026, Africa/Nairobi. Repository inspected around 17:43–17:50
EAT. This is the master index for consolidating work; it is not a release
certificate. The other chats were still active when inspected. Their files and
HEAD can change after this snapshot.

## Copy this into the one continuing chat

> Continue METARDU in `C:\Users\user\Desktop\METARDU` as the single coordinating
> chat. Read `AGENTS.md`, `docs/SINGLE_CHAT_HANDOFF_2026-10-24.md`,
> `docs/PRODUCTION_GOAL.md`, `docs/PRODUCTION_READINESS_EXECUTION.md`,
> `docs/CREDIBILITY_ACCEPTANCE.md` and the linked records for the current task.
> The goal is a trustworthy, production-ready field-to-finish engineering
> platform worth paying for. Preserve the full goal, existing source changes,
> customer data, production services, applied migrations and localhost CAD
> training drawing. First confirm the old editing chats have stopped and
> reconcile their unfinished work against current Git status. Keep one ordered
> task list and an evidence ledger. Finish and verify the existing work before
> starting another overlapping implementation. Source fixes and scoped commits
> are authorized; do not push, broadly stage, discard work, create another
> worktree/application container, or deploy an unreviewed mixed checkout.
> Runtime verification starts with `npm run docker:verify`. Keep source,
> synthetic database, browser, provider, production, receiving-CAD, printer,
> professional and field evidence distinct. Retain the owner's signing-key
> rotation deferral. Do useful authorized work autonomously; do not ask again
> for designs already approved. Do not call the platform complete after one
> workflow, passing test suite, healthy container or deployment.

## Consolidation comes first

Three active engineering chats were confirmed in the same checkout:

| Chat | ID | Latest inspected responsibility |
| --- | --- | --- |
| Make METARDU production-ready — this chat | `01a15a79-fa1f-7403-9eea-59ca502e40d8` | Road/curve integrity, submission checks; preparing this index. |
| Plan METARDU’s global readiness | `01a165b5-7f3e-74f2-8335-e70c5dd35dcf` | Topographic pilot/terrain work; now investigating mobile large-job storage and manual retry. |
| Complete the METARDU work requested in this conversation… | `01a14d38-a575-7671-9917-6498d3d9e2f8` | Map/project/export/account operations; retained civil-surface export was being finalized. Its latest visible message also says it is preparing a handoff. |

An additional promotional-post chat, `01a16d1b-fc3e-71f3-9d86-08e6f15bb3fc`, was
idle. Its external publishing permissions and results are separate from source
work; this handoff does not authorize new posts or messages.

The owner should stop/pause the other editing chats before the chosen chat
continues. This handoff does not stop, archive or cancel them. A useful message
to each old chat is: “Preserve all work, record your unfinished files, exact
running command handles, tests and blockers, then stop editing this project.
I am consolidating into one chat.” Let a running command report its actual
terminal state; do not kill production or assume an observation timeout ended it.

One chat should own Git staging/commits, shared files, schema work, fixture
credentials, service lifecycle and release decisions. Parallel reasoning can be
useful later with explicit ownership; independent writers sharing this checkout
are the immediate source of confusion.

## Workspace and preservation

- Root: `C:\Users\user\Desktop\METARDU`.
- Inspected branch: `codex/metardu-workflow-readiness-2026-10-12`.
- Inspected HEAD before writing this handoff: `fbad2385`.
- The index was empty. The working tree contains substantial intentional work
  from the other chats. Dirty/untracked does not mean disposable.
- A path inventory is saved alongside this file under
  `docs/handoffs/2026-10-24-worktree-snapshot.txt`. It is an inventory, not a
  backup, ownership guarantee or lock. Re-read current Git status and diffs.
- Use exact file allowlists, inspect the shared index before/after staging and
  preserve concurrent hunks in shared documents. Do not commit all dirty files
  as one undifferentiated change. No push was performed by this chat.

Read `AGENTS.md` and `DOCKER_RUNTIME_WORKFLOW.md` before any runtime action.
Production uses the existing `metardu-app` stack, normally loopback port 3000.
PostgreSQL, Redis, worker, collaboration, NTRIP and backup are required services.
The existing source preview uses `http://127.0.0.1:3021` and a separate synthetic
database. Do not create another worktree, preview app container, dated image or
Buildx builder. Do not blanket-prune, remove unrelated volumes, compact Docker’s
Windows disk, or stop Docker/WSL while production runs.

Fresh `npm run docker:verify` passed in this chat on 24 October: one application,
required service inventory and HTTP/database/Redis health. Its reported backup
completion was `2026-10-24T02:00:04Z`. That is archive/header evidence, not a
successful customer/uploads/offsite restore or deployment of current source.

Browser access has varied. This chat’s recent submission-page navigation and
15-second source-health observation timed out while the preview listener/process
remained live. The other chat subsequently reported reaching the civil-export
Pro-plan gate. Recheck the actual current state; do not infer that the preview
is stopped or restart it blindly. Preserve the original CAD drawing and browser
storage. Use CUA on the owned 127.0.0.1 origin; no storage injection, forged
sessions or account privilege changes for QA.

## Original requests and current disposition

“Source checkpoint” below means useful implementation/evidence exists; it does
not mean the corresponding production, provider or field acceptance is complete.

| Requested work | Disposition and continuation record |
| --- | --- |
| Make METARDU worth paying for | Still the overarching goal. `PRODUCTION_GOAL.md` defines acceptance and P0/P1/P2 work. `SURVEY_WORKFLOW_UPGRADE_MATRIX.md` preserves all engineering families. |
| Efficient mobile field collection and explain Fieldbook | Collector captures original observations and their delivery state; Fieldbook manages structured survey books, setup, revisions and calculation/review. Keep the project/reference/ownership chain joined rather than creating competing observation authorities. See `CAPTURE_TO_FIELDBOOK.md`, `FIELD_SYNC_AND_RECOVERY_WORK.md`, `MOBILE_FIELD_ENTRY.md`, `FIELDBOOK_DELIVERY.md`. |
| Check Fieldbook/recovery and approved archive restoration | Source, native SQL and ordinary synthetic HTTP/browser recovery checkpoints exist, including retained original bytes and request replay. See `LEGACY_DEVICE_RECOVERY.md`, `FIELDBOOK_NATIVE_ACCEPTANCE.md`, `FIELDBOOK_BROWSER_RECOVERY_2026-10-22.md`. Real offline/quota/multi-tab/device/reconnect and promoted-release acceptance remain distinct. |
| Fix business dashboard schema error and use mobile-style map tools on desktop | Committed `8bf60e88`. Dashboard bigint count typing and overlapping header controls repaired; shared bottom tool dock used across widths. `ADMIN_AND_MAP_REVIEW_2026-10-23.md` records checks. Ordinary-user admin denial is proven; successful privileged administrator browser rendering is still separate. |
| Preserve map drawings and make project flows dependable | Recent committed work includes `6bb7c733`, `2f97d5bf`, `c95349b7`, `419b7e34`. Versioned drawings/conflict recovery, project creation quotas, reference/settings preservation have records in `MAP_DRAWING_WORKFLOW_INTEGRITY_2026-10-24.md`, `PROJECT_CREATION_INTEGRITY_2026-10-24.md`, `PROJECT_SETTINGS_INTEGRITY_2026-10-23.md`. Audit remaining project-specific map/import/export paths. |
| Determine used Docker images and discard redundant ones | Exact historical consolidation is documented in `DOCKER_CONSOLIDATION_2026-10-10.md` and `test-results/docker-consolidation`. Current runtime check confirms one application. Do not reuse historical removal IDs as a new deletion allowlist. Inspect current container/image IDs, tags, ownership, mounts and protected current/rollback images before further cleanup. Multiple tags can reference one image. |
| Analyze Fallow and use it on METARDU | Pinned Fallow 3.34.1 is integrated; smoke verification completed. `FALLOW_CODEBASE_REVIEW_2026-10-22.md` and `DEPENDENCY_DIRECTION_REPAIR_2026-10-23.md` record dependency repairs and clean cycle-focused results. Broad hygiene candidates remain review work; do not automatically delete analyzer findings or suppress them to manufacture a green gate. |
| Explicit online source/target CRS design and written specification | Both approvals were granted; implemented in `1168d089`. `ONLINE_TRANSFORM_REPAIR_2026-10-23.md` records shared authority, explicit references, heights preserved, stale-response protection and per-row outcomes, plus ordinary authenticated synthetic HTTP proof. Operation accuracy, regional control, grid/height transformations and field applicability remain separate. |
| Source-only backup/restore failure-path repair | Approved and committed `d4aa7cb1`; further synthetic native restore/rollback evidence exists. `RECOVERY_FAILURE_PATH_AUDIT_2026-10-22.md`. Running backup artifacts, customer/uploads restoration, offsite copy/key recovery and measured recovery objectives remain release gates. Do not bypass the rejected customer clone or modify applied migration hashes. |
| Source-only honest 3D import repair | Approved; `101b0be6` and `0254722c` plus native allocation guards are recorded in `THREE_D_IMPORT_INTEGRITY_AUDIT_2026-10-22.md`. No invented floors/confidence; invalid geometry and external resources are refused. Representative customer models, hostile-resource isolation and survey acceptance remain open. |
| Approved Fieldbook migration-115 rehearsal | Rollback probe and subsequent normal synthetic upgrade/preservation checks are recorded in `FIELDBOOK_NATIVE_ACCEPTANCE.md`. These do not authorize a customer migration or prove production is upgraded. Reconcile actual source, fixture and production ledgers before release. |
| Approved exact synthetic-account cleanup | Completed and independently checked in `ORDINARY_API_ACCEPTANCE_2026-10-23.md`. Account `22360396-8518-4424-b61b-1d08f5c146a8` was suspended, sessions invalidated and `.cache/fieldbook-delivery/browser-qa.json` removed. Do not reactivate it or reconstruct credentials. |
| Topographic field-to-finish pilot | A current release candidate workflow, not the whole product’s definition of done. `PRODUCTION_READINESS_EXECUTION.md` and `TOPOGRAPHIC_PILOT_AND_GSI_INTEGRITY_2026-10-23.md` connect control, observations, reviewed terrain, contours/drawing and deliverables. Much current work remains uncommitted. |
| Saved surfaces, boundaries/exclusions and measured breaklines | Current work/evidence in `SURFACE_REQUEST_RECOVERY_2026-10-23.md`, `SAVED_SURFACE_AND_RETAINED_DXF_ACCEPTANCE_2026-10-23.md`, `TERRAIN_DOMAIN_AND_BREAKLINE_ACCEPTANCE_2026-10-24.md`. Migration 116 is fixture-proven, not confirmed production-applied. Keep actual observed mesh/provenance, exclusions and ordered original observation IDs; do not infer ground or legal boundaries from imagery. |
| LandXML/CAD completeness and retained civil surfaces | `c750fe93` fixes shared/map LandXML geometry, unknown heights and a DXF double transform; see `LANDXML_AND_MAP_HANDOFF_INTEGRITY_2026-10-24.md`. The other chat’s retained-mesh server export is still WIP at this snapshot; see the next section. Receiving CAD validation remains required. |
| Road/curve calculators and export integrity | Numerous committed geometry/adapters and independent numerical/artifact checks exist; current road gate `a4b0893b`, declared banking adapters `52e93911`. See the road/curve records below. Saved project/criteria/revision binding and several legacy scalar helpers remain open. |
| Submission page actually honors validation | `fbad2385` repairs pending reruns, old-project/unmounted responses, current-project verdicts and bypassing archive controls. `SUBMISSION_GATE_FRESHNESS_2026-10-24.md`: 98 focused tests, app/test TypeScript, scoped lint and security gate passed at that checkpoint. Browser, server admission and revision binding remain separate. |
| Pricing, PayPal, entitlements, custom verification/login, admin and email | Source and selected live read-only checks exist; account/storage/subscription edits remain dirty. Provider plan discovery is not a completed purchase/webhook/replay/cancellation lifecycle. Resend domain listing previously returned `restricted_api_key`; fresh inbox/delivery acceptance requires appropriate provider access. Use `CREDIBILITY_ACCEPTANCE.md` and provider records. |
| International adoption: Kenya plus AU/UAE/UK/ZA | Advisory work is in `PRODUCTION_AND_INTERNATIONAL_READINESS_RECOMMENDATIONS.md`. Use a shared core and explicit reviewed jurisdiction packs. A country menu/registered CRS does not prove transformation accuracy, axes, local rules or cadastral acceptance. Accept one named foreign workflow after the Kenyan pilot without dropping the broader roadmap. |
| Dependable public site and operations | Approved existing tunnel supervision/recovery was configured; `TUNNEL_NETWORK_RECOVERY_2026-10-24.md` records a real network interruption/reconnection, not a forced-crash/reboot test. Public release ID was unknown. External monitoring, recovery, support and moving workstation-hosted production to suitable operations remain work. |
| ChatGPT linking and truthful public claims | Keep notice, deployment, eligibility and actual human-consent gates. The previously recorded eligibility date is historical evidence; requery rather than enabling linking from an old date. No blanket integration/certification claims. Marketing drafts are not evidence of paid customer acceptance or permission to publish. |

## Unfinished work already in motion

### Mobile large-job storage — global-readiness chat

Latest observed regression: manual retry re-armed the entire failed queue, an
abort on the second reset left the first record changed, and summary statistics
loaded all stored photographs/observations. The chat was making retries bounded
and atomic and summaries memory-bounded. The new
`src/lib/mobile/__tests__/largeJobStorage.test.ts` existed and its initial red run
failed. Inspect current `offlineStorage.ts`, `syncService.ts`, mobile field page,
tests and that chat’s final handoff before continuing. Do not discard the test
or claim this repair complete from this snapshot.

### Retained civil-surface server handoff — delivery chat

Current WIP includes `src/lib/export/retainedCivilSurface.ts`, changes to
`civilHandoff.ts`/`landXmlDocument.ts`, the civil-export page,
`src/components/export/CivilSurfaceDownload.tsx`,
`src/app/api/project/[id]/civil-surface-export/route.ts`, related tests and
`scripts/verify-civil-surface.mjs`.

The detailed delivery-chat record is
[CIVIL_MAP_AND_OPERATIONS_HANDOFF_2026-10-24.md](CIVIL_MAP_AND_OPERATIONS_HANDOFF_2026-10-24.md).
It includes the original request register, owned file allowlist,
provider/operations decisions and next commands. The subsequent source checkpoint
is [RETAINED_CIVIL_SURFACE_HANDOFF_2026-10-24.md](RETAINED_CIVIL_SURFACE_HANDOFF_2026-10-24.md):
67 focused tests, final component/type/lint/security checks, seven native checks
and two XSD-valid XML files. It also repairs false empty inventory and stale
project response/download states. Its exclusion
fixture retains eight faces covering 84 m² around a 16 m² hole. Receipts are
under `.cache/civil-surface/`. Browser QA reached the Pro-plan gate; paid ordinary
server/browser download and receiving-CAD import remain unproven. It was still
editing/finalizing and preparing a handoff; inspect current source/report hashes
and any subsequent commit before treating it as accepted.

### Server submission admission — this chat’s next task, not implemented

Only source investigation occurred before the owner requested consolidation.
There are no new server-admission implementation files from this investigation.

Concrete findings to reproduce and repair:

1. `src/lib/submission/assembleDocument.ts`, deed-plan case: it checks the gate
   only inside `if (loadedInput)`, so null loader output skips validation. Its
   audit metadata also hardcodes gate version `1.1.0` instead of the result.
2. `src/lib/generators/fullPackage.ts` can package existing ready documents
   without fresh configured checks. The package route verifies ownership but
   does not itself perform those checks before calling the generator.
3. `src/app/api/submission/generate/route.ts` writes `generating` before document
   validation and writes `error` after refusal. Preserve previous ready artifacts
   and statuses when adding pre-admission validation; do not erase their history.
4. `src/app/api/submission/assemble/route.ts` delegates to its own QA flow. Trace
   consistent project admission before allocating submission references or
   producing/storing an archive. Its server client captures authenticated DB
   context: lack of an explicit route ownership call alone is not proof of an
   exploitable authorization bypass. Test actual ownership/RLS behavior.
5. `statutoryGate.ts` currently converts thrown rule errors into warnings.
   `statutoryGateLoader.ts` catches some optional read failures and omits fields.
   Separate legitimate “not applicable” from unavailable required evidence so
   internal failure cannot masquerade as an export-ready result.
6. The older binary assembler also uses numeric-zero/raw-coordinate fallbacks.
   Audit retained observation/adjustment provenance before claiming a statutory
   package is a verified result. Preserve legitimate raw inspection exports.

Proposed next implementation was shared server admission before deed-plan or
archive side effects, with explicit missing/unavailable/blocked results, focused
fault regressions and retained prior artifacts. No design/code for it should be
assumed to exist. Client controls are usability, not server security or a proof
that artifacts match the current saved revision.

## Remaining engineering and release gates

Keep these in one ordered task list; completed source checkpoints are not reasons
to remove external or end-to-end requirements.

1. **Stabilize the checkout.** Quiesce old writers, collect lane handoffs, review
   all dirty/untracked dependencies, run the appropriate focused checks and
   commit coherent verified work with exact ownership. Reconcile account,
   subscription/storage, topographic drawing, deliverable register and config
   edits rather than folding them into an unrelated export commit.
2. **Finish the field-to-deliverable chain.** Preserve original files and
   observations, declared projected/vertical control, reviewed ground/features,
   calculation and design versions, measured QA, approvals and supersession.
   Verify import → compute → save/reopen → export → independent receiving tool.
3. **Close active mobile and server export gaps.** Complete the WIP and findings
   above, including exact replay, account changes, multi-tab interruption,
   quota/storage failure, offline reopening and reconnect. A simulated callback
   or a browser reload is not an actual device crash/offline incident.
4. **Complete road/corridor acceptance.** Save and load adopted criteria and
   exact design revisions into export checks. Repair `stoppingSightDistance`,
   `passingSightDistance`, `minimumRadius` and `wideningOnCurve` in legacy
   `engineering/compute.ts`: assumed reaction/friction/grade/default banking,
   PSD = 3 × SSD and radius-bin widening remain. The repaired banking path must
   retain explicit ratios and entered over-limit values. Complete evaluated
   transitions, crossfall/axis/spiral binding, measured sections/quantities,
   drainage set-out and construction/as-built workflows; independent engineering
   and field review remain required.
5. **Verify outputs honestly.** Continue actual PDF/CSV/DXF/LandXML parsing,
   numerical references, complete entities/rows/holes/units and unknown heights,
   paper layout and receiving-CAD checks. Source curve/plan checks do not prove
   professional approval, legal boundaries, a printer or instrument setup.
6. **Review schema and restored recovery.** Preserve all applied hashes and
   the rejected customer-clone gate. Reconcile Fieldbook 115 and additive surface
   116 against actual fixture/production ledgers. Rehearse approved compatible
   upgrades, validated DB/uploads recovery pair, offsite/key retrieval, failure
   rollback and measurable recovery objectives before promotion.
7. **Reconcile worker/runtime artifacts.** `docker:verify:worker` is separate
   from general health. Worker source/candidate repairs exist in
   `WORKER_ACCEPTANCE_2026-10-21.md` and
   `WORKER_RELEASE_HARDENING_2026-10-23.md`; prior deployed/source drift remained
   open. Recheck exact current hashes, task declarations, dependencies and native
   RTKLIB evidence. Healthy old worker service does not prove new capabilities.
8. **Close security and ordinary-account acceptance.** The exposed signing-key
   rotation is an owner-deferred P0 blocker. Preserve the deferral and never
   silently rotate or use the exposed key for rollback. Continue owner/staff/admin
   isolation, verification/login, account recovery and abuse checks without
   forging auth or granting QA privileges.
9. **Close payment/provider/operational acceptance.** Test approved purchase,
   provider approval, webhook verification/replay, entitlements, cancellation,
   support/refund/invoicing and real email delivery. Verify support mailbox and
   legal/response-time commitments rather than advertising assumptions. Keep
   external availability alerts, tunnel reboot/crash and prolonged outage checks
   separate from a healthy origin or running Windows service.
10. **Prepare one reviewed release.** Use one pinned combined source revision,
    reusable candidate and verified current-production rollback. Review changed
    artifacts, migrations, restores, secrets, preservation fingerprints and
    ordinary-account workflows before promotion of the existing stack. Earlier
    source-only approvals do not authorize real customer restoration or an
    unreviewed production migration. Verify the actual promoted release identity;
    an `unknown` public ID is not proof the latest source is deployed.
11. **Establish real acceptance and commercial value.** Run the defined Kenyan
    pilot with practising surveyors, independent control and representative
    instruments/devices, receiving CAD and physical print. Record limitations,
    support ownership and paid-pilot feedback. Then validate a separately named
    foreign workflow/jurisdiction; preserve road/cadastral and broader goals.

## Useful evidence and commands

The master acceptance sources are `PRODUCTION_GOAL.md`,
`PRODUCTION_READINESS_EXECUTION.md`, `CREDIBILITY_ACCEPTANCE.md` and
`SURVEY_WORKFLOW_UPGRADE_MATRIX.md`. Detailed records include:

- `ROAD_EXPORT_GATE_INTEGRITY_2026-10-23.md`,
  `LEGACY_BANKING_ADAPTER_INTEGRITY_2026-10-24.md`,
  `SUBMISSION_GATE_FRESHNESS_2026-10-24.md`.
- `HORIZONTAL_ADAPTER_INTEGRITY_2026-10-23.md`,
  `VERTICAL_SCALAR_INTEGRITY_2026-10-23.md`,
  `CIRCULAR_CURVE_PLAN_INTEGRITY_2026-10-23.md`,
  `ROAD_QUICK_COMPUTE_INTEGRITY_2026-10-23.md`,
  `LEVELING_CLOSURE_EVIDENCE_2026-10-23.md`, `ROAD_QUANTITY_RECORDING.md`.
- Fieldbook/mobile, recovery, transform, 3D, Fallow, admin/map, worker,
  terrain/CAD and provider records linked in the task table above.

From the existing checkout, after reconciling writers:

```powershell
git -c core.fsmonitor=false status --short
git -c core.fsmonitor=false diff --cached --name-only
git -c core.fsmonitor=false log -12 --oneline
npm run docker:verify
```

After appropriate source changes, run focused Jest tests and scoped ESLint, then
`npm run typecheck`, `npm run verify:engine` and `npm run security:gate` as
appropriate. Use `npm run docker:verify:worker` for worker artifact review.
`quality:architecture` and `quality:codebase` are analyzer review tools with
existing inherited findings, not blanket deletion instructions. Inspect scripts
before running native fixture/recovery/export probes; several require exact
synthetic identities and preservation guards. Do not run historical credential,
restore, promotion or cleanup helpers indiscriminately.

Earlier passing counts are tied to their recorded source/reports. A combined
release check must be rerun on the coherent final tree. No current local tests
prove all customer, provider, production or field behavior.

## Completion standard

The goal remains open until the promised supported workflows reliably preserve
field evidence through reviewed calculations and revision-bound deliverables,
the actual production release is safely recoverable and verified, paid/support
operations work, and independent professional/device/field acceptance supports
the product’s claims. Keep explicit blockers instead of redefining completion
around the latest successful source milestone.
