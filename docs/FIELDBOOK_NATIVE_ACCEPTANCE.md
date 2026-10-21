# Fieldbook native acceptance handoff

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
