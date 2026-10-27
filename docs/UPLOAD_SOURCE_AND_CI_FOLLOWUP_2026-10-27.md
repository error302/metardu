# Upload source availability and CI follow-up

## Cause and repair

GitHub CI at `9d05509d7a818d4e5a8205b375d9f922b3eab1e4` found that
`src/app/api/field/mbtiles/upload/route.ts` was missing from its checkout.
The unanchored `upload/` ignore rule also hid
`src/app/api/parsers/upload/route.ts`. Both files existed on the development
host, so local source checks could not establish GitHub source availability.

The ignore rule now targets `/upload/`. Both reviewed API handlers are tracked;
uploaded files remain excluded. Dotenv variants are excluded by default, with
exceptions for the three existing public root environment templates. A real Git
ignore-rule regression test checks source availability and private data exclusion.

The real authenticated MBTiles request wrapper additionally reproduced a 400
`INVALID_BODY`: it attempted JSON parsing before the multipart handler could
inspect its file. The route now declares `rawBody: true`, preserving the wrapper's
session and rate checks. Its insert explicitly returns no row type. No database
migration or access rule changed.

## Verification scope

- Real Git ignore checks failed before the correction and pass afterwards.
- Four request-wrapper checks cover multipart validation and anonymous rejection;
  the MBTiles file-validation check failed before the raw-body correction.
- Fourteen existing MBTiles/offline contract tests pass. Native self-contained
  3D parser integrity also passes (39 checks); these do not exercise a successful
  large MBTiles upload, project membership, disk limits or native tile delivery.
- No files were uploaded to customer storage and no account was elevated.

The preceding Windows build included the ignored local handlers. Its result
must not be described as a clean GitHub checkout build of `9d05509d`. GitHub's
own production build of that commit passed, but without the hidden upload routes.
The newly tracked source needs the next GitHub build and full test run.

## CI observations for the preceding checkpoint

[CI run 40518148540](https://github.com/error302/metardu/actions/runs/40518148540)
completed. TypeScript, native PDF geometry, parser Webpack compilation, production
web build, row typing, i18n and Python/native GNSS/LAS checks passed. CodeQL and
secret scanning also passed in their separate workflows.

The Jest run completed with 742 passing suites, 3 failing suites and 4 skipped
suites (7119 passing tests, 2 failing tests, 10 skipped tests). Failures were the
missing upload route, email verification tampering case and canonical Cassini
file hash. These last two still need diagnosis; neither should be fixed by
weakening token verification or accepting altered coordinates without provenance.

Other failures remain: Zod high-severity dependency admission; set-out capture
fixture/snapshot compatibility; explicit surface-reference preflight; whole-repo
lint heap exhaustion; 11 accessibility routes; mobile static export of
`/robots.txt`. E2E browser tests were skipped after preflight failed. Their
absence is not an E2E pass.

Production promotion, recovery, matching worker artifacts, pending migrations,
the owner-deferred signing-key rotation, ordinary/admin/paid-account acceptance,
physical field/instrument/CAD/print checks and ward-scale crew acceptance remain
open as recorded in the production goal. This checkpoint does not close them.
