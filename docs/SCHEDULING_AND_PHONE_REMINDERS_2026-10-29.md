# Project scheduling and phone reminders — 29 October 2026

## Release boundary

The implementation in this checkpoint has not yet been promoted. Production was verified healthy on revision 1e6ecb613d1335a0d2bc4edbc57f1b474c2f348d with 128 applied migrations and no pending migrations before this change. The original nine workflow migrations are already applied; all historical hashes remain unchanged.

This change introduces one new additive migration, 124_project_schedules_and_phone_reminders. Its native 128-to-129 preservation proof, source checks, exact GitHub checks, image identity and promotion receipts must pass before release. Source, synthetic delivery and physical phone evidence are different.

## User workflow

- Website and work navigation share one persistent, labelled mode control. The website uses public presentation even for signed-in users; switching back opens the dashboard without signing out.
- Schedule job is an in-page form rather than a nested scrolling overlay. It searches readable projects, records a start instant and the device's IANA time zone, and retains meeting-point and crew/equipment notes.
- Project overview links can preselect the project in the form.
- Saved jobs offer Open project and, with current write access, Start field collection. The latter updates the job only after server confirmation and opens that project in the instrument collector. Known survey-type aliases are normalized; unknown profiles require an explicit workflow choice.
- Editing uses optimistic versions. Retried creates have immutable request identities. Cancelled/completed jobs remain as history; cancellation or rescheduling invalidates old pending reminders.
- The field picker and road-plan fetch use authenticated typed endpoints rather than the retired generic browser database proxy. Existing road-plan CRS binding and offline-cache rejection checks remain in force.
- Scheduling and field entry suppress competing global floating controls. Shared spacing, minimum touch sizes, labelled fields and geometric icons follow the existing interface.

## Durable delivery and privacy

Four RLS-protected tables store jobs, device subscriptions, reminder outbox entries and per-device delivery receipts. The startup instrumentation hook is in src/instrumentation.ts, where this src/app Next application loads it. The old root hook was absent from the deployed server artifact.

The server runner claims due entries with leases and SKIP LOCKED, rechecks current job/version/project access, creates one in-app notification, and sends to registered devices. Accepted-device receipts prevent routine retry duplication; expired subscriptions are deactivated. Retries are bounded and delayed. Provider acceptance is not proof of display on a phone, and a process crash between provider acceptance and receipt persistence can cause a retry.

A subscription requires a direct user permission gesture. iPhone/iPad users first install and open the Home Screen web app. The service worker must advertise the new reminder capability before the device can be enabled; an old active worker prompts a safe app update, without replacing unsaved working tabs.

Encrypted push payloads carry only an opaque outbox identifier. The service worker fetches project details with the current authenticated session. Missing sessions, revoked access or obsolete jobs yield a generic notification. Notification clicks open the precise scheduled job, focusing only an exact existing URL or opening a separate window. Sign-out disconnects this device where possible; session authorization remains the content boundary.

VAPID keys belong only in ignored deployment configuration. Initial setup is an explicitly validated exception to the release environment-preservation guard; unrelated auth/OAuth/billing settings must match. Existing configured push keys cannot silently rotate. Private key values, endpoint tokens and device keys must never enter logs or tracked evidence.

## Required acceptance checks

Native synthetic checks must verify historical row/hash preservation, normal runtime-role provisioning, IDOR rejection, read-versus-write project permissions, retained notes, idempotent creates, stale-version rejection, concurrent claims, provider retries/expiry, cancellation, rescheduling and removed membership. An incompatible pre-existing job_schedule table must stop the migration atomically.

After promotion, verify the exact app image/revision, complete 129-entry registry, unchanged supporting services and mounts, instrumentation startup, runner heartbeat, manifest/icon/service-worker parity, authenticated scheduling/field project routes, mode navigation and real admin read pages. Preserve the current rollback image and strict forward registry.

The user has offered both Android and iPhone for physical acceptance. On each device:

1. Install METARDU and launch it from the Home Screen.
2. Sign in, open Survey schedule, and explicitly enable phone reminders.
3. Schedule a survey against an owned test project; verify the confirmation contains that project and the recorded time.
4. Close the app and verify a due reminder arrives. Tap it, open the matching project, and begin the correct collection workflow.
5. Reschedule/cancel a test job, and verify obsolete reminders stop. Disable notifications and verify the device status.

These checks do not establish instrument accuracy, receiving-CAD compatibility, professional approval, or the broader field-to-finish readiness gates.
