# Survey release preparation

Source target: `eac2835e377f59dd0d1b1ff98cb3fbc311401f22`.
Evidence checked on 2026-10-16. This records preparation, not a production release.

## Current boundaries

The existing production image remains
`sha256:fd7c870ce441fd67bf9b7ad64d0ad9675aec2094b70a323eaef99c1c8dda966b`,
with source revision `c1591bda793e415d300f7f58176e1ced8c020f6b`.
`npm run docker:verify` passed with one healthy application container and its
existing supporting services. No image build, application replacement, production
migration, new container or new builder was performed during this preparation.

Production has 112 recorded migrations. The pinned source has 115; the three
pending versions are `108_pipeline_asbuilt_history`,
`109_surveyor_profile_privileges` and `110_alignment_input_persistence`.
There are no changed historical hashes or unknown applied versions. Existing
road-template values were checked for compatibility with migration 110's JSON
conversion; there were no non-null legacy templates at this check.

The recovery evidence in `test-results/recovery-proof/verification.json` reports
a successful prior restore and cleanup. This is historical recovery evidence,
not a newly restored backup. A fresh database/upload checkpoint and preservation
checks remain required at promotion. No customer database clone was attempted.

## Verification completed

`scripts/verify-pinned-release-source.mjs` extracted a Git archive into the ignored
release evidence directory. It uses existing host dependencies without another
checkout, package installation, application server or container. Against that
exact committed source, strict application and test typing, lint of changed
source, and 616 related tests in 91 suites passed. Next's production build and
generated route validation remain separate gates.

The existing synthetic rehearsal database already contained all 115 migrations.
The normal migrator found no pending versions; this run did not prove applying
the three pending migrations to a new copy of the production schema. It did
check the complete synthetic ledger and validated construction constraints.

The **actual existing image's** production startup verifier accepted the pinned
115-file registry against that synthetic database using its restricted runtime
role. It reported matching hashes with no ghosts. This proves strict startup
verification compatibility; it does not prove every old application workflow on
the new schema or field acceptance.

The rehearsal reused `metardu-schema-rehearsal-20261008`. Its owned temporary SQL
directory was removed, its temporary production-network attachment disconnected,
and it was returned to its original stopped state after confirming no active
queries. Production services stayed running. Eight focused Node tests cover
release boundaries and safe temporary-file cleanup. An embedded-script escaping
bug was reproduced before repair; Docker-copy ownership was also handled so the
normal application user still performs verification and only guarded cleanup
runs as root.

## Promotion controls

The controller accepts an explicit full commit SHA and keeps survey-release
receipts separate from the earlier authentication release. Review the existing
receipt before resuming; `plan` refuses to overwrite it. Local evidence is in
`.cache/release-verify/survey-release/`.

Builds must pass pinned source checks and synthetic rehearsal first. The current
production image is protected before reusing the candidate tag; the prior
rollback alias is preserved without copying image data. Build context is a Git
archive, so unrelated working-tree admin changes cannot enter it. The existing
`desktop-linux` builder is reused. Host free-space checks enforce an 8 GiB reserve
before and during a build. Do not retry a build based only on a timeout; inspect
the recorded process, Docker state and log first.

Rollback must retain strict migration verification after forward migrations.
The controller validates every applied version and hash against pinned source,
then mounts only that applied subset as a read-only migration registry for the
previous image. It never rewrites historical hashes, restores over customer data
or reverses forward migrations. Startup/schema verification alone is insufficient
to declare every application rollback path verified.

Before promotion, review the candidate build, compatibility and recovery evidence
again. The controller checks active jobs, captures a fresh backup, fingerprints
affected existing records, applies normal migrations, replaces only the existing
application service, and checks health, runtime privileges and supporting-service
identity. Document the actual outcome and perform live workflow checks afterward.
Remaining engineering and field gates stay in `SURVEY_WORKFLOW_UPGRADE_MATRIX.md`.
