# Compilation graph evidence — 2026-10-09

`npx tsc --listFilesOnly --pretty false` lists 5,588 files in the current
application project: 1,972 under METARDU's `src`, 3,596 in `node_modules`,
three generated Next route type files and 17 other inputs. No test entrypoints
appear. This is a file inventory, not a timing benchmark or bundle-size report.
The raw inventory and counts are recorded under
`.cache/release-verify/app-typescript-files.txt` and
`test-results/imagery-viewer/typescript-graph.json`.

The strict application check and separate strict test check both passed after
the imagery export corrections. Next 15.5.24's installed `runTypeCheck.js`
uses `createIncrementalProgram` and writes its `.tsbuildinfo` into the supplied
Next cache directory. The Dockerfile already mounts `/app/.next/cache`; CI
also preserves the separate app/test `.tsbuildinfo` files. Adding another
Docker type-cache mount is unnecessary with this installed implementation.

The corrected isolated build's compiler reported 2.4 minutes; strict production
types completed before page-data collection at build-log offset 371.4 seconds.
It then generated 217 pages. The isolated builder was observed at 166.72% CPU
and 2.283 GiB of its 6 GiB memory limit, with no OOM or limit events. These
are observations of this bounded rehearsal, not performance guarantees.

Lazy loading reduces the initial browser payload for a tool, but does not
remove its production source from a full strict application type-check. Keep
that validation and the authoritative engineering engine. Use the analyzer
and actual field-device baselines to choose browser payload changes. Do not
add native GIS packages or a second map library merely to expand a dependency
list. HTTP cache policy and Cloudflare delivery are separate from TypeScript
compilation; imagery metadata reuses a successful server-side catalogue while
preserving the platform's private, non-cacheable API responses.
