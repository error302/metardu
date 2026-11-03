# Availability incident and always-on hosting handoff - 3 November 2026

## Status and scope

The application remains deployed at b172cbc7595670e0057a4c9eb7ff4374945871d9, image sha256:9f8ef7052704d00dc8b459d78ca7c5da8a9be86ab88eef419ef7840b95fa10ea. These diagnostic changes do not replace that image or certify continuous availability. See RELEASE_ACCEPTANCE_2026-11-02.md for the 129-migration release baseline and retained professional acceptance gates.

The user confirmed that the old Oracle VM was removed because it could not accommodate METARDU. It is not an available rollback/deployment target. No customer data was transferred, account upgraded, resource provisioned, DNS or power setting changed, connector stopped, service restarted, or application rebuilt during this investigation.

## Verified observations

- Windows Power-Troubleshooter event 1 reports sleep at 07:33:34.233Z and wake at 10:15:19.057Z: 10:33 a.m. to 1:15 p.m. Nairobi. Further idle standby events include 10:22:59Z, 10:29:54Z and 10:31:44Z. This is direct host evidence, not an inference from a missed monitor.
- Initial power observation was battery with a 180-second idle sleep timeout; AC sleep was already Never. The user plugged in power. Subsequent observations report mains and active idle sleep zero. This mitigates idle sleep while on AC; it does not guarantee power, network, lid, reboot or update continuity.
- The first Docker inventory observation timed out. The authoritative npm run docker:verify retry passed required application/support services and migration parity. An observation timeout is not proof Docker stopped.
- Two owned cloudflared processes were present: a Windows service and a manual connector. Bounded logs contained DNS resolver timeouts, TLS handshake failures, forced edge disconnects and successful reconnections. Both local ready endpoints later returned 200, with three and four ready connections respectively. Local connector readiness does not prove public page delivery; neither process was stopped.
- Windows Wi-Fi DNS uses the router at 192.168.0.1. Node reported a different default resolver. Explicit alternative resolver probes did not establish a reliable replacement. No DNS override is justified by those results.
- Origin/public health, public pages and timings must be assessed independently. At 10:37Z health endpoints passed exact b172 while public home/login exceeded the earlier ten-second deadline. A direct origin page sample also took roughly ten seconds, then a warmed origin home sample took 47ms; the corresponding public page completed in 9841ms. Neither persistent application slowness nor a single exclusive network cause is established.
- The later 15-second-budget receipt at .cache/public-availability/availability-2026-11-03T10-48-56-775Z.json retained origin health 200/exact b172 in 149ms and a public-health connection timeout after 10644ms. Public home/login were then 200 (2378/1504ms), with all three protected redirects correct. Mains/idle sleep zero passed. The overall observation correctly FAILED; intermittent failures remain unresolved.

All public network observations here are from this host. Independent external monitoring is still required to separate host egress problems from failures experienced by other customers.

## Read-only diagnostic

Run from the checkout with Node 22:

    node scripts/verify-public-availability.mjs b172cbc7595670e0057a4c9eb7ff4374945871d9

It checks origin/public health against the full expected application revision and five anonymous public routes; protected routes must redirect to the same site's login with the correct next path. It records header/total timings, a 15-second request budget, and origin page comparisons when a public entry page fails. The underlying HTTP client can enforce an earlier connection timeout, recorded separately. On Windows it observes the active power source/idle sleep setting, failing closed on unknown observations. Only bounded metadata is retained; no page/customer body, token or credential is written. Evidence paths are confined to the checkout, including checks of existing redirected ancestors before directory creation. It never changes power, DNS, services, database or browser state.

The contract's six focused tests cover healthy observations without uptime claims, battery sleep, unknown power, public failures hidden by origin health, revision mismatch, missing routes and foreign redirects. CI is configured to run this package-free contract suite alongside existing release/recovery tests. The combined local command passed 72 tests with zero failures; focused ESLint and git diff --check passed. Remote CI for this diagnostic commit remains separate. This diagnostic does not replace independent monitoring, restore proof, physical phone tests or field acceptance.

## Oracle free-tier research and decision

The existing local OCI profile identifies Johannesburg (af-johannesburg-1); that historical configuration does not confirm current account access, quota, billing status or regional capacity. No OCI CLI was found, but the installed Python OCI SDK successfully authenticated using the existing local profile. A read-only SSH attempt to the retired endpoint timed out; it was not retried after the user's clarification.

Oracle's current Always Free documentation lists A1 ARM at 1500 OCPU-hours and 9000 GB-hours/month, equivalent to 2 OCPUs/12GB for an Always Free tenancy, and 200GB combined boot/block storage. It describes temporary host-capacity shortages in the home region and possible idle-instance reclamation. Its general price list separately states 3000 OCPU-hours/18000 GB-hours for A1. These published allowances differ; do not promise the older 4-OCPU/24GB configuration is free for this account. Confirm tenancy-specific allowances and a zero-cost estimate in the Console before provisioning. Do not upgrade billing merely to test availability.

Sources checked 3 November 2026:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/price-list/
- https://developers.cloudflare.com/tunnel/troubleshooting/

The authenticated quota query returned 2 available/0 used A1 cores and 12GB available/0 used A1 memory. A capacity-report request for VM.Standard.A1.Flex with 2 OCPUs/12GB in AF-JOHANNESBURG-1-AD-1 returned HTTP 200 with OUT_OF_HOST_CAPACITY. This is a capacity report, not an instance-create request: quota exists but physical space is unavailable at this observation. The account billing type and zero-cost launch estimate still require explicit verification. Receipt: .cache/public-availability/oracle-a1-capacity-2026-11-03.json. No polling loop, paid upgrade, reservation or provisioning was performed.

A1 has more memory than the 1GB Micro shape, but suitability remains unproved. A single idle Docker sample measured app 503MiB, Postgres 62MiB, Redis 22MiB, worker 75MiB, collaboration 44MiB, NTRIP 24MiB and backup 3MiB. This excludes build/export peaks, host/daemon overhead, cache growth and concurrent survey workloads; it is not a minimum sizing benchmark. Existing production app image is linux/amd64. A1 is ARM: verify every native dependency and support image, especially the pinned PostGIS image, before considering it. docker manifest inspect --verbose postgis/postgis:15-3.3-alpine advertised only linux/amd64 at this check. This is a concrete ARM migration blocker. Never substitute an unverified database image to make the stack boot.

## Proposed execution order and acceptance

1. Read the actual tenancy type, home-region A1 limit/usage, remaining boot/block storage and eligible shapes. Preserve existing volumes, accounts and backups. Shape visibility/quota alone is not proof of physical host capacity. Record the Console's Always Free eligibility and full cost estimate before any create action.
2. Select an existing suitably sized host or review a concrete zero-cost candidate with the user. If no eligible capacity is available, retain local hosting as a temporary arrangement and present priced alternatives for review; do not purchase/upgrade automatically. Define the uptime objective, backup retention and recovery time/data-loss targets.
3. Check CPU architecture/image support, native PDF/canvas, PostGIS extensions/version compatibility, storage capacity, outbound tunnel connectivity, service supervision and security updates. Keep builds away from the serving host where practical. ARM is a separate verified artifact; the current amd64 digest cannot be called ARM-ready.
4. Prepare an approved migration/cutover plan with fresh database/uploads backups, verified archive hashes, an authorized target and transfer path, encryption/key recovery, an actual restore rehearsal, original-record fingerprints and all 129 migration hashes. Prior customer-clone rejection remains in force. No SQL migration is currently needed for these diagnostic changes.
5. Schedule one controlled cutover only after target evidence and authorization are concrete. Prevent simultaneous writable database primaries and duplicate reminder/payment/backup jobs. Preserve production/rollback images and uploads. Do not cut DNS before target health, identity and core workflows are verified.
6. Verify exact deployed identity, required supports/mounts, native worker/PDF/PWA parity, login and downloads, external public availability and one new scheduled backup. Exercise agreed rollback without losing post-cutover writes; document who owns each step. Keep old assets until rollback/retention criteria are satisfied.
7. Observe an agreed continuous availability window from an independent monitor, including unattended operation and scheduled jobs. One successful probe does not close the incident. Physical surveyor, receiving-CAD/print, provider, Android/iPhone notifications, offsite/key-recovery, signing rotation and legacy parcel containment gates remain separate.
