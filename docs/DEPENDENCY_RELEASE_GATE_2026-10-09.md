# Dependency release gate — 9 October 2026

**Update:** Compatible source/lockfile patches now produce zero runtime advisory
entries and zero critical entries in the full build/test report. Actual native
checks pass on Windows and Node 22 Alpine. The patched verification image now
builds and runs healthily, with ten imagery and fourteen map/auth HTTP checks
passing. PWA/offline behavior and the final export-layout follow-up remain
unverified; eight high and 21 moderate
build/test entries remain visible. See
`docs/DEPENDENCY_PATCH_VERIFICATION_2026-10-09.md`. The original findings below
describe the pre-patch package and are retained as history.

The current lockfile's `npm audit --omit=dev --json` report contains eleven
advisory entries: seven high, three moderate and one low. No critical entry was
reported. This is a dependency classification, not proof that every reported
path is reachable in the deployed runtime. The full report is retained in
`test-results/imagery-viewer/runtime-dependency-audit.json`.

Required follow-up before treating this source as release-ready:

| Dependency | Reported issue | Required assessment/change |
| --- | --- | --- |
| `sharp` | High; affected versions below 0.35.5 | Upgrade to the patched release and verify actual image/PDF/SVG paths. The maintainer describes RCE under specific glibc/Linux/runtime conditions; the rehearsal uses Alpine, so exposure must not be inferred from severity alone. |
| `source-map-js` | High; versions below 1.2.2 | Resolve the patched version and confirm consumer compatibility. |
| `brace-expansion` | High; three nested 2.x copies | Resolve patched 2.1.7 or later within the compatible branch and recheck all dependency paths. |
| `braces` / `micromatch` / `fast-glob` / PWA chain | High; nested-pattern exhaustion | Inspect the maintainer fix and actual build/runtime consumers. Do not apply the audit's proposed PWA 10→6 major downgrade automatically. Offline/service-worker behavior must be tested after changes. |
| `next` | Moderate; current 15.5.24 within the affected range | Inspect advisories and update the compatible framework/lint configuration together. |
| `nodemailer`, `fast-uri`, `dompurify` | Moderate/low entries | Inspect fixed versions and test email/URI/sanitization consumers. |

Primary references reviewed for the high findings:

- [Sharp maintainer advisory and patched version](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
- [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- [brace-expansion advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr)
- [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)

Read-only npm-registry checks on 2026-10-09 confirm that Next.js 15.5.27
and Sharp 0.35.5 exist and support the project's Node 22 build runtime.
These are candidates for a separate tested dependency update, not changes
included in the frozen imagery package. The registry's latest `braces` is
still 3.0.3; do not invent a patched version or accept an automated PWA major
downgrade as a verified fix. Inspect where untrusted patterns can reach this
build dependency and choose a supported replacement or maintainer fix.

The imagery feature's source checks and public-provider reads remain separate
from this gate. Its production build compiled, passed strict types and generated
217 pages, but the first final image transfer was cancelled (exit 130); the image
tag was authoritatively absent. The retry completed and produced the healthy
isolated image `sha256:e9cb23c8504893817056c36b3bdd77682be598ef7e5f526ffff86f0fa0011243`.
Real browser viewing of both imagery sources passed. Corrections identified
during browser verification produced the healthy corrected image
`sha256:f0431b8dc1f56a85bf2b6bd0503ec7aeaef71bf9b979535355add98df8581a96`,
which passed 10 HTTP checks. Downloaded export proof and the last visual source
follow-up are still pending. None of these packages resolves the dependency gate above.
No customer deployment or data was changed. PWA is disabled only in the isolated
rehearsal; this does not establish production offline safety.
