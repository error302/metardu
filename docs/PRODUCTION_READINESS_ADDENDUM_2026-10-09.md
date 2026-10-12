# Readiness addendum — 2026-10-09

The original 052 and 064 migration files have been recovered and rechecked
against their recorded SHA-256 hashes. No production migration ledger was
rewritten and no customer database dump was created for this verification.

## Project-map verification

The combined isolated package
`sha256:e9cb23c8504893817056c36b3bdd77682be598ef7e5f526ffff86f0fa0011243`
passed 14 actual HTTP checks using the marked synthetic runtime database.
Owner reads succeeded; another account was denied for the project, reference
system and point endpoints. All three private responses remained non-cacheable.
Zero coordinates were preserved, a raw point displayed without inferring a
boundary, and deleted points were excluded. Missing source grids, invalid saved
boundaries and missing reference declarations all refused to substitute survey
truth.

Actual browser evidence covers a fitted saved boundary, points-only map, the
three refused-data states, layer-panel expansion/collapse, readable toolbar and
upright boundary labels. The 390-by-844 mobile check retained the top return link,
project workflow navigation and bottom navigation. Its viewport override was
reset after recording evidence. The temporary synthetic profile was suspended
and its password removed. See `test-results/imagery-map-http/` and
`test-results/imagery-map-browser/`.

This does not validate the historical map's advertised print scale, external
CAD/GIS application import, physical receiver accuracy or a real field pilot.
The fit control was used to inspect the parcel; initial map framing and small
mobile toolbar touch targets still merit a separate refinement.

## Imagery and release boundaries

Real source metadata and browser imagery were verified for Esri and NASA.
Export permission is source-specific and acquisition accuracy remains unknown.
Browser verification led to source corrections for persistent download links,
visible modal errors, preparation deadlines, stale-export suppression and
native dialog sizing. The corrected source passes 26 focused imagery tests,
strict app/test type checks and scoped lint. The corrected image built and passed
10 HTTP checks; actual source rendering and NASA ZIP preparation were observed.
Archive transfer timed out in both browser adapters. A later source follow-up
passes 27 tests and corrects the inherited modal margin, stale camera downloads
and the mobile Online Services label. That follow-up is not packaged yet, and
downloaded ZIP proof remains pending. See `docs/imagery-viewer.md`
and `test-results/imagery-viewer/` for exact evidence.

The runtime dependency audit found 11 entries, including seven high findings.
They are an unresolved release gate, not proof of active exploitation. Patched
Next.js and Sharp versions are available; `braces` has no verified patched
registry version yet. See `docs/DEPENDENCY_RELEASE_GATE_2026-10-09.md`.

The compilation inventory confirms that no tests enter the app TypeScript
project. See `docs/deployment/compilation-graph-evidence-2026-10-09.md`.
Customer deployment, customer data, real OAuth providers and the public ChatGPT
directory listing have not been changed or verified by this rehearsal.
