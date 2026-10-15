# Survey release preparation and promotion

Source target: `eac2835e377f59dd0d1b1ff98cb3fbc311401f22`.
Evidence checked on 2026-10-16 (Africa/Nairobi). The pinned source is now promoted;
this milestone does not establish full platform or field readiness.

## Current boundaries

The production image is now
`sha256:3f97a2ebefae129a7262d0d02ce99c4fd406f60f307d4b067d1a46aceace7bc8`,
with source revision `eac2835e377f59dd0d1b1ff98cb3fbc311401f22`.
`npm run docker:verify` passed with one healthy application container and its
existing supporting services. One candidate was built using the existing builder,
then the existing `metardu-app` Compose service was replaced. No duplicate app
service/container or new builder was created. Required supporting containers,
their start times and mounts were preserved; the uploads mount is unchanged.

Production and the pinned source both have 115 migrations. The upgrade from 112
applied `108_pipeline_asbuilt_history`,
`109_surveyor_profile_privileges` and `110_alignment_input_persistence`.
There are no changed historical hashes or unknown applied versions. Existing
road-template values were checked for compatibility with migration 110's JSON
conversion; there were no non-null legacy templates at this check.

The recovery evidence in `test-results/recovery-proof/verification.json` reports
a successful prior restore and cleanup. This is historical recovery evidence,
not a newly restored backup. Promotion captured fresh database/upload checkpoints
and verified original records in the nine affected existing tables. No customer
database clone was attempted, and no applied migration hash was changed.

## Verification completed

`scripts/verify-pinned-release-source.mjs` extracted a Git archive into the ignored
release evidence directory. It uses existing host dependencies without another
checkout, package installation, application server or container. Against that
exact committed source, strict application and test typing, lint of changed
source, and 616 related tests in 91 suites passed. Next's production build and
generated route validation remain separate gates.

The existing synthetic rehearsal database already contained all 115 migrations.
Its no-op rerun checks the complete ledger and construction constraints; separate
forward-upgrade proof is now required before building.

`scripts/verify-survey-upgrade.mjs` subsequently bootstrapped all 112 prior source
migrations in a separately marked temporary database on the existing synthetic
service, then applied 108/109/110 through the normal pinned runner. No customer
data or customer database schema was copied. All prior hashes, synthetic records,
zero and negative measurements survived; the legacy text template became JSONB
without losing its values. The new profile guard blocked self-promotion while
allowing firm edits, and the new pipeline history accepted its owner while
remaining hidden from another user. All five native checks passed. The temporary
database was removed and its cleanup receipt verified. This source-baseline
upgrade does not represent production data or replace recovery evidence.

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

Builds must pass pinned source checks, synthetic rehearsal and the separate
completed forward-upgrade/preservation check first. The current
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

## Actual build, promotion and HTTPS result

The single candidate build passed packaging checks, native dependency smoke
checks, strict Next.js type checking, all 219 static pages and standalone output.
The build report lists initial JavaScript of 126 kB for `/`, 182 kB for
`/tools/cad-editor`, and 226 kB for `/tools/contour-generator`. These are bundle
report figures, not measured browser speed. One 6.02 MB chunk exceeds the PWA
precache limit and is omitted; its loading path/offline behavior remains a
separate performance review. The precache limit was not raised.

GitHub's `gitleaks` run `38809684338` passed for the exact application revision.
Release tooling has separate later commits; it was not substituted into the
application build context. Unfinished admin working-tree changes were excluded.

Before migration, the controller checked active jobs and preserved the old app
logs in the existing backup volume. Fresh checkpoints are
`/backups/db_20261015_221458.sql.gz` and
`/backups/uploads_20261015_221458.tar.gz`. Archive/header integrity checks passed;
this does not claim a fresh restore. The production migrator exited zero,
retained all historical ledger entries and passed existing-record fingerprints.
The new image is healthy and its actual startup verifier reports 115 migrations,
matching checksums and no ghosts under the restricted production runtime login.

The prior production image
`sha256:fd7c870ce441fd67bf9b7ad64d0ad9675aec2094b70a323eaef99c1c8dda966b`
is protected as `metardu-metardu-app:rollback-current`. The preceding rollback
image retains the `rollback-prior-current` alias. No automatic database restore,
reverse migration, image pruning or volume cleanup occurred. Rollback startup
compatibility was verified synthetically; a full production rollback was not run.

`scripts/verify-live-survey-release.mjs` then passed 13 actual HTTPS checks at
`https://metardu.space`: public health, anonymous private-API refusal, two exact
QA credential sessions, owned alignment reload, private cache directives/no
Cloudflare cache hit, other-account alignment/station read and IP-write refusal,
self-promotion refusal with unchanged authority, ordinary profile editing and
empty owned pipeline history. It created no measured evidence and sent no email.
The exact disposable project/accounts were revoked and removed; an independent
database query confirmed zero remaining QA users, projects and alignments.

Ignored receipts are `promotion.json`, `source-checks.json`, `upgrade-checks.json`,
`build-1.log` and `live-survey.json` under
`.cache/release-verify/survey-release/`. Eleven focused Node tests cover the
release/probe boundaries. The final Docker verifier confirms one healthy app,
required services and the fresh backup completion receipt. The synthetic
rehearsal service is stopped and its temporary upgrade database is absent.

Remaining work includes the legacy earthworks storage/calculation contract,
revision-bound workflow and approval gating, broader road geometry/corridor
support, production interaction checks beyond the 13 listed above, physical
instrument/field/print acceptance and outstanding OAuth/provider/payment/public
directory release evidence. Shipping these repairs is not a claim that every
survey family, paid feature or external integration is finished.
