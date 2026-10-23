# Corridor version preservation

Source and native synthetic checkpoint: 23 October 2026, Africa/Nairobi.

## Reproduced failures and repair

`POST /api/corridor-networks` used separate queries for the prior version,
deactivation, new header and individual points. Real PostgreSQL verification
first found that the unquoted `offset` column made point inserts fail with SQL
syntax error 42601. The API's mocked database checks could not reveal that.
After quoting the existing column correctly, seven of eight preservation checks
still failed: partial writes, another user's replacement, silent point/header/
update suppression, simultaneous first versions and ambiguous historical heads.

The complete version transition now uses `db.transaction`, which also installs
the request's RLS context in the existing database adapter. A transaction-level
advisory lock serializes the exact network-name stream, including its first
version, and the latest rows are locked. Only the recorded owner may supersede
the named network; unknown/different ownership is refused. This matches the
existing schema's shared-read/owner-update intent. Ambiguous duplicate head
versions require review rather than an arbitrary parent choice.

Deactivation is additionally guarded by the recorded owner. Deactivation,
header and each point insert must return the expected row. Any failure or
silent suppression rejects the transaction, keeping the prior complete version
and all its points intact. Existing historical data is not rewritten. Network
names remain exact, case-sensitive stream identities; no legacy-name migration
or reclassification is performed.

## Native acceptance

Run `node scripts/verify-corridor-networks.mjs green` with host access. The
verifier checks the exact existing synthetic service ID, purpose label,
loopback port and database ownership comment before creating a uniquely marked
schema. It executes the actual route schema and handler against PostgreSQL,
substituting only the DB adapter and outer API wrapper. Authentication/status
mapping has separate real-wrapper Jest checks; this native run is not an RLS
role, browser or production request test.

The initial eight native checks passed on the corrected source:

1. A late point-insert exception preserves the complete old header and points.
2. Another user cannot replace an existing named network.
3. Silent point suppression rolls back the new version.
4. Silent header suppression preserves the previous active version.
5. Silent deactivation cannot create two active versions.
6. Two first-version requests reach deterministic PostgreSQL lock contention
   and produce versions 1/2, one active head and the correct parent link.
7. The explicit northern UTM declaration and zero/negative/unknown heights
   survive actual SQL.
8. Duplicate historical head versions reject before mutation.

The integration review added two more native regressions. With the preceding
repair, both failed: distinct historical active versions survived a new write,
and an older active version survived replacement of a newer inactive row. The
handler now locks and checks all active heads in the name stream before mutation.
More than one active head, or an active row other than the latest recorded
version, returns a conflict requiring review. No historical row is repaired or
chosen arbitrarily. Both new failures are now closed; the native suite passes
**all ten checks**.

Receipts are `.cache/corridor-networks/red-sql.json`, `red-initial.json`,
`red.json` and `green.json`. The last red receipt records the two active-head
failures; the original eight-case reproduction was retained separately.
The final receipt reports unique-schema removal, unchanged public historical
migration ledger and unchanged tested source hashes. The verifier executes only
the network/point table prefix of migration 045 inside its own schema; it does
not apply or edit an application migration or copy customer data.

The fixed `--ci` mode is allowed only with `CI=true`, uses the existing
`metardu_revision_verify` fixture on port 55432 and checks its identity/absence
of a production migration ledger. It is wired after the existing design and
document-register checks and uploads `test-results/corridor-networks/green.json`.
The remote CI branch was not executed here. No extra service or container was
created locally.
The earlier real-wrapper Jest API suite passed 34 checks, including HTTP 403
for a different owner. The final **36-check real-wrapper API run passes**, including
the two further HTTP 409/mutation-refusal cases for inconsistent active heads.
Both strict TypeScript projects and scoped ESLint pass after the final change.
The additional active-head query is typed; the earlier
seven-query row sweep predates that added query.
The final source security gate passes with all 119 pinned applied migration
hashes intact. CI YAML and the maintained verifier's Node syntax check pass.
The final native receipt confirms its uniquely owned schema was removed and
the tested route/helper/original migration hashes still match the reviewed source.

## Boundaries

The endpoint still produces a draft network. Successful persistence does not
establish observation accuracy, independent control, adoption by a road authority
or professional approval. Shared registry reads remain as defined by the existing
schema. This repair is not a full cross-route authorization review.

The outer API wrapper's audit append remains a separate post-response-handler
operation; these tests do not establish atomic audit delivery. Existing records
with missing ownership, duplicate heads or another writer bypassing this route
need separate review. No production promotion, customer change, field check,
payment/recovery acceptance or signing-key rotation was performed.
