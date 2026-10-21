# Dependency advisory and source-security checkpoint

## Current result

At source HEAD `09e1b5ac7d90690a616520dc65f59cea0238e98f`, the existing
`node scripts/dependency-audit.mjs` completed with exit 0. The successful run
started at 2026-10-21T20:47:24Z and finished at 20:48:25Z. It queried the public
npm registry against the lockfile; it did not install or update packages.

| Scope | Critical | High | Moderate | Low |
| --- | ---: | ---: | ---: | ---: |
| Runtime (`--omit=dev`) | 0 | 0 | 0 | 0 |
| Full graph | 0 | 8 | 21 | 0 |

These are affected-package entries, including inherited dependency effects,
not 29 independent vulnerabilities. The full report contains three root
advisories. Every affected node in that report has `dev: true` in the actual
lockfile. The existing gate blocks runtime high/critical and any full-graph
critical result, so this run passes its current policy. It does not establish
that the build chain or deployed application is free of exploitable issues.

`node scripts/security-and-bug-gate.mjs` also completed with exit 0: 119 applied
migrations pinned, API/PWA guards checked, 614 test files and 3052 source files
scanned. This is a static invariant gate, not a penetration test or full lint
pass. Its Next.js checks enforce type-error rejection and PWA lifecycle flags;
despite the script's header wording, they do not reject `ignoreDuringBuilds`.
The current Next.js config delegates lint to the separate CI lint job.

The local runtime was Node 26.4.0 / npm 11.17.0; the security CI job selects
Node 22. No CI run or production image inspection is implied by this local run.

## Build/test dependency review still required

| Root dependency | Locked version | Report | Observed dependency context |
| --- | --- | --- | --- |
| braces | 3.0.3 | High, GHSA-vfj7-8cjw-p6xm | micromatch/fast-glob/chokidar used by Tailwind, PWA build and Next lint tooling |
| postcss-selector-parser | 6.1.4 | Moderate, GHSA-rj75-hqrm-r3gf | Tailwind/PostCSS selector processing |
| sprintf-js | 1.0.3 | Moderate, GHSA-hp3w-g68c-fv3c | argparse/js-yaml through Istanbul/Jest tooling |

The brace report concerns deeply nested untrusted patterns; the upstream
maintainer disputes its security interpretation and emphasizes caller control
of patterns. See the [upstream issue and maintainer response](https://github.com/micromatch/braces/issues/70).
The registry lists no patched brace version in this report. This is an advisory
exposure, not proof that METARDU accepts hostile glob patterns.

The [selector parser's upstream advisory](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf)
distinguishes untrusted request-path parsing from ordinary trusted build input.
It lists fixes 6.1.5 and 7.1.6, while the npm report received here uses a broader
`<7.1.6` affected range. Confirm the backport and registry-range discrepancy
before selecting a compatible update or claiming the advisory resolved.

The [sprintf upstream report](https://github.com/alexei/sprintf.js/issues/237)
concerns attacker-controlled formatting precision. The npm report lists no
patched version. No format-string endpoint was demonstrated in this review.

Literal package-name searches of application/scripts found no direct use of
these three libraries or fast-glob/micromatch. The active Tailwind config uses
fixed repository content globs; Next loads the PWA plugin during configuration,
and PostCSS uses Tailwind. These searches and dependency chains narrow the
follow-up; they do not prove absence from bundles or every transitive call path.
No high-confidence exploitable application path was established by this scoped
review, and no malicious payload was sent to the application.

Do not run `npm audit fix --force`: the report proposes substantial Tailwind
changes and downgrades of Jest, Next lint config and the PWA plugin. Their
compatibility and effect on field/offline behavior are not established. Review
compatible transitive fixes and build input boundaries first, then verify any
chosen package change with the affected build/lint/test and PWA checks. No
package, override, policy threshold, or lockfile change was made in this pass.

## Evidence and preservation

The sandbox attempt could not resolve registry.npmjs.org and failed closed with
no advisory counts. An approved network retry obtained the runtime report but
the full audit exceeded the script's 60-second subprocess limit while fetching
package metadata. Only after that process was terminal was the gate retried
with its populated local cache; the final command completed successfully.
Neither an unavailable audit nor a timeout was counted as a passing audit.

Prior October 9 reports were retained under
`.cache/dependency-audit-current/prior-2026-10-09/`. Fresh reports are in
`test-results/dependency-security/` and copied to the ignored evidence directory
`.cache/dependency-audit-current/`. The latter also contains `audit.log`,
`audit-network-retry.log`, `audit-warm-cache.log`, attempt summaries, npm logs,
before/after input hashes and `report-summary.json` with every affected node.

SHA-256:

| Artifact | Hash |
| --- | --- |
| package.json | `3fb9026b8181df22b3a062b808dc8cadf0ed5af4eed085a4e1b16d417b80667c` |
| package-lock.json | `a739fc36d118ed2678cff1a17a0237b79ccb9f7945cba7f26c9948ebd383b1b9` |
| runtime-audit.json | `093edf5bad8a0197a9b7a9ad145c463dacf61dd7c9fe51f7164ac1ff279dfb45` |
| full-audit.json | `9904812ba9c2eef909f240ddba35ff2f17c85ca1257c15e86d57c4b3dd6efeb8` |

Manifest, lockfile and audit-script hashes were unchanged across each attempt.
Existing survey-plan edits were preserved; an additional survey-plan test edit
appeared concurrently and was not included in this work. No production service,
database, migration, image, volume, browser data or customer record was changed.
Dependency remediation, deployed-artifact security, worker currency, database
recovery, payment/provider and device/field acceptance remain separate work.
