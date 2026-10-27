# Engineering input workflow: conditional project saves

27 October 2026. Source and isolated PostgreSQL evidence; no production promotion.

The engineering input workflow previously replaced the whole project JSON using
only the project ID. An older tab could therefore overwrite a newer visual road
save. Its automatic alignment mirror then made several further requests that
could write input arrays back into the canonical project.

## Current behavior

The generic project proxy now requires an engineering update to name one project
and its exact original engineering snapshot. The original snapshot is either a
finite supported JSON object compared by equality or an explicit SQL-null
precondition for a previously uninitialized project. Ownership and the snapshot
predicate are applied in the same parameterized UPDATE. An absent/invalid
precondition, bulk replacement, OR filter or unsupported replacement is refused.
A conditional update returning no row reports an engineering conflict.

The input page retains the snapshot read from the project separately from editable
state and relational hydration. Mode changes, step saves and Save All use that
snapshot. Only an exact acknowledged save advances it. Overlapping page saves are
refused. Failure leaves the original snapshot and current inputs in place and
does not start mirror synchronization. Optional object properties may be omitted;
non-finite values and unsupported array entries cannot be coerced into JSON null.

After acknowledgement, automatic mirror copies carry a hash of that exact saved
engineering JSON. The header and each IP/VIP/station request check it under the
existing project lock before writing their mirror records. The three list copies
do not write back into the canonical project when using this checked mirror mode.
A newer project save between requests refuses the delayed copy. These requests
are separate transactions; a partially updated mirror remains a synchronization
failure, not a confirmed complete mirror.

## Verification

- 270 tests in 33 suites cover the road workflow, source checks, owner proxy,
  snapshot/conflict handling, automatic mirror request binding, header refusal,
  device recovery and existing computation paths. Tests first demonstrated the
  missing guard, original-snapshot argument and mirror behavior before changes.
- Application/test TypeScript, direct ESLint, security and runtime receipts are
  recorded in `.cache/engineering-cas/source-checks.json`.
- The opt-in actual PostgreSQL test uses only the marked existing loopback
  `metardu_runtime_verify` database and restricted `release_app` role. Its 13
  checks include real conditional JSONB updates, stale/null-snapshot refusal,
  exact mirror-hash checking, preservation of original JSON, precision refusal,
  immutable road cancellation and archive-failure rollback. All temporary users,
  projects and request outcomes roll back; migration hashes are unchanged.
  Evidence is `native-sql.json` and `native-jest.json` in that directory. Earlier
  road-recovery receipts remain separate historical artifacts.
- These are source, component/route fixtures and actual database checks. This
  change does not claim a new authenticated browser, physical-phone, multi-user
  load or production acceptance run. The preceding recovery browser observations
  remain evidence for their own source checkpoint.

## Remaining compatibility and release gates

Older deployed input clients do not supply the required original snapshot and
will be refused by the updated generic proxy. Promote client and server together;
review the rollback candidate before any release. No migration was added or
applied, and no build, push, container creation or promotion was performed.

Direct alignment-edit requests without `project_snapshot_hash` retain their
existing semantics. Their adoption of conditional/durable commands remains open;
this change does not declare every engineering writer protected. Generic
engineering saves also lack the visual editor's durable request journal and
reference-snapshot binding: an uncertain legacy response requires retained-input
review, and reference changes still need a complete workflow audit. There is no
automatic conflict merge or silent rebase.

Retained terrain, justified ground reassociation, selected road revisions,
validated IFC/LandXML/DXF/instrument delivery, representative field and independent
surveyor/receiving-CAD/print acceptance, ward-scale capacity, ordinary admin and
physical-phone checks, provider/paid lifecycle, rejected customer clone/restore
admission, worker artifact alignment, owner-deferred signing-key work and coherent
production promotion retain their gates. Preserve Cloudflare parcel containment
and the localhost CAD training drawing.

The following writer-boundary checkpoint is recorded in
`ENGINEERING_WRITER_BOUNDARY_2026-10-27.md`. Its guard now refuses direct legacy
edits against existing canonical engineering JSON and removes the obsolete
sync-back write. SQL-null standalone alignments remain available. Its expanded
native receipt is separate from the historical 13-check receipt in this document.
