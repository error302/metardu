# Dependency patch verification — 9 October 2026

The updated production lockfile reports zero advisories across all severities.
The complete development/build/test tree reports zero critical, eight high and
21 moderate entries. The full report is retained; it is not a claim that the
whole dependency tree or the deployed site is free of security issues.

## Changes

- Next.js and its lint configuration: 15.5.24 → 15.5.27.
- Sharp: 0.35.4 → 0.35.5, including its matching prebuilt binaries/libvips.
- DOMPurify: 3.4.15 → 3.4.16; the override now references the direct dependency.
- Nodemailer: 10.0.8 → 10.0.9.
- Compatible transitive source-map-js 1.2.2, fast-uri 3.1.8 and brace-expansion
  branches, including all nested 2.x copies at 2.1.7.
- The test compiler's Handlebars dependency resolves 4.7.10, removing the critical
  full-tree advisory. No application endpoint compiles user-provided Handlebars
  ASTs in this change.
- The PWA generator remains installed for builds at 10.2.9 and is classified as
  a development dependency. It was absent, together with braces, micromatch and
  fast-glob, from the checked earlier standalone runtime. The PWA source
  configuration and runtime-caching policy were retained.

Maintainer references: [Next.js patch](https://github.com/advisories/GHSA-mcj8-r9mp-w47p),
[Sharp patch](https://github.com/advisories/GHSA-wq5f-xc86-pv6w),
[Handlebars patch](https://github.com/advisories/GHSA-8r5x-fm3f-whwj).
The remaining [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
has no published patched version. Build/test findings remain review items;
this change does not downgrade PWA or force incompatible dependency majors.

## Verification and CI

`scripts/dependency-audit.mjs` retains runtime and full audit JSON, fails closed
on unavailable/malformed reports, blocks all critical entries and blocks high
runtime entries. CI runs it under Node 22 and uploads both reports even on
failure. Reports are in `test-results/dependency-security/`.

`scripts/verify-runtime-dependencies.mjs` checks installed versions against the
manifest/lock and exercises actual libraries. Its seven checks passed locally
and in the clean Node 22 Alpine build: patched native SVG-to-PNG rasterization
and pixels; the actual METARDU SVG sanitizer; local-only email composition;
real XLSX ZIP write/read preserving zero coordinates and precision; brace
expansion; source-map/URI compatibility; and patched template compilation.
No email was transmitted. These checks do not prove provider delivery, field
accuracy or external CAD/GIS application compatibility.

The feature run covered 59 tests across six suites. One SVG-rendering test
exceeded its existing five-second limit during the combined run; the isolated
sanitizer suite then passed all four tests without changing its assertions or
timeout. Strict app/test type checks passed. Original and retry logs are retained
under `.cache/release-verify/security-*`.

The local hidden npm installation cache incorrectly reported patched versions
while actual package files remained old. Its original was moved into
`.cache/release-verify/dependency-before/` and npm reread the physical tree,
updating 17 packages. Native verification then confirmed actual installed
versions. The original manifests and lockfiles were preserved there as well.
[npm's hidden-lockfile behavior](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/#hidden-lockfiles)
is the relevant installer documentation.

## Build boundary

The first isolated build stopped before compilation because `.dockerignore`
excluded the new verification script. An exact allowlist entry corrected this.
The builder now inherits the completed dependency stage instead of copying its
node_modules into another stage; the old copy took 138.7 seconds. The final
non-root runtime still uses its independent clean base and standalone output.
This removes a duplicate build step; no whole-build speed guarantee is inferred.

The corrected PWA-enabled build completed, passed native checks and full strict
production types, and generated 217 pages. Its image is
`sha256:f949388751ef7e8cbfecb3c376e8a561a4abc484487be52ca97f6987371d0108`,
running healthily only on loopback port 3014 against the synthetic database.
It passed ten public imagery HTTP checks and fourteen actual project-map/auth
checks, including unrelated-account denial and private cache headers. Workbox
warned that `/_next/static/chunks/fbe89ba5.7144cd6a95cd6b78.js` is 6.02 MB and will
not be precached. Runtime inspection identifies TVM/WebLLM and its engine APIs
in that chunk, and source inspection locates the local AI worker/service imports.
It is not the Cassini or national-sheet data. Keep cold offline AI coverage
unverified rather than raising the global precache limit blindly. Actual
origin-unavailable/offline workflows remain untested.

Actual runtime inspection confirms Next 15.5.27, Sharp 0.35.5, libvips package
1.3.4, source-map-js 1.2.2 and fast-uri 3.1.8. A real 16-by-16 SVG encoded as
PNG in the runtime. Braces, micromatch, fast-glob, PWA and Handlebars remain absent
from its installed standalone dependency directories. The standalone tracer
omitted libvips's versions.json, so runtime `sharp.versions.rsvg` is unavailable;
do not equate the missing metadata field with a failed SVG decoder. The complete
builder's patched renderer metadata and native pixel checks passed separately.

Browser checks prove the modal now starts at (0,0), matches the full viewport and
has zero inherited margin. The 390-pixel mobile header says Online Services,
preserves navigation and has no horizontal overflow. An expanded export did
not retain its prepared link; the inline view initially produced one. Changes
to footer height were changing the map size and triggering stale-view cleanup.
Follow-up source reserves download/status/coordinate rows and reports actual
view coordinates while loading. Its 13 affected tests and strict app/test checks
pass; it is not in this image yet. Actual archive transfer and external GIS
import remain unverified. Browser evidence is in
`test-results/dependency-security/browser/`.

No customer service, data, migration history, OAuth provider or public ChatGPT
listing has changed. The earlier package evidence is preserved separately;
the completed patched image is a verification package, not a claim of complete
platform readiness.
