# Dashboard activity and sign-in review — 29 October 2026

## Production baseline reconciled

Read-only verification against the restricted production runtime and migration ledger found 128 applied migrations, zero pending/mutated/ghost entries, and every original 119 checksum unchanged. The earlier nine-pending update preceded the completed 1e6ecb613d1335a0d2bc4edbc57f1b474c2f348d promotion. No SQL is added or altered by this change.

The production activity SELECT succeeds using a non-superuser, non-BYPASSRLS login. The activity table contains zero entries despite 16 stored projects. Project creation and most other workflow actions did not populate that table; an empty feed was therefore a missing event-source integration rather than a failed migration.

## Resulting behavior

- The landing hero offers account creation and the interactive sample. The existing navbar remains the dashboard entry.
- Activity combines the caller's personal entries, actual project creation records, and existing project-scoped audit events. Creation timestamps come from stored projects; no historical actions, actors or computations are invented.
- Shared project records/audit events are visible only through current canonical personal or selected-organization read grants and projects RLS. Removed/deactivated membership immediately hides historical activity. Account events belonging to teammates, audit payloads and metadata are excluded.
- Entries identify the project and actor where recorded. A project creation record uses “Project owner” when the creator's display name is unavailable. Not every instrument action or computation is audited; this is a recent-work feed, not a complete collaboration audit or proof of field execution.
- Pagination rejects malformed/negative/unbounded inputs, uses a stable timestamp/ID order and returns hasMore. The client retains successful results if polling fails. Timeline connectors are positioned within each entry.

## Checks completed before source checkpoint

- Focused Jest: 11 suites / 52 tests passed, covering feed error retention, collaborator rendering, activity filter bounds, configured/absent Google provider behavior, preserved sign-in destination, admin metrics contracts and admin operations.
- Real PostgreSQL: scripts/verify-dashboard-activity.mjs passed 15 checks in the pre-existing marked metardu_runtime_verify fixture on 127.0.0.1:55433. Shared viewer visibility, selected active organization access, inactive/unknown/removed grants, unrelated users, private personal events, payload exclusion and pagination were exercised. All owned rows were rolled back; the migration ledger was unchanged.
- Live CUA: the existing Google button returned successfully to /dashboard using the existing account session, then /admin loaded its real owner metrics. Overview, customers, billing, communications, feedback, system, /admin/users, /admin/payments and /audit-logs rendered without observed alerts. No customer/account/billing/admin write was performed.
- Production /api/auth/providers exposes Google with metardu.space callback host. Runtime credentials are present and match local deployment configuration; no secret was logged or copied. The isolated 127.0.0.1:3021 source preview deliberately disables Google. It is not the production OAuth destination.

The live CUA review above covers the deployed baseline. New source activity/landing behavior still requires the pinned checks, candidate build and actual promotion receipts for its own revision. Exact source, CI and deployed identity must remain distinct. Read-only route/UI success does not establish that every administrative write, external provider or professional/field workflow works perfectly.

## Retained gates

Keep the existing Cloudflare legacy parcel containment until authorized capability and unauthenticated acceptance are both proven. Retain receiving-CAD, printer, field/instrument, offsite/key recovery and owner-deferred signing-key review gates. The existing Workbox large-chunk precache limitation remains; it is not hidden by increasing the cache limit.
