# CAD topology verification — 10 October 2026

## Production proof completed on 11 October

The corrected production image 650c1a18... passes the actual CUA worker check
at owned 127.0.0.1:3000. Six explicit synthetic points and seven lines produced
two 100 m square faces: 10,000 m² and 400 m boundary each, 20,000 m² total and 700 m unique
linework. The declared EPSG:32636 / one-metre canvas frame preserved supplied
coordinates. Normal controls and commands were used; no page storage or runtime
heap was injected, and the localhost training drawing was untouched.

Evidence: test-results/cad-topology/production-worker-full.png,
production-worker.txt and production-worker-proof.json. The QA tab is a retained
deliverable. Earlier deployment/browser-gap statements below are historical;
production behavior for this synthetic geometry is proved. Physical survey
accuracy, receiver/mobile/offline workflows, printed scale and legal acceptance
remain separate gates. See docs/PRODUCTION_VERIFICATION_2026-10-11.md.

Current source passes the six focused suites: **70 tests**. Scoped CAD lint,
strict application types and test types pass. Logs are in
`.cache/release-verify/cad-topology-*-20261010.log`. A separate fixture-export
test passed and wrote actual source-engine results for independent comparison.

The source engine was compared with Shapely 2.1.2 / GEOS 3.13.1, using raw input
edges rather than feeding engine-produced face rings to the polygonizer.
[Shapely's published package](https://pypi.org/project/shapely/2.1.2/) documents
its native GEOS geometry basis. The verifier is installed only in the existing
workspace-local Python verification target; application dependencies were not
reinstalled. Python 3.12 from the bundled runtime was used.

| Synthetic input | Independent result | Source agrees |
| --- | --- | --- |
| Adjacent 100 m squares, shared edge | Two faces; 20,000 m² total; 700 m unique network; 400 m per face | Yes |
| Nested 100 m / 50 m rings | 7,500 + 2,500 m² faces; 10,000 m² total; 600 m network | Yes |
| Square and dangling edge | One face; 10,000 m²; 500 m network; one unenclosed edge; mixed status | Yes |
| Disconnected squares | Two faces; 20,000 m²; 800 m network | Yes |
| Half-metre drawing calibration | 2,500 m²; 200 m network; drawing basis | Yes |
| Unscaled drawing | Bounded topology exists; all metre areas/perimeters/lengths unavailable | Yes |
| Unsplit crossing | Native intersection found; source invalid; no area claimed | Yes |
| Unsplit T-junction | Native intersection found; source invalid; no area claimed | Yes |

Native/source comparisons use absolute tolerance 0.000001 (square metres for
areas, metres for lengths), with relative tolerance disabled. Face geometries
are independently checked for equality; cut/dangle counts and status agree.
Unknown-scale native quantities are drawing units, not metres.

Evidence: `test-results/cad-topology/source-engine.json` and
`native-verification.json`. Reproduce the source bridge with Jest's
`tests/cad-topology-native-fixtures.test.ts`, then run
`scripts/verify-cad-topology-native.py` using the workspace-local verifier path.

## Browser and release boundary

CUA initialization/connection failed three times: surface inventory, the known
isolated tab, and browser selection each timed out and reset the tool runtime.
No browser action, storage injection or alternate automation channel was used.
The user's localhost Bomet training drawing remains untouched.

Later in this continuing session, CUA recovered. A new owned tab reopened the
same isolated origin and recovered the exact synthetic QA drawing with its
staged QA-A control. The known EPSG:32636 / one-metre canvas reference was applied
through the UI; supplied coordinates were preserved. Five explicit PT controls
and seven LINE commands formed the two squares. The real browser worker reported
**two faces, 20,000.00 m² total, 2.0000 ha and 700.00 m unique linework**. The
expanded schedule reported 10,000.00 m² and 400.00 m perimeter for each face.
This closes that actual source-browser-worker check and agrees with the native
comparison. No page storage/heap writes or alternate automation channel was used.

Evidence is `test-results/cad-topology/browser-worker.txt` and
`browser-worker-full.png`. The owned QA tab is marked for continuation. The
localhost training origin was not opened or edited. The worker check still does
not establish customer production deployment, physical survey accuracy or printed
scale. The earlier timeouts above remain a historical record of the first attempts.

The current production image predates these source changes. No CAD application
deployment or field/legal accuracy claim is made. Independent surveyor review,
real receiver/mobile/touch checks and professional printed-sheet verification
remain distinct gates.
