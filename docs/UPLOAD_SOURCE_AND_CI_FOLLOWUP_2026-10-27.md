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

## Subsequent source corrections

The email failure came from base64 decoder permissiveness: altering unused low
bits in the final signature character can retain identical HMAC bytes. Token
verification now rejects a signature unless decoding and canonical re-encoding
preserve its exact text. Correctly signed canonical tokens still pass. A fixed
clock and a change to a significant signature byte make the tampering test
deterministic; a new test reproduces rejection of byte-equivalent pad-bit,
padding and whitespace aliases. This is not an HMAC-forgery finding and does not
resolve the separately deferred signing-key rotation.

Cassini's Git blob has SHA-256
`734face267b96ec4279fb216bdd961cc9ee36f4fbf5619e09e9f242f20ce1a77`.
The Windows CRLF representation has SHA-256
`ae5bf4ddf022b220068f1ca2b249a6ce1f28391e6ee72591eba91f88334b48bf`.
Direct byte comparison confirmed that the Git blob equals exactly the Windows
file with CRLF converted to LF; parsed JSON was identical. Git attributes now
require LF for this specific reference file. The data-boundary test pins the
existing Git blob's LF hash, admitting that same newline conversion for older
Windows checkouts. The reference file and every coordinate remain unmodified.
Both corrected Jest suites pass locally (four checks).

The mobile build's next reported failure was `/robots.txt`. Robots and sitemap
contain only a public URL, fixed public route lists and a build timestamp; neither
reads a request, cookies or project data. Both explicitly declare static output.
The full mobile export still requires CI verification; the destructive historical
mobile stashing helper was not run in this shared source checkout.

At `2026-10-27T14:33:05Z`, anonymous public HTTP returned 200 for the landing page
and healthy database/Redis health, and 307 login redirects preserving dashboard
and admin destinations. Public `releaseId` remains `unknown`. Read-only Docker
verification also passed. These observations check the existing deployed release,
not this newer branch source; authenticated UI and release acceptance remain open.
