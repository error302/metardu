# Recoverable reviewed boundary requests

26 October 2026, Africa/Nairobi. This source checkpoint extends the retained
traverse and paged boundary workflow with durable boundary-save recovery. It is
not a production promotion or field acceptance.

## Surveyor behavior

Before sending a reviewed boundary save, the browser retains the normalized
command, original chosen coordinates, source identity and fingerprints under
the signed-in account, project and parcel. It retains only the selected source
points, up to 500 vertices, with a 1 MiB device-record budget. The server still
reloads and retains the complete bounded source when saving; the device record
does not replace original observations or server evidence.

After an interrupted response or reload, the reviewer can recover the final
outcome, retry the original request, request cancellation or download the exact
device record. These actions remain available without a successful current
source read. Retry uses the original request ID, reviewed order and frozen
coordinates. It does not substitute the current source or silently start a new
revision. A damaged record is preserved and blocks a new save. Storage or browser
locking failure prevents the initial POST. Account changes remount the editor
and leave the original account's record in its own key.

Recovery and cancellation check the account, project, parcel, request and input
fingerprint. A committed outcome must also match the original traverse, source
fingerprint, CRS, ordered vertices, exact polygon, measurements and parcel
revision. Only that acknowledgement clears the matching device record under a
browser lock. Failed reads, missing outcomes, HTTP refusals and mismatched
responses leave it retained. An acknowledgement cannot clear a replacement
request. This is local browser retention, not a guarantee against device loss,
browser-data deletion or unavailable storage.

## Server and database contract

New save commands require `expected_user_id`. It must match the authenticated
account before writing. GET `mode=request` requires `request_id` and the intended
account and returns a final `committed` or `cancelled` envelope. Existing receipt
lookup without that mode still returns the retained draft receipt. Mixed and
duplicate query scopes refuse. POST `?action=cancel` accepts only the original
account, parcel, request and input fingerprint; its stream is bounded at 16 KiB.
The ordinary save-command stream remains bounded at 64 KiB.

Migration **123** adds `parcel_boundary_requests`. Save and cancellation take the
same project/parcel locks. A committed journal mirrors the exact retained draft
receipt in the geometry transaction. A cancelled journal is final and prevents a
late save. Cancelling an already committed request returns its original receipt;
it does not delete the geometry. Deferred foreign keys and graph triggers reject
a draft without a committed matching journal, a committed journal without its
matching draft, and a draft attached to a cancelled request. Faulted journal
acknowledgements roll back geometry, audit, draft and journal together.

Final journals reject updates and independent deletion while their project
exists. RLS restricts reads/inserts to the issuer and current project owner. A
transfer closes the former owner's recovery access and retains issuer history.
Whole-project lifecycle deletion remains possible; deleting a former issuer
cannot erase a transferred project's evidence.

Historical receipt JSON is copied exactly after identity preflight. The migration
does not invent or insert an actor field into old receipts. Old receipts remain
readable; newly acknowledged commands require their actor field. Missing recovery
storage disables new saving and returns an unavailable error for recovery and
cancellation, rather than an empty successful result.

## Verification record

The initial UI regression reproduced loss of pending intent after reopening,
clearing without durable cancellation and sending without device retention.
The native regression reproduced missing final journal/graph enforcement before
the implementation. Final checks on the source checkpoint:

- **184 tests / 16 suites pass**, including boundary device recovery, account
  changes, source outages, malformed records, cancellation/acknowledgement
  failure, storage quota/locking refusal and replacement-record preservation.
  Adjacent retained intake, maps, numerical integrity, register, export, sharing
  and actual authenticated raw-stream middleware are included.
- **172 native workflow checks pass**, including 17 boundary-request cases:
  exact journal mirroring, recovery/replay, changed intent, durable cancellation,
  concurrent save/cancel, missing storage, fault rollback, immutability, RLS,
  deferred graph constraints, ownership transfer, exact historical backfill,
  rejected malformed historical identity and corrupted-journal refusal.
- **40 retained-traverse native checks pass** with the new boundary journal
  contract. The continuous workflow retains 2,000 observations / 2,001 coordinates,
  saves explicit boundary corners and recovers registered delivery artifacts.
- Independent Python inspection of the actual synthetic DXF/GeoJSON and retained
  sources passes, including DXF audit without errors/repairs and independent
  coordinate/geometry comparisons. This does not prove receiving CAD/BIM use.
- Application/test TypeScript, ESLint on ten changed TS/TSX paths with zero
  warnings/errors, and the security gate pass. The security gate pins 119 applied
  migrations and statically scans 738 test files / 3,291 source files; it does not
  execute every scanned test. `git diff --check` passes.

Source hashes, exact verification counts, report hashes and protected-file
comparisons are recorded in
`.cache/reviewed-boundary/boundary-recovery-checks.json`. Native reports are
`.cache/parcel-draft-sharing/native.json` and
`.cache/traverse-retention/native.json`; the former's actual artifacts and
`journey-proof.json` / `journey-independent.json` retain the continuous-job and
independent comparison evidence. Each native runner removed only its owned
fixture/files and checked existing public records, migration ledger and source
preservation. Its bounded authentication adapter is distinct from ordinary
account/browser/production evidence.

Next.js lint regenerated `next-env.d.ts`; its exact pre-existing bytes were
restored by the recorded baseline SHA256 before final preservation checks. All
six excluded pre-existing files remain unchanged and outside this commit.

## Release boundaries

Migration 123 is new source and has been rehearsed only in an exactly owned
disposable schema of the existing marked loopback database. No customer/public
schema, applied migration hash, subscription or production service was changed.

This is a coordinated application/schema change. An older application does not
append final boundary journals, so its boundary writes will fail after migration
123. Before promotion, admit a real customer-clone rehearsal through the existing
recovery gate, review locks and backfill data, verify the actual migration runner,
and prove a compatible application/worker and database/uploads restore path.
Gate boundary writes during the transition. A rollback image must either support
the final journal contract or keep boundary writes unavailable pending a reviewed
forward correction. The migration deliberately refuses a destructive downgrade.
Do not treat the synthetic historical-row rehearsal as customer-clone acceptance.

The broader goal stays active. Ward-scale capacity, crew permissions and offline
conflict handling, real instrument input/control checks, independently checked
survey computations, receiving CAD and printer fidelity, ordinary authenticated
browser/phone/admin checks, provider/payment checks, signing-key deferral,
customer restore admission, worker artifact alignment and production promotion
remain separate gates. Keep the Cloudflare parcel containment rule until the
permanent replacement and rollback behavior are verified live.
