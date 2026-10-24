# Reviewed terrain footprints and measured breaklines

Source milestone for the active production-readiness goal. This record does not
certify field accuracy, a statutory survey, a production promotion or an accepted
foreign jurisdiction.

## Resulting workflow

The existing project topographic workspace accepts reviewed outer boundaries,
strictly internal exclusions and separate surveyed regions. Coordinates are
explicit easting/northing pairs in the declared projected project basis and
metres. A named source or field-note reference and an explicit review are
required. No boundary, height, datum or tolerance is inferred from a basemap.

Measured breaklines select existing original observation IDs in line order.
The server resolves their XYZ from the locked, reviewed selection; client XYZ
cannot replace those observations. Zero and negative heights remain measured
values. Line classification is retained; every supplied chain constrains the
TIN. Global legacy breakline records remain intact and unreferenced automatic
reuse stays blocked.

All selected observations support the parent TIN, including observations outside
the outer boundary or inside an exclusion. The page explains this and requires
positive review of that support use. Deselect observations that should not
influence the surface. A footprint controls the retained terrain area; it is
not an automatic ground-classification rule.

Each original TIN face is clipped separately. Clip vertices receive derived
heights on that retained face, rather than refitting or inventing measurements.
The saved result retains the original observation snapshot, the parent mesh,
the clipped mesh, vertex origins, the declared definition and source-chain
provenance. Independent hashes bind those outputs to the exact revision.
Concavities, holes and separate regions remain explicit. Invalid, touching,
self-crossing, uncovered or excessively complex definitions fail closed.

The existing durable-request protocol includes these optional definitions.
Reusing a committed request identity with different terrain geometry is a
conflict. Retained preview and server DXF use the saved revision. The DXF shows
closed green outer boundaries, closed red exclusions, open contours at their
actual RLs, original measured POINT XYZ and whole cyan source 3D breaklines.
Derived vertices and the computed-draft status remain labelled. Editable form
text is not advertised as an autosaved offline field record; definitions become
durable in the prepared request and computed revision.

## Reproduced defects and repairs

The first independent ezdxf check found that the installed writer emitted a
2D parent POLYLINE flag for its 3D API. The XYZ array alone was insufficient
proof. A failing tag-level regression reproduced it. The application now emits
standard parent flag 8 while retaining native handles, owner and vertex flag 32.
Independent parsing then reported a real 3D polyline with all three original
XYZ vertices and no audit repairs.

A malformed retained polygon originally raised an unclassified RangeError.
The read path now returns the same reviewable 409 evidence conflict as other
inconsistent saved outputs, preserving the original record. Tamper regressions
cover domain metadata, definition/normalization, parent mesh, support counts,
basis and measured-chain mapping.

## Verification and limits

The fixed synthetic plane has five original XYZ observations around a 20 m
square. Its reviewed footprint is a 16 m square with a 4 m square exclusion:
240 m2. Integration above reference level -2 m is analytically 480 m3. GEOS via
Shapely independently checks full face coverage, no overlap, exclusion geometry
and this integral. ezdxf independently checks metre units, five source POINTs,
eight derived clip vertices, both rings, four open contour paths, the zero
contour's split endpoints, original 3D source chain and zero audit errors/repairs.
This analytical integral is a test oracle, not a newly accepted production
volume report or field observation.

Native verification uses the existing marked synthetic PostgreSQL service,
an individually owned temporary schema, actual source handlers/SQL/storage and
exact cleanup. Its HTTP/session/ownership wrappers and positive plan decision
are adapted. Real ordinary-account HTTP acceptance is recorded separately.
No paid entitlement, production subscription or provider state is changed.

Current source checks and revision identities are recorded in
`test-results/terrain-domain/receipt.json`. Both strict TypeScript projects,
scoped ESLint and tracked whitespace checks passed. Earlier request-recovery
and topographic evidence remains in its original named bundles.

The focused run passes 118 tests across nine suites. Native SQL/storage runs
pass 52 cases, including exact retry, lost COMMIT acknowledgements, corruption,
concurrent submissions, cleanup and the new terrain cases. Twenty real HTTP
checks use normal login for the existing ordinary free QA identity. They retain
exact revision `6305f3af-6c96-4537-9009-e6e7fcd8cbac` under request
`84e94208-dda1-4ee7-bc3f-266ae3e590ee`, refuse wrong-basis/self-crossing/uncovered
domains and foreign chain IDs, and deny new paid DXF generation. All five
original point rows, the reference, role, subscriptions, file rows and document
register compare unchanged. The verifier respects the existing one-minute rate
window, retaining the same prepared request. Source-preview cold compilation
caused earlier HTTP timeouts; those attempts are not passing evidence.

Chrome 3 could not complete navigation to the owned loopback page, including a
fresh owned tab after compilation. Its visible state remained blank. Component
tests prove the review/request wiring; they do not substitute for actual rendered
desktop/mobile acceptance. No browser success or screenshot of the editor is
claimed in this checkpoint.

Reproduce the scoped checks with the existing source environment:

```powershell
node scripts/verify-surface-revisions.mjs green
node scripts/verify-surface-http.mjs --terrain
& 'C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' scripts/verify-terrain-domain-artifact.py
```

The native verifier validates the exact marked service before creating its owned
schema. The HTTP mode validates the exact synthetic database, account and project
and reuses its saved request. The Python check uses the already installed isolated
Shapely/ezdxf libraries. The receipt recorder refuses mismatched source hashes,
failed checks or inconsistent artifact hashes. It records a source checkpoint,
not a deployment attestation. Do not substitute a customer database or production
URL for these fixtures.

Read-only production verification on 24 October passed: one application,
required supporting services, HTTP/database/Redis health; backup completion
`2026-10-24T02:00:04Z` is archive/header evidence only. The previously stopped,
identity-checked synthetic database and source preview were resumed for this
work; no production lifecycle action, migration or promotion was performed.

## Retained gates

- Actual Chrome review of this new editor, mobile layout, offline/device
  interruption and receiving-CAD/printed-sheet review remain separate evidence.
- Positive paid **server** export through normal HTTP/browser remains open. The
  earlier approved, restored Pro composer fixture is a different path and was
  not recreated. Adapted native plan proof cannot close this gate.
- Physical instruments, independent control, practising-surveyor review and a
  real field-to-finish pilot are required. Synthetic point-chain provenance does
  not prove field coding, calibration or an observed break in slope.
- Additive migration 116 remains subject to migration/rollout review; owned
  fixture-schema proof does not mean it was applied to production.
- Recovery/restore, offsite/provider storage, payment lifecycle, alerts,
  owner-deferred signing-key rotation and a pinned reviewed promotion/rollback
  remain open as recorded in the main goal.
- International adoption needs a separately accepted workflow and jurisdiction.
  The shared core has explicit reference handling; this milestone establishes
  no new national transformation, accuracy standard or cadastral approval.

The broader engineering platform and release goal remain active.
