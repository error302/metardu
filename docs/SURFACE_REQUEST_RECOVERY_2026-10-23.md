# Surface computation and draft DXF request recovery — 23 October 2026

The active production goal remains open. This checkpoint adds durable request
recovery to the saved-surface/draft-DXF path documented in
`SAVED_SURFACE_AND_RETAINED_DXF_ACCEPTANCE_2026-10-23.md`. It does not establish
production promotion, real paid-server-export acceptance, receiving CAD,
physical-device/field acceptance or professional approval.

## Behavior and invariants

The old surface POST created another revision after every retry; export POST
could likewise append another file/document after a lost response. A successful
database COMMIT followed by a connection error could also cause export error
cleanup to delete a file that had actually been registered.

New mutation requests require a UUID request identity and the expected account.
Surface requests additionally require selected original point IDs, the reviewed
project-reference hash and a hash of the reviewed finite XYZ measurements,
point names/codes and original horizontal/height references. A selected point's
changed measurement cannot enter an unreceived request under an old review.
Unknown heights remain unknown. Request payloads use the shared strict wire
contract and canonical JSON/SHA-256 convention; sorted point identities have set
semantics. No raw observation is edited to make a request pass.

The server serializes the project/source snapshot or owner/project/export
request before appending. It retains the request owner, identity and payload
hash inside the immutable surface snapshot or document manifest, in the same
transaction as the result. An identical retry returns the original revision or
exact retained file; changed intent under the same scoped identity returns 409.
Historical replay happens before re-reading today's source. It never silently
recomputes a missing/corrupt retained export. A retained owner download does not
generate another paid artifact and can recover an existing document after the
account's paid access expires; new generation still uses the central plan check.

Read-only recovery is available through the surface request lookup and DXF GET
with the original request/account/project/revision identifiers. Ownership and
request binding are rechecked. An absent result returns 404 and does not create
work. New account context cannot submit a previous account's prepared command.

Export error cleanup now checks durable file/register state after a transaction
error. A committed or uncertain artifact is retained for recovery. Only an exact
new owned file confirmed absent from both registers may be cleaned up. Native
tests explicitly simulate successful COMMIT followed by a lost acknowledgement,
in addition to pre-commit faults. File metadata acknowledgements check the
returned owner, project, path, size and content hash.

The page retains a minimal pending command before network mutation, scoped to
the authenticated account and project. It uses a Web Lock around device-record
changes so another tab cannot replace a different unresolved intent. Reloads
offer **Check saved result** (read-only) and **Retry original request** (same
wire identity). Missing locks, storage quota/readback failures or corrupt records
fail closed before a new mutation. Matching verified acknowledgements clear only
that exact device record; late replies cannot remove newer work. A matching
definitive server rejection can resolve its command; unknown responses remain
pending. Received DXF bytes are checked against the returned registered hash.
The UI distinguishes a requested browser download from a confirmed disk save.

The browser test exposed a recovered result missing from an already-loaded
revision selector. A failing component regression reproduced it; recovery now
adds the exact verified revision to that selector. The template remains shared
between preview and server DXF. No private page storage was written through
browser automation internals, and the user's CAD training drawing was untouched.

## Evidence

| Boundary | Result |
| --- | --- |
| Focused source | 70 passing tests across six suites: source admission, revision binding, device command preservation, workspace recovery, storage integrity and existing persistence contracts. Both strict TypeScript projects, scoped lint and whitespace checks pass. |
| Native SQL/storage | `node scripts/verify-surface-revisions.mjs green`: 44 passing cases, including concurrent same-request retries, changed intent/source, failed-transaction retry, uniqueness enforcement, foreign actor refusal, exact recovery, corrupt-file refusal and successful COMMIT/lost acknowledgement. |
| Real HTTP/session | `node scripts/verify-surface-http.mjs`: 14 passing checks through normal login on the existing loopback source preview. Missing identity, stale review and conflicting payload refuse; an identical persisted request replays the same revision; read-only recovery does not generate exports; the ordinary free account remains denied new DXF generation. |
| Real browser interruption | Two Chrome/CUA runs submitted reviewed synthetic computations while a bounded, owned-project-only row lock held the server request. Reload preserved each visible pending command. Releasing the lock and using **Check saved result** restored its committed result without another revision for that request. Both lock-helper processes exited with explicit release receipts. |
| Independent DXF | `scripts/verify-retained-surface-dxf.py --recovery` using the existing Python 3.12/isolated `ezdxf`: original five measured XYZ points and three open elevated contours match the independent plane/endpoints; zero parser repairs/errors. This artifact is from the native source route with an adapted plan decision. |

The real HTTP synthetic request is retained in
`.cache/surface-request-recovery/http-request.json` and is reused on subsequent
verification, rather than substituting a surface name for application replay.
The marked database/service guards are unchanged from the preceding checkpoint.
The native verifier's uniquely marked schema and owned local storage were
removed, with the public applied migration ledger unchanged. One final run hit
a transient connection timeout; its failed receipt and successful cleanup were
preserved before a fresh complete 44-case passing run. The bounded connection
deadline is now 15 seconds; SQL assertions and statement limits were retained.

Browser commands `cdb486cf-54e1-4733-872f-107f745f52de` and
`bed78cdd-2fb8-49ab-bee6-161cd473369d` intentionally produced R1 and R2 of one
explicitly synthetic surface. Read-only database corroboration finds exactly
one revision for each distinct command. R1 is
`4c5e5e6a-1393-4133-aacb-aee643c246c3`; R2 is
`812605fe-a54d-420f-bbee-10ff8f64f2d6`. The five original point rows/references,
ordinary user role and restored free entitlement remain intact. The final
browser view selects R2, clears the confirmed pending record and visibly refuses
new paid DXF generation without leaving its definitively rejected command stuck.

Receipts, native artifact and screenshots are collected under
`test-results/surface-request-recovery/`. The receipt index records completed
checks and source/file hashes; it is not a release attestation. The positive
native export plan decision is adapted; no Pro fixture was recreated and no
payment/provider operation was called.

## Migration and remaining gates

`116_surface_request_recovery.sql` adds two partial unique indexes over new
request metadata in immutable surface/document revisions. Legacy rows without
request identities are untouched. It has been exercised against real PostgreSQL
only inside the owned temporary fixture schema, including legacy records and
deliberate duplicate insertions. It has not been applied to the public synthetic
or production migration ledger. The HTTP/browser proofs therefore establish
application serialization/recovery; the native fixture separately establishes
the index constraints. Review actual production preconditions, compatibility,
backup/recovery and rollout/rollback before the coordinated API/client promotion.
The stricter mutation contract must ship with its client.

This checkpoint covers lost responses, reloads, concurrency and transaction
acknowledgement faults. It does not prove full browser-storage corruption
reconciliation, hardware power-loss recovery, provider-object staging/orphan
reconciliation, real mobile/offline/multi-tab device acceptance, receiving-CAD,
paper output or field controls. Exact artifacts with uncertain commit state are
preserved; a managed staging/reconciliation process remains an operational gate.
Terrain boundary/hole masks, reviewed breakline evidence, real paid server export,
the broader engineering families, provider/payment lifecycle, offsite restore,
the owner-deferred signing-key rotation and production promotion remain in the
main goal. International adoption still requires a separately accepted workflow.

Fresh required read-only `npm run docker:verify` passed with host access: one
application, worker, data, collaboration and NTRIP health passed; the backup
service was running without a configured healthcheck. Backup completion
remained `2026-10-23T10:25:43Z`, archive/header evidence only. No service lifecycle,
new application container/builder, cleanup/prune or production migration occurred.
