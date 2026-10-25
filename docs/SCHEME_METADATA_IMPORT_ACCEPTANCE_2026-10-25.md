# Scheme parcel-metadata intake

This checkpoint addresses the owner's large-project/Mwavumbo direction. It is
source and isolated synthetic-database evidence, not production, cadastral field
acceptance or a measured whole-programme capacity claim.

## Resulting behavior

The previous importer converted UUIDs with `parseInt`, admitted a block without
matching the supplied project, split quoted CSV by commas, silently stopped at
500 creations and overwrote existing metadata. The replacement:

- Reviews the entire UTF-8 CSV locally before a distinct confirmation. Shows ten
  preview rows, the complete row count, source hash and destination block. The
  upload uses the reviewed byte snapshot. The template is explicitly synthetic.
- Accepts at most 10,000 records and 4 MiB per atomic intake. Streamed multipart
  requests are bounded even without a Content-Length header. Excess input is
  refused; it is never silently truncated. This is a bounded synchronous path,
  not background processing or the million-observation benchmark.
- Validates UUIDs, checks and locks the actual owning project and destination
  block in the write transaction, preserves UUID strings, and handles quoted
  commas, quotes, line breaks and a UTF-8 BOM. Ambiguous/duplicate columns,
  duplicate parcel numbers, malformed records and unsupported columns are refused.
- Requires explicit hectare columns for supplied areas. Blank means unknown;
  zero, negative, nondecimal and unrepresentable precision are rejected rather
  than turned into null or silently rounded by PostgreSQL NUMERIC(12,6).
- Retains identical existing records without updating timestamps or status.
  Conflicting metadata refuses the complete file. New rows start pending and
  contain supplied register metadata, never inferred boundary geometry or approval.
- Writes in 500-record SQL chunks inside one transaction and checks every
  returned identity, project/block, metadata field and pending status. Missing
  or altered acknowledgements roll back parcels and the receipt together.
- Appends the actor/request/project/block identity, original file bytes/name and
  SHA-256, protocol/input hash, parcel identities and complete count receipt in
  that same transaction. Receipt mutation is denied; current-owner RLS scopes
  reads and appends. A unique block/parcel index protects other write paths too.
- Retries under the same actor/request with identical intent recover the original
  historical receipt. Later parcel edits remain untouched. Changed request intent
  is refused. The UI validates the returned count, identity, source hash and
  evidence status before acknowledging success and ignores stale project replies.

The request reference is visible before confirmation and retained for an in-page
retry. Recovery after reload/on another device requires the saved reference and
the same original file/name. Automatic durable client pending-request/history
recovery is still future work; the screen does not claim it.

## Evidence

`node scripts/verify-scheme-import.mjs red` reproduced 23 failures in 28 native
cases against the previous handler; the other five cases passed. The green suite
was extended to 34 native cases. It covers the actual source handler, real
PostgreSQL transactions, a complete 501- and 10,000-parcel intake, over-limit
refusal, retained bytes, exact retries/concurrency, duplicate preservation,
suppressed/altered acknowledgements, unavailable receipt storage, immutable
receipts and authenticated current-owner receipt visibility. Authentication is
a bounded adapter; this is not ordinary-account browser/HTTP acceptance or full
production RLS acceptance.

The verifier checks the existing rehearsal service ID, purpose, loopback port and
database marker. Only its uniquely marked schema is created and removed. Public
projects, blocks, parcels, users and observation-batch fingerprints, the migration
ledger and source hashes are checked unchanged. Migration 117's public identifiers
are redirected only into that schema for the fixture DDL. No public migration
ledger is changed. Receipts are in `.cache/scheme-import/red.json` and `green.json`.

Nine UI tests failed before replacing the automatic upload component. The focused
green regression run passes 34 tests in seven suites, including preview/explicit
confirmation, lost-response identity, mismatched receipts and navigation races,
bounded/interrupted streams, the shared CSV parser, geometry batch preparation,
scheme API ownership and scheme DTOs. App/test type checks and scoped lint are
separate checks. The existing quick-start page was also rendered in real Chrome;
this does not establish real-browser import or privileged administrator acceptance.

## Release compatibility and remaining gates

`117_scheme_import_receipts.sql` is new and unapplied outside the verifier's owned
schema. It adds receipt storage and a unique index; no applied migration changed.
Legacy duplicate block/parcel numbers deliberately cause index creation to fail.
Use this read-only preflight before a reviewed migration/release:

```sql
SELECT block_id, parcel_number, COUNT(*)
FROM public.parcels
WHERE block_id IS NOT NULL
GROUP BY block_id, parcel_number
HAVING COUNT(*) > 1;
```

Review each conflict with the responsible owner; never delete or renumber legacy
records automatically. Existing creation/design paths may now encounter an honest
uniqueness refusal instead of creating duplicate register identities. Their full
concurrency/UX acceptance remains open. Keep pending 115/116 compatibility, backup
restore, the verified production rollback artifact and coherent app/worker release
in the promotion review. Roll back application code rather than discard receipts.

Without receipt storage the new route returns unavailable and rolls back before
any parcel insert. The existing source-preview database was not migrated, so a
successful import is not claimed there. Production was not built, migrated,
restarted or promoted. Fresh read-only runtime verification passed on 25 October;
it does not close the recorded worker source/artifact drift or restore gate.

Remaining large-project work includes aggregate/paged scheme reads, actual parent
parcel evidence, crew/member isolation and assignments, durable client recovery,
background processing, design/topology/field-check revisions, exact deliverables,
quantitative concurrent load, physical instruments, receiving CAD and professional
field/submission acceptance. The public parcel endpoint's privacy/CRS/authority
defects remain a separate release blocker recorded in the large-project plan.
