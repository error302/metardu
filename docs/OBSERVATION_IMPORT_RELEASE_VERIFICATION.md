# Observation import compatibility — 18 October 2026

Revision `80940bf7537c116621eba76e42e1831cf4def1d6` is deployed and healthy in
the existing `metardu-app`. Image:
`sha256:604238eef9cd56fa0ebc104a9d99092e8cc890857ec9b4cd68fa6c1c512078de`.
All **118 ledger entries** match the pinned source; the newest migration filename
is **113**, not 118. This closes the reproduced live coordinate-import schema
failure. It does not accept the entire engineering platform or field workflow.

## Source repair and preservation

The earlier healthy `2e89e143` deployment exposed PostgreSQL 42703 during private
import-context acceptance. A pre-existing legacy `observation_batches` table had
only 17 columns. Migration 068 used `CREATE TABLE IF NOT EXISTS`, so its recorded
checksum did not establish that the newer column contract actually existed.
Canonical synthetic tests had not reproduced that older table shape.

Forward-only migration 113 adds 13 missing metadata columns. It does not update,
rename, backfill or delete historical rows, counts, hashes, statuses or timestamps.
Unknown historical counts remain NULL. Unexpected existing column types reject
the migration rather than being coerced. Historical source/operator/instrument
names are read through compatible aliases without rewriting stored records.
New batches explicitly use `raw`; this does not reclassify historical `RECORDED`
rows or establish field verification.

Import commits now require explicit returned IDs for the session and source
capture as well as the selected points. A trigger that silently skips a write
cannot produce a successful receipt; the transaction rolls back. Legacy captures
with NULL metadata produce a controlled conflict when their IDs are reused.

The release controller checks the actual import columns, geometry and runtime
privileges before maintenance and after migration. A reviewed pending 113 can
explain only its known missing observation fields. It cannot waive another gap
or incompatible existing type. Original-column count/content fingerprints now
also protect observation batches, survey points and import sessions during
migration. Applied migration files and hashes were not edited.

## Verification evidence

| Layer | Result | Limit |
| --- | --- | --- |
| Pinned source | Strict app/test typing, lint and 115 affected tests in 15 suites pass; 13 release/contract checks pass | Native integration is deliberately skipped in the ordinary Jest run |
| Schema upgrade | Legacy, canonical and partial schemas upgrade through the ordinary provisioner; incompatible schema rejects atomically; seven matrix checks pass | Schema-only fixtures, no customer clone |
| Native service | Actual restricted-role PostgreSQL imports pass in all three valid variants: source/BOM hash, NULL versus zero, ownership, replay, legacy history and silent-write rollback | Synthetic measurements, not receiver/field evidence |
| Build | Strict production typing, all 219 static pages, standalone/native packaging pass | A 6.02 MB chunk is excluded from precache; complete offline operation is not established |
| Live private HTTPS | **26 checks pass**: fieldbook acknowledgement/retry/ownership; alignment privacy; profile authority; import reference/history/commit/retry; exact source download; NULL/zero heights; CAD save and point preservation | Exact disposable QA fixtures only; no customer measurements or email/payment |
| Public HTTPS | **20 checks pass**: exact release health, private redirect/cache behavior, workflow pages, pricing choices, shared font utilities/binary, email logo and disabled ChatGPT notice gate | Provider delivery and financial approval are separate |
| Independent cleanup | Zero exact QA users, projects, fieldbooks, alignments, references, points, captures and sessions; live ledger still matches promotion | Normal audit history is preserved |

Receipts: `.cache/release-verify/unified-release/80940bf7537c116621eba76e42e1831cf4def1d6/`
contains `promotion.json`, `source-checks.json`, `upgrade-checks.json`, the native
variant logs, `public-readiness.json`, `live-survey.json` and
`independent-cleanup.json`. Earlier failed receipts remain historical evidence.

Live QA cleanup explicitly checks and deletes only its exact marked source
capture before deleting its project: the legacy table has no project cascade.
No customer cascade or deletion behavior was added to accommodate the test.

## Runtime and recovery

The fresh cutover checkpoint is `/backups/db_20261018_080140.sql.gz` with
`/backups/uploads_20261018_080140.tar.gz`; archive/header checks completed at
08:01:42 UTC. Existing restore/recovery evidence was reviewed before promotion.
The new checkpoint was not separately restored into a customer clone.

Existing original-row fingerprints, mounts and supporting service identities and
start times were preserved. The read-only Docker verifier passes with one app,
healthy PostgreSQL/Redis/worker/collaboration/NTRIP, and the existing backup
service running. No extra application container, builder or dated image was
created. No pruning, VHD compaction or Docker/WSL shutdown was performed.

Protected rollback-current is the previous healthy image
`sha256:e7b2ad11fd8969ec5c85282125e0f94d40870229b4b6cca88bbbeb0447b2768b`.
The older `af17d7af4559e416…` image remains protected by
`metardu-metardu-app:rollback-af17d7af4559e416`. The existing historical read-only
registry bind under the `830df653…` release cache is still mounted and must not
be deleted. A rollback must verify the actual forward ledger, never restore an
old database over newer customer data.

The host reached about 28 MB free RAM during build/browser testing. Only the
inspected source preview process tree was stopped, recovering about 2.3 GB.
It was subsequently restored in place on `127.0.0.1:3021`, with the same wrapper,
database and cache. Production and required services were not stopped for memory
recovery. The user's localhost CAD training drawing/storage was not accessed.

## Other unfinished acceptance work

The previously blocked road-quantity HTTP run now passes **25 source checks**,
including shared-reader restrictions, forced-insert transaction rollback,
140/320 cubic-metre reductions, stale/incomplete inputs, immutable archives and
unchanged legacy rows. Independent checks confirm both exact synthetic accounts
are suspended, the two draft/superseded revisions remain, the temporary fault
trigger/function is absent and no browser credential file remains. This updates
the older failed source-authentication checkpoint; it is not a live quantity
recording or construction-approval test. See `ROAD_QUANTITY_RECORDING.md`.

Public HTTPS browser checks confirm hydrated pricing and import pages, Geist
interface text and Instrument Serif display text, with no measured horizontal
overflow at desktop/phone widths. Screenshots and `deployed-browser.json` are
under `.cache/typography/`. No phone testing was continued after the user chose
computer-browser testing.

The production HTTP loopback origin separately produced chunk-loading errors
on pricing and import. Independent HTTP reads returned the exact files (200).
Pricing's React-reset button did not recover; a normal browser reload did.
Public HTTPS pricing/import remained interactive. The origin-specific cause is
not established, and a deliberate chunk-error reload action remains a source
recovery follow-up. Do not confuse this with the repaired SQL failure.

A read-only deployed asset inventory is not a network-disconnected browser or
field test. Offline cold launch/reopen, complete route/dependency caching and
honesty of the blanket offline copy still require acceptance. Real control,
receiver/instrument operation, calibration, loss/reconnect, print scale, design
approval and broader corridor/survey-family checks remain separately open.

Provider read checks at 06:12:19 UTC found all 12 live PayPal plans valid, but no
subscription, charge, renewal or webhook delivery was generated. Resend's key
is send-only: domain listing returns `restricted_api_key`; this is not evidence
of a failed sending key. Prior inbox receipts remain historical, not fresh
delivery. No message was sent. ChatGPT notice version `chatgpt-sharing-v1`
remains waiting/ineligible and linking unconfigured, with eligibility no earlier
than `2026-11-10T17:56:45.516Z`; deployment and actual user's consent remain gates.
