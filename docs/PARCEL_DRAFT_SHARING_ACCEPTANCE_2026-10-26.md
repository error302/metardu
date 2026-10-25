# Retained parcel draft sharing: source acceptance

This checkpoint supports an explicit client/reviewer handoff of selected retained
boundary drafts. It does not issue a cadastral plan, locate physical monuments,
establish ownership or complete the large-project/production goal.

## Reproduced defects and replacement

The former `/api/public/parcel/[id]` handler queried `projects` without an access
grant. A known project UUID disclosed project/client and surveyor/profile fields.
It supplied missing professional identities, monument descriptions and found/fixed
statuses, assumed Arc 1960 / zone 37S and attempted a different datum conversion
after a conversion failure. Station-array order became a purported boundary.
Project creation time appeared as certification time. The portal requested device
location automatically and announced arrival near a computed vertex.

The red privacy tests reproduced 200 responses for a private synthetic project
without a sharing capability, including unrelated/query-string parameters. The
new endpoint returns an indistinguishable unavailable response for missing,
incorrect, expired, revoked or transferred access. Project UUIDs and session
cookies do not authorize a public lookup. Existing records are not automatically
shared, and existing project-ID links do not become new access grants.

The owner starts from a retained GeoJSON draft in export history. Preview and
creation recover the exact issuer/project/request-bound file, verify its bytes,
manifest and committed export journal, and apply a public field allowlist. The
snapshot contains parcel labels, geographic polygon rings, retained grid areas,
source grid/revision/hash, geographic-file hash and draft assessment. It excludes
client identities, profiles, phone numbers, raw observations, internal parcel /
block IDs and fabricated beacon/approval information. Parcel labels and geometry
are themselves a disclosure and are displayed for explicit review.

## Grant and recovery semantics

- The owner confirms authority to share the displayed draft. Access lasts exactly
  1, 7 or 30 twenty-four-hour days from the retained creation time.
- Product code generates a 32-byte random access key and a separate request UUID.
  It locks and verifies an account/project device record before transmission.
  Storage failure, conflicting intent and invalid records prevent a new send.
- The server persists the key's SHA-256 hash, never the raw key. Request hashes
  include the key hash. The key does not enter SQL parameters, receipts or history.
- A retry completes or recovers the same intent; changing its key, source,
  duration or export request under the same ID is refused. A committed grant keeps
  its original expiry, including after a lost COMMIT acknowledgement.
- The complete link uses `/p/<grant-id>#key=<access-key>`. The recipient sends the
  key in an Authorization header with credentials omitted. Query keys and resource
  substitutions are refused. API and page responses are private/no-store; the
  page declares no-referrer and noindex/nofollow/noarchive.
- Revocation changes only the first revocation timestamp and is idempotent through
  the command. The immutable source/key/expiry cannot be replaced or renewed.
  Subsequent reads close immediately; copies already saved cannot be recalled.
- Ownership transfer and issuer suspension close public reads. History is scoped
  to the issuer and current project ownership, with 24 metadata rows per page.
- The device key remains recoverable until the owner explicitly removes it after
  a settled receipt. Removing a device key does not revoke the server grant.
  An unconfirmed request is retried before the UI permits removing its key;
  cancellation of a never-committed sharing intent is separate follow-up work.

The dedicated SQL capability function deliberately permits possession-based reads
without an account. It has a fixed search path, fully qualified data sources and
no arbitrary SQL or profile projection. Authenticated table policies require
issuer/current ownership and matching retained revision metadata. They do not
independently recompute geographic transformations from the retained file;
the server's checked-file admission establishes that binding. The snapshot hash
is an integrity check, not a professional signature or independent field proof.

## Recipient interface and telemetry

The recipient sees a responsive geographic overview, explicit exterior/interior
rings, 50-row coordinate pages, retained grid area and revision provenance.
Boundary vertices are not described as found or fixed beacons. The view requests
no device location and supplies no arrival feedback, measured height or default
datum. Expired content is withdrawn from the open view when its clock/visibility
check detects expiry. Revocation stops subsequent reads, rather than promising to
erase already viewed content.

The public route has its own shell without workspace navigation/feedback overlays.
The keyboard skip link focuses content without replacing a capability fragment.
The former submission-screen shortcut that copied a project-ID public link is
replaced by navigation to the reviewed sharing register. All added interface
symbols are SVG icons; no emojis were added to the product.

The existing browser replay configuration recorded unmasked text/media, and web
vitals included full URLs. Source configuration now disables session replay in
both initialization paths. Error/transaction/breadcrumb filters omit capability
screens and APIs, strip URL queries/fragments and remove credential headers.
Sensitive views also carry Sentry's blocking attribute as defense in depth; see
the [official replay privacy guidance](https://docs.sentry.io/platforms/javascript/session-replay/privacy/).
These are source changes, not evidence about prior provider collection, deletion
or current deployed telemetry configuration. Provider state was not changed.

## Verification receipts

Evidence lives in `.cache/parcel-draft-sharing/`. The final combined regression
passes **184 tests in 26 suites**. Application and test type checks pass, as does
a focused strict type check of the root browser instrumentation entry, which is
outside the application's normal TypeScript include. Scoped ESLint passes on
28 TS/TSX files, including that entry with an isolated checker configuration.
The static route check passes: **240 pages, 823 static links, zero unmatched**.
The staged security gate passes with existing applied-migration hashes pinned
and API-proxy/PWA guards verified. Its scan includes 735 test and 3,280 source
files; this scan count is not a claim that all those tests were executed.

Final native validation passes **154 cases**: 50 boundary, 29 map, 48 export and
27 sharing cases. The receipt binds **96 source/test/configuration files**; all
current hashes match after the run at `2026-10-25T21:45:36.119Z` (26 October in
Africa/Nairobi). Owned schema/files cleanup, preservation of
public records/profiles, preservation of the migration ledger and source
preservation are all true. Its first
run found an actual PostgreSQL ambiguous parameter type in the duration expression;
explicit integer casts fix that error. The red receipt is retained separately.

Native cases exercise actual routes/commands, PostgreSQL/PostGIS, the grant DDL,
file bytes, lost responses/COMMIT acknowledgement, duplicate/concurrent grants,
changed intent, five altered/suppressed acknowledgements, expiry, revocation,
ownership transfer, suspension, paging, corrupt files and authenticated RLS
positive/negative access. Authentication/plan adapters are bounded fixtures;
this is not ordinary-account HTTP/JWT, provider or production RLS acceptance.

The existing marked loopback rehearsal container is reused. Migration 121 is
applied only inside the exact owned schema; original public records, profiles,
the migration ledger and tested source are fingerprinted. The marked schema and
owned export files are removed. No role, extension, application container or
builder is created. Test grants are confined to the owned schema and disappear
with it. No public-schema migration or customer account is changed.

CUA verified the owned `127.0.0.1:3021` page for an old synthetic project-ID link.
It displays only the unavailable-link state. A saved 638-pixel-wide capture is
`public-unavailable.png`: document and viewport widths both measure 638 pixels,
with no horizontal overflow. DOM metadata confirms no-referrer and
noindex/nofollow/noarchive. One screenshot timeout resolved on retry. This proves
only this unavailable-link screen; signed-in sharing, a valid link, administrator
screens, phone browsers and instrument behavior remain separate browser/field
gates. Browser automation did not write storage or request location permission.
The existing login tab and CAD training drawing were preserved.

## Release boundary and remaining work

Migration 121 is source/fixture-only, alongside the previously unpromoted scheme
migrations. The unavailable-storage path fails explicitly. No application/worker
deployment, production migration, push, production service restart or provider change is
part of this checkpoint. Existing runtime health passes with a fresh backup;
worker artifact alignment, customer-clone compatibility, restored/off-host recovery,
deferred signing-key work and the other release gates remain open.

**Deployed public access remains an unverified privacy gate until this code or an
equivalent confirmed restriction is promoted.** Do not equate a source fix with
customer-data protection. Review the public path and rollback behavior explicitly
before promotion; returning to the old handler must not silently reopen private
project lookup.

This workflow shares retained unverified scheme-boundary drafts only. Other
project outputs require their own checked source/artifact admission. Crew access,
issued plans, representative campaign capacity, physical instruments, receiving
CAD, printing and independent-surveyor/field acceptance remain outstanding.
Legacy traverse intake and the shared cross-workflow evidence chain still need
their documented integrity work. The active production/international goal remains
open.

## Subsequent deployed containment

After this source checkpoint, the legacy handler was confirmed publicly
reachable using only the reserved nil UUID. With the owner's Cloudflare access,
the exact temporary Block rule `0865888cf7b3440cb255daf61fb3a045` was deployed
and independently verified on both METARDU tunnel hostnames. Canonical,
versioned, uppercase and encoded lookup probes now return Cloudflare 403
without a challenge. Normal public pages/health and the existing signed-in
dashboard remain reachable; its recent-activity refresh error is still open.

See [deployed privacy containment](DEPLOYED_PARCEL_PRIVACY_CONTAINMENT_2026-10-26.md)
for the exact scope, receipts and removal/rollback requirements. This closes the
observed anonymous API exposure through those two hostnames while containment
is active. It does not deploy this capability-sharing implementation or migration
121. Valid public sharing remains unavailable until the reviewed release is
promoted and the temporary rule is separately removed and verified.
