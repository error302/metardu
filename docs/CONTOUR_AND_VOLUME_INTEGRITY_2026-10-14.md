# Contour observation integrity and earthwork volumes — 14 October 2026

## Verified source corrections

The standalone contour tool previously classified every dataset of at least 20
points as an unreviewed point cloud, discarded observations it labelled as
vegetation/buildings, and renamed the survivors. A 20-point measured plane was
reduced to 12 points, excluding upper and outer controls. The tool now supplies
all imported survey observations and measured breaklines to the established TIN
engine. Ground selection belongs to the surveyor's reviewed source dataset.

The regression uses a 5-by-4 grid at 10-unit spacing, with exact heights
`z = 100 + 3E + 2N`. All 20 named observations reach both worker entry points;
each returned contour vertex satisfies the plane equation. The highest
non-degenerate 1-unit isoline is 279, below the observed maximum of 280. The
minimum/maximum isolated vertex is not invented into a contour line.

Results are published together only after both contours and the surface succeed.
Editing the interval, index multiplier, source points or breaklines invalidates
old output immediately. Completion of an obsolete asynchronous request cannot
restore old output. Imports containing reported errors cannot silently produce
a partial survey surface. Replacing an import clears its old breaklines.
Measured breakline endpoints are included in the drawing bounds.

Map, elevation-list, PDF and SVG contour labels retain distinct small-interval
levels; rounding to one decimal previously collapsed centimetre levels. Index
labels no longer depend on having more than eight vertices. The SVG north arrow
was moved out of the map-key text. Completed surfaces without isolines receive
an explanation rather than appearing to fail silently.

The shared cross-section volume engine previously doubled Simpson/prismoidal
groups: constant 10 m² over two 20 m intervals returned 800 instead of 400 m³.
It now calls the existing engineering authority with the complete 40 m span.
Unpaired intervals use average end-area once. Signed cut/fill transitions are
split at an explicitly assumed linear area zero crossing instead of cancelling
excavation and fill. These signed sections cannot represent mixed cut/fill at one
section; separate measured areas are required for that workflow.

The volume panel requires supplied sections and an explicit calculation action,
rejects blank/suffixed/non-finite data, clears stale results, and retains every
table row. Its mass-haul chart accumulates cubic-metre increments once, preserves
actual grouped station spans and interpolates zero crossings. A Simpson
midsection is explicitly marked, without a fabricated independently calculated
volume. API input validation uses the shared schema; responses remain private.
Shrink/swell, material classification, curvature corrections and design
acceptance are not inferred. The balance flag means numerical zero net volume.

Formula references: [FHWA average end-area earthwork guidance](https://highways.dot.gov/federal-lands/pddm/dpg/earthwork-design)
and [USACE EM 1110-2-1003, equation 10-4](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1003.pdf).

## Verification boundary

70 focused tests across eight contour/volume suites passed. The new contour
page regressions were observed failing before repair, including the 20-to-12
observation loss, stale exports, partial results and incomplete imports. The
centimetre SVG-label regression also failed before repair. Engine tests reproduced
the 800/400 error and cut/fill cancellation before repair. Both strict app and
test TypeScript projects passed. Scoped source lint and new-test lint passed.

Two additional tests verify the exact recovered bytes of migrations 052 and 064.
Migration 052 failed its byte test before recovery and passed afterward.
The original 052 artifact was recovered from the existing ignored recovery
folder, matched to the current production ledger, and restored without changing
SQL semantics, checksum records or the existing byte-preservation Git attributes.

The existing host preview was absent, so its original wrapper and original cache
were reused at `127.0.0.1:3021`, with provider credentials disabled and the
separate synthetic database configuration. It remains process 15948 / child
17860, unified execution session 77473. It reached Ready, but contour-route
compilation/browser CDP observations timed out. There is no new browser-download,
visual-layout, production-contour or physical-field proof in this checkpoint.
Do not restart it solely because its observations timed out. User localhost CAD
storage was not accessed or changed.

## Existing production stack recovered

The initial read-only runtime check found `metardu-app` in Created state, with
the existing migration service exited after refusing modified migration 052.
The database retained 109 applied migration records. Read-only comparison using
the production runner's existing line-ending equivalence rules confirms:

- Corrected source: all 109 applied versions match; migration
  `105_marketing_email_deliveries.sql` is pending.
- Failed migration container: original 052 bytes are wrong, and 105 is pending.
- Existing application image `44106f7a461e7e4d204f4416744ca2852cbf2ef94b5fbc15ea35d31dd9d1f5d6`:
  109 matching artifacts, no missing/pending migrations.

The same application container `b1c267d1374a` was started on that existing
verified image. Its own restricted-role startup verifier passed all 109 hashes,
and the existing web server became healthy. No migration, ledger rewrite,
customer clone, new application container, image, builder or source promotion
was performed. Migration 105 was not applied and no customer email was sent.

The recreated backup sidecar had an older script requiring DATABASE_URL, while
its configuration supplies PGHOST/PGDATABASE/PGUSER/PGPASSWORD. Its first manual
check failed with `DATABASE_URL is not set`. Four synthetic backup regressions
(valid small/large, invalid header, failed dump) passed in this same service.
The old script was preserved locally, and only that script in the existing
backup container was updated with the verified current source and executable
permissions. Its image was not rebuilt: this repair must be included in a later
reviewed build of the same backup service before any container recreation.

A fresh checkpoint completed at **2026-10-13T21:33:38Z**:
`db_20261013_213336.sql.gz` (187 KiB) and
`uploads_20261013_213336.tar.gz` (270 KiB), in the existing backup volume.
The 36,500-day retention override preserved all existing archives. Database gzip
and SQL-header integrity passed; a fresh database restore was not performed.
Offsite/disaster recovery remains a separate requirement.

The final `npm run docker:verify` passed: application, database, Redis, worker,
collaboration and NTRIP healthy; backup running with recent completion;
production HTTP/database/Redis checks passed; one application container and no
dated verification images/builders. No blanket cleanup or disk compaction ran.

## Remaining release and engineering work

The contour and volume source corrections are not yet in the production image.
A later promotion must review migration 105, preserve current verified rollback
and recovery evidence, and package the correct historical SQL bytes. Do not rerun
the failed migration container as a health check. Its inputs remain incompatible.

Fresh contour browser/export inspection, independent field observations,
horizontal/vertical control, breakline completeness and project specifications
remain necessary for issued work. The project road Step6 output still contains
independent UI area/curve calculations, missing-design-level defaults and an
incomplete station-entry workflow; that is an open substantive engineering task.
TIN reference-plane volume separation for mixed cut/fill triangles and the
legacy simplified overhaul estimate also require their own analytical review.
The broader drainage, OAuth/provider, ChatGPT consent/public HTTPS/listing,
payment, receiver/field and professional certification gates remain open.
