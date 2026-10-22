# Fieldbook native acceptance handoff

Latest native continuation, 22 October: the original synthetic database is now
running, the corrected rollback probe passed 22 checks, and migration 115 then
applied normally after a backup/fingerprint preflight. Its ledger now has 120
matching source entries. The earlier stopped-database and pending-start notes
below are historical; the execution evidence at the end supersedes them.
Production remains separate and unchanged. Revision-delivery HTTP checks now
pass as recorded below; authenticated browser recovery is still open.

Status, 21 October 2026: source recovery work is committed through `e24c714b`.
The existing host source preview has been restored on `127.0.0.1:3021`, using
its original wrapper and build cache. Production is unchanged and passes the
read-only runtime verifier. This is not a release or field acceptance record.

## Current runtime and browser evidence

- Existing wrapper: `.cache/release-verify/cad-io-preview.mjs`; environment
  overrides exclude private dotenv values and select the original synthetic DB.
- Live command handle: `12030`. Verified process/listener ownership is saved in
  `.cache/release-verify/source-acceptance-preview-process.json`. Inspect the
  current handle and processes before any future launch; do not trust a PID file
  alone. Use terminating PowerShell error handling for ownership checks.
- The initial sandbox process could bind port 3021 but not accept a direct host
  TCP connection. Its owned process tree was stopped through its live handle
  before the same wrapper was relaunched with host access. No firewall or
  network-isolation settings were changed.
- Chrome rendered `/fieldbook` after compilation and account retry showed
  `Sign in online to load your projects.` Save controls stayed disabled and the
  scoped recovery panel was unavailable without a confirmed account/project.
  `.cache/source-fieldbook-account-gate.png` records that observed state.
- The source session callback logged `ECONNREFUSED 127.0.0.1:55433`. An HTTP 200
  liveness response does not prove a working database or authenticated session.
  A later source refresh redirected to `/login?next=%2Ffieldbook`; no auth bypass,
  cookie injection, browser-storage seeding or customer login was performed.

## Pending authorized-scope decision

The previous synthetic database retry approval is unanswered. The archive-design
approval authorized the restoration implementation; it did not answer that
separate runtime request. Recheck and approve this concrete scope before starting:

1. Start only `metardu-schema-rehearsal-20261008`, inspected as stopped, container
   `ae6f62341c072b0d3ec16797afbf7ed3f541e8973583ee2f6dea8c366d65b4b0`.
   It has `metardu.purpose=schema-rehearsal`, loopback port 55433 and retained
   volume `99e70f5a5b09ef69aea09e09b20ceede9507cf329142c8457b3f802bf8a311a4`.
2. Run the reviewed `.cache/fieldbook-delivery/verify-schema-rollback.mjs`.
   It refuses a different container, port, database beacon, fixture owner, ledger
   count or unrestricted runtime role. Migration 115 and all fixture changes run
   inside one transaction and roll back. It tests revision/CAS behavior, exact
   snapshots, immutable receipts, field-verification refusal, viewer restrictions
   and preservation of original books/captures/applied hashes. It does not prove
   a normal forward migration or customer-database compatibility.
3. Use the normal source browser and only labeled synthetic QA records for
   archive file selection, explicit review, pending restore, original download,
   reload, repeated restore, scope switching and interrupted-storage acceptance.
   Never use browser internals to seed state. Capture returned files and compare
   their original bytes. Imported receipts must remain unconfirmed.
4. Preserve the original synthetic volume/data and the localhost CAD training
   drawing. Do not create another app container, database, builder or image.
   Production SQL, services, credentials, uploads and backups stay untouched.

Native acceptance remains pending. A normal migration upgrade, measured field
pilot, browser quota/eviction, shared-device identity/privacy policy, full paid
workflow/provider proof, backup restore and coordinated release remain distinct
gates. Do not weaken account checks to get a successful browser demonstration.

## Executed synthetic continuation — 22 October, 09:43–09:45 UTC

Fresh inspection matched the exact retained container, ownership label, sole
data volume and loopback-only binding above. Only that existing synthetic
container was started; no image, container, builder or database was created.
The original preview wrapper was reused without a restart.

The reviewed rollback probe passed all 22 checks. Its transaction rolled back,
the original books/captures/batches and 119 migration records matched, its test
rows were absent, and migration 115 objects remained absent at that checkpoint.
Its private receipt is `.cache/fieldbook-delivery/native-rollback.json`.

The subsequent forward-upgrade preflight found only migration 115 pending and
no mutated/ghost history. A 1,960,861-byte custom-format synthetic backup passed
header and table-of-contents checks; it was not restored. Fingerprints covered
154 original public tables. The normal migration runner's dry run passed, then
its normal apply installed 115 without force or historical checksum changes.
All original table row counts/content fingerprints and 119 prior ledger records
matched afterward. Existing books received only the declared revision-zero
column; no raw input was rewritten. New receipt storage was empty.

The new synthetic ledger has 120 matching source migrations. A separate read-only
verification passed nine checks after the road API exercise, reconfirming old
books/captures/batches, original ledger rows, disabled test actors and removed
fault injection. Receipts and the retained backup are under
`.cache/fieldbook-delivery/`; private fixture/record values are not committed.

The existing synthetic database remains running for further native acceptance.
Production SQL and services were not changed. The rollback probe and this normal
synthetic upgrade are distinct from backup restoration, production compatibility,
native Fieldbook HTTP delivery, ordinary browser recovery and device/field proof.

## Native revision-delivery HTTP acceptance

The existing source preview and marked synthetic database passed 22 further
checks through real HTTP, ordinary CSRF/credential/session sign-in and PostgreSQL.
The ignored reviewed verifier is `.cache/fieldbook-delivery/verify-http.mjs` and
its receipt is `native-http.json` in the same folder. Both synthetic actors were
created with explicit labels, and disabled after the run; no credentials or
session tokens are in the receipt. No production env or customer login was used.

The run verifies anonymous/foreign/account-switch refusal, exact raw strings and
reserved JSON keys, independently computed input/payload hashes, unverified
receipts, owner reload, same-key and concurrent replay, revision advancement,
stale baseline refusal and immutable old snapshots after later edits. Viewers
can reopen their retained authored book but cannot write it or read a different
author's book. A retained receipt cannot replay after current access is lost.
Forcing one exact test receipt insert to fail rolls back both the new book and
its receipt. The scoped temporary fault function/trigger were removed.

Thirteen separate read-only post-checks verify the original books/captures and
119 prior migration records, the exact declared HTTP fixture/two retained books,
disabled actors and absence of both native fault triggers. Original book hashes
exclude only that new explicit fixture; this is not a claim that native tests
created no new synthetic evidence or left sequence counters byte-identical.
`native-resume-independent.json` retains that post-check receipt.

Source API acceptance does not prove native browser archive selection, offline
reload/quota/identity handling, production release or physical field behavior.
