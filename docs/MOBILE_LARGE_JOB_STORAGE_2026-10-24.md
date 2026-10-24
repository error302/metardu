# Mobile queue batches and honest device status

Source continuation of the active production-readiness goal. This checkpoint
improves the existing mobile collection path; it does not certify the complete
offline workflow or promote a production image.

## Reproduced problems

The delivery loop already capped uploads at twenty records, but manual retry
loaded and reset every failed record first. Two concurrent retries selected the
same stale failed set. Each reset used a separate transaction, so aborting the
second write left the first record re-armed after an unsuccessful operation.

Statistics read all observations, photo data and queued payloads into arrays.
The collector then separately read every project observation, selected ten by
storage key order and reversed them. UUID order did not establish recency.
Parallel first reads also opened three field-database connections and retained
only the last handle. An unreadable device source could appear empty, queue
counts initially appeared as zero, and initialization read failures escaped
without a visible recovery action. Missing capture time displayed the Unix epoch.

Six storage regressions failed against the preceding source. A subsequent
connection regression reproduced three opens instead of one. Two additional
component regressions reproduced the unavailable-source/unknown-count problem.
The recent-view and missing-time component checks also failed before repair.
Structured red receipts remain in the evidence bundle.

## Resulting behavior

- Manual retry uses one read/write cursor transaction over failed records and
  re-arms at most twenty eligible records for the signed-in capture owner or
  existing recovery reviewer. An aborted batch rolls back all its resets.
  Competing transactions select separate batches. Raw payloads, identities,
  original attribution, recovery review and server retry deadlines remain intact.
  A manual retry does not acknowledge delivery or field verification.
- Statistics reduce photos and queue records one cursor item at a time. Raw
  observations are read in committed batches of fifty; asynchronous legacy
  receipt verification runs outside those transactions. No full photo/queue
  array or job-wide observation serialization is required by this stats path.
- The collector explicitly requests ten recent owner-visible observations,
  ordered by their retained capture timestamps, with deterministic ID ties.
  Its working selection stays bounded. Missing/nonfinite timestamps rank after
  known times and remain unchanged. Missing or invalid display times say
  `Capture time unknown`.
- Unknown counts stay `Unknown`. Read failures are visible and provide a
  `Reload device readings` action. A later result from an older read cannot
  replace a newer reload result. Empty-job copy requires a successful read.
- First reads share one initialization promise. The existing field database
  remains version 1 with its five original stores and indexes. No SQL migration,
  device-data copy, new dependency, owner backfill or existing raw-row rewrite
  is introduced. The explicit unlimited observation-read API remains available;
  the recent view does not truncate that API.

Both manual Sync entry points explain the twenty-record retry scope. Automatic
delivery and a newly captured reading do not clear held records. Existing
content-bound acknowledgements and source checks still govern actual delivery.

The scans remain proportional to stored record count. A cursor can pass many
foreign, held or delayed rows before finding eligible records. This change
bounds retained application batches and reset writes; it does not establish a
worst-case device latency, heap ceiling, quota guarantee or instantaneous
cross-store snapshot. `storageUsed` preserves the existing serialized-payload
estimate. It is not physical disk usage or browser quota accounting.

## Verification

The combined source run passes **123 tests in fifteen suites**, including
fourteen storage cases using the installed `fake-indexeddb` engine. Those cases
exercise actual emulated cursor scheduling, transaction serialization and abort
rollback, rather than manually firing transaction callbacks. They include:

- one manual retry of forty-five held owner records, with foreign/unattributed
  retention and exact raw-value/deadline comparisons;
- two competing retries producing two distinct batches of twenty;
- aborting the second update and finding all three original records unchanged;
- 154 observation records, 96 photo payloads and 1,000 queue records, with
  owner counts, verified legacy visibility, no bulk `getAll` in stats, and only
  read-only stats transactions;
- corrupted legacy-receipt exclusion, bounded recent selection across multiple
  read pages, signed-out refusal and full explicit-read preservation;
- one shared connection, direct old-client version-1 reopening with the exact
  five-store inventory, and aborted reads of each stats store rejecting partial
  counts while retaining all original rows.

The other suites cover mobile forms/status, ownership, photos, recovery,
acknowledgements, retry policy, the browser API client and raw-observation server
capture. Both strict TypeScript projects and changed-file ESLint pass. The first
lint run identified cleanup references; the final implementation captures its
request-generation object explicitly, with no rule disabled. Tracked whitespace
checks also pass with the checkout's normal line-ending notices.

Receipts and source hashes: `test-results/mobile-large-job/receipt.json`.
`scripts/record-mobile-large-job-evidence.mjs` validates the structured results
before recording this checkpoint. These are source tests and **emulated**
IndexedDB evidence. They are not native Chrome, production SQL, controller,
physical field or provider proof. The fixture databases are fresh in-memory
factories in the test process; no customer/device database is opened by them.

The required read-only `npm run docker:verify` passed at the start of this turn:
one application and the required production services, HTTP/database/Redis
health, and backup completion `2026-10-24T02:00:04Z`. That backup observation is
archive/header evidence, not a successful restore. No production lifecycle,
migration, signing-key or entitlement change was performed by this work.

## Remaining acceptance

CUA navigation of Chrome 3 to the owned loopback mobile collector timed out.
The created tab was inspected and remained `about:blank`. No device records or
browser storage were written through automation internals, and the CAD training
drawing was not operated on. Browser/mobile layout and real-storage acceptance
remain open.

The separate full `FieldBookMobile` listing still uses the explicit unlimited
observation/photo APIs. Its pagination, photo-count reduction and loading/error
handling need follow-through; this increment does not certify that listing for
large jobs. Nor does it establish per-record failed-item review, private offline
cold opening, real multi-tab/rollback reopening, quota interruption, large photo
delivery on a physical controller or a receiving surveyor's acceptance.

Preserve the broader field-sync, restore/provider, payment, owner-deferred
signing-key rotation, pinned promotion/rollback and field gates. International
adoption still requires a separately accepted workflow and jurisdiction. The
full goal remains active.
