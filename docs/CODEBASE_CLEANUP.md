# Codebase cleanup

Cleanup on 2026-10-15 removes unused artifacts from the source tree while
preserving application code, customer data, and meaningful verification.
The preservation revision is `2f3f3af2c93816de22bdb38843b055279778df1f`.

| Category | Files | Treatment |
| --- | ---: | --- |
| Unrelated vendored template and tool pack in root `skills/` | 1,389 | Removed; project `.agents/skills` remains |
| Generated compiler output in `.lhtmp/` | 534 | Untracked and ignored; local files remain |
| Historical raw lint, accessibility and Lighthouse reports | 9 | Moved to ignored local archive |
| Fictional marketing artwork | 10 | Removed; recoverable from Git history |
| Unused landing artwork | 13 | Removed after checking references |
| Old generated dashboard capture and its download README | 2 | Removed |
| Generated service worker and Workbox bundle | 2 | Removed from source; production builds regenerate them |
| Tests containing only `expect(true).toBe(true)` | 2 | Removed |

This removes 155,883,265 bytes (about 149 MiB) of tracked file payload.
Actual file deletion totals 91,858,383 bytes (about 88 MiB); reports were moved
without duplication and compiler cache files remain locally. These numbers do
not measure Windows free-space recovery or shrink existing Git history.

The ignored `.cache/cleanup-audit/cleanup-manifest.json` records exact paths,
categories, sizes and SHA-256 hashes. Historical reports are preserved under
`.cache/cleanup-audit/preserved-reports/`; `result.json` records file operations.
Each removal was checked for containment in this checkout, reparse points and
changes against the saved manifest before execution.

The two real landing photographs, their license credits, sign-in photograph,
company logos, survey references and active application assets remain.
Calculation, contour, CAD, cadastral, export, authentication and security tests
remain. Skipped regression tests were retained where they describe unresolved
behavior. Migrations, release evidence, baselines, uploads, local CAD drawings
and the separate unfinished admin work were preserved.

Git and Docker ignore rules prevent these generated inputs from returning.
The PWA plugin creates fresh service-worker files in the production build;
the builder's generated public directory is still copied into the final image.
No Docker service, image, volume or builder was created, removed or changed.
Source checks do not constitute production or field verification; the remaining
platform release gates continue in `SURVEY_WORKFLOW_UPGRADE_MATRIX.md` and
`REQUIREMENT_READINESS_2026-10-11.md`.

Verification: all 1,961 manifest entries passed post-operation checks, including
hashes of the archived reports; no retired public asset URLs remain in active
source. All 122 focused tests passed across landing/pricing, beacon symbols,
deed-plan and CAD exports, email branding and templates. Strict application and
test TypeScript checks passed. Standalone packaging passed four tests, with its
junction case skipped because the Windows sandbox cannot create that junction.
The lint script passed Node's syntax check. No production build or promotion
was performed for this cleanup.

Follow-up on 2026-10-16 removed 33 untracked browser captures from the repository
root, all dated August 2026, totaling 11,314,958 bytes (about 11 MiB).
Names, sizes and hashes are recorded in the ignored
`.cache/cleanup-audit/root-captures-manifest.json`; every target was checked for
containment, reparse points, tracked status and unchanged content before deletion.
The few filename matches in smoke-test scripts are screenshot **outputs** in
`live-test-results/`, not inputs from the root. No application code consumes these
root captures. Current verification evidence in other directories remains.

Root captures are excluded from Docker build inputs. The PNG ignore rule is now
scoped to the root, with generated audit directories ignored separately, so new
application assets are not silently omitted from Git. This revealed the existing
ChatGPT package icon referenced by `plugin.json` was ignored; it is now included
and matches `public/metardu-icon.png` byte for byte.

The follow-up retained all active public photographs and icons, calculation and
security regressions, migrations, recovery evidence and the user's CAD drawing.
No Docker image, application container, volume or builder was created or removed.
