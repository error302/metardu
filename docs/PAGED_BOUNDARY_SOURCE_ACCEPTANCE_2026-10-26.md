# Paged boundary-source review and retained delivery

26 October 2026, Africa/Nairobi. This source checkpoint removes the former
500-coordinate source barrier for the existing retained-traverse workflow. It
does not establish ward-scale production capacity or field acceptance.

## Surveyor workflow

A source can now contain up to **2,001 coordinates and 2,000 observations**.
The boundary reviewer requests 50 coordinates at a time, searches labels or
IDs with a case-insensitive literal substring filter, and carries selected
vertices between pages. Display order never establishes a boundary. The
surveyor explicitly chooses and arranges up to 500 boundary vertices.

Page metadata states the total source count, matching count, current page and
filter. A zero-match search is distinct from an empty source. Failed reads keep
the last confirmed rows and chosen vertices, disable review/save, and retry the
requested page. A changed source fingerprint clears the old choices and demands
review. Contradictory coordinate values under the same fingerprint refuse rather
than overwrite an already-selected point. The chosen-vertex cache stays bounded
at 500 entries; it is separate from the current coordinate window.

Every page is derived from the complete validated source. The fingerprint is
computed before filtering/paging and includes the full source, retained revision
evidence, reference and parcel state. Saving locks and reloads that complete
source, resolves only the submitted ordered IDs, and retains **all** source
coordinates and original observations in the boundary snapshot. It does not
save a polygon reconstructed from a clipped list. Changes to an unselected
source coordinate still invalidate downstream review.

The existing 4 MiB complete-source budget, 64 KiB command budget and issued /
confirmed-parcel safeguards remain. Sources above 2,001 coordinates refuse rather
than truncate. This is aligned with the current retained-intake limit; increasing
it further requires the broader chunked/background and capacity work.

## API and compatibility

The owner-bound boundary endpoint accepts `coordinate_page` and optional
`coordinate_q` only when selecting one explicit `traverse_id`. It returns
`pointWindow` metadata with the coordinate slice. Unknown/duplicate parameters,
empty identifiers, out-of-range pages and mixed directory/receipt/coordinate
requests refuse. Pages are not silently clamped into a different selection.

Existing unpaged reads of sources with at most 500 points remain complete. Larger
sources require an explicit coordinate page: an old reader cannot silently
mistake a partial response for the complete source. The current UI always asks
for the coordinate window. No migration or applied-hash edit is required for this
change. Existing receipt, snapshot and map/export stale-state checks are reused.

## Verification

- Four initial UI failures reproduced missing server paging/search, loss of
  selections on page transitions and retry, before their fixes. The native
  regression reproduced the old `413` refusal of a 2,001-coordinate source.
- **164 tests in 15 suites pass**, including cross-page selection, exact ordered
  submission, changed/inconsistent source responses, failed-page recovery,
  incomplete/duplicate window rejection and adjacent map/export/share behavior.
  App and test type checks pass. ESLint passes all six changed TS/TSX paths with
  zero errors/warnings. `git diff --check` passes.
- The retention verifier passes **40 native checks**. Its new scenario walks
  all 41 pages, checks all 2,001 IDs exactly once, searches the last observed
  target, distinguishes no matches, refuses foreign/mixed/out-of-range access,
  and saves four corner IDs. The snapshot retains all 2,001 coordinates and
  2,000 observations. A rolled-back, exactly scoped tamper rehearsal changes an
  unselected coordinate and observes `changed_since_review`.
- In that synthetic host profile, maximum page transport was **7,816 bytes**;
  total page transport was 309,638 bytes and the complete retained snapshot was
  2,854,002 bytes. The receipt times the page walk and subsequent search,
  admission, save and tamper probes; initial retained computation and the first
  source read occur before that timer. This is not a million-observation
  throughput benchmark. Server validation still reads and checks the complete
  bounded source for each request.
- The adjacent verifier passes **155 native checks**, including the continuous
  job. That job's later revision now contains 2,000 paired-angle observations and
  2,001 coordinates. It selects four corners across the complete source, stores
  and recovers a second DXF/GeoJSON pair, and preserves the first pair and its
  earlier controlled share. Final counts are two observation revisions, two
  boundary drafts, four registered exports/files and one revoked grant.
- Independent ezdxf/GEOS/PROJ checks inspect both actual file pairs, the original
  CSV mappings and retained input/result hashes. Both DXFs have zero audit errors
  or repairs and exactly match their retained polygons. For the dense epoch,
  independently calculated rectangle coordinates agree within `2e-6 m` and area
  within `0.001 m²`; these allow floating-point accumulation over 500 steps per
  side. Geographic conversion agrees within `1e-8 degrees`. These are numerical
  comparison tolerances, not instrument or field accuracy claims.

Commands:

```powershell
npm run typecheck
node scripts/verify-reviewed-boundary.mjs traverse
node scripts/verify-reviewed-boundary.mjs share
& 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/verify-retained-journey-artifacts.py
```

Native checks use the existing identity-checked loopback rehearsal database and
an exact marked disposable schema. Their source-bound receipts confirm cleanup,
unchanged original records and an unchanged public migration ledger. Real route,
SQL, PostGIS and storage behavior runs, with bounded authentication/paid-feature
adapters; ordinary-account HTTP and provider acceptance remain separate.

Evidence:

- `.cache/traverse-retention/native.json`, `paged-regression.json`,
  `paged-typecheck.log`, `paged-eslint.json`: source/window proof and profile.
- `.cache/parcel-draft-sharing/native.json`, `journey-proof.json`,
  `journey-independent.json`: continuous retained delivery and independent checks.
- `journey-dense-original.csv`, canonical dense command/result, dense receipt and
  boundary, `journey-dense.dxf`, `journey-dense.geojson` and both source manifests
  in that same directory: the actual later-epoch examples.

## Remaining acceptance

The full million-observation / 10,000-parcel / 100-package / 20-session target,
crew permissions and concurrent/offline job handling remain open. This checkpoint
does not remove the 500 chosen-vertex limit, the intake/byte limits or the bounded
selected-export budgets. It does not parse arbitrary instrument formats or solve
unreviewed station setups. The sample observations are synthetic and their
transcription is explicit; heights and closure evidence remain unknown.

Authenticated browser/phone/admin, real instrument/controller files, independent
surveyor, receiving-CAD/GIS and paper/field acceptance remain required. Customer
clone/restore admission, worker artifact alignment, the deferred signing-key
rotation, provider/payment checks and coherent release gates remain open. Keep
the public-parcel Cloudflare containment. No customer schema, production service,
provider/entitlement state or localhost training drawing was changed. The broader
production and international-adoption goal remains active.
