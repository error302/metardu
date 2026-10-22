# 3D upload integrity audit

22 October 2026. Original audit at checkout `113a04cf` with unrelated
chainage/corridor source edits preserved. The user subsequently approved the
bounded source-only repair below; its implementation and verification are
recorded after the original observations. No deployment is included.

## Confirmed source behavior

The Fallow review identified a `fileRouter` / `parse3D` cycle. Tracing that path
revealed a larger trust issue: the upload API turns parser `building` arrays into
displayed floor/wall counts, although the 3D parser invents those objects from
mesh extents rather than observed building semantics.

An ignored in-memory audit transpiled the actual `parse3D.ts` source using the
installed TypeScript compiler. It supplied the actual scoring function extracted
from `fileRouter.ts`, avoiding loading that higher-level router's other parsers.
GLTF probes used the installed real Three.js and GLTFLoader, without mocking
geometry. A controlled fetch interceptor recorded and rejected all attempted
resource requests; no actual network request was sent. No customer input,
browser storage, source file or production service was modified.

| Synthetic source | Actual result |
| --- | --- |
| Empty OBJ | Success, 0–10 placeholder bounds, meters, invented ground floor with non-finite elevation, confidence 0.5 |
| Comment-only OBJ (nonempty upload) | Same fabricated success |
| OBJ `v 1oops 2 3` | Accepts `1oops` as coordinate 1, invents ground floor |
| OBJ `v NaN 2 3` | Success with placeholder bounds and a ground floor |
| OBJ vertices `(1,2,3)` and `(4,8,9)` | Assumes meters and creates floors at 2 and 5 without source floor records |
| glTF empty scene | Success, invented ground floor, confidence about 0.4125 |
| glTF referencing external buffer | Calls fetch for the model-supplied HTTP URL; the audit interceptor rejects it and the wrapper returns a parse error |

JSON serializes the first OBJ probe's non-finite floor elevation as null; it was
not a valid observed null height. These are parser-level synthetic observations,
not authenticated API, browser, production or real-world model acceptance.

The nonempty comment-only example passes the upload route's file-size guard.
`summarizeParsedInput` considers an empty errors array successful and converts
the fabricated `building` arrays into counts. The UploadZone consumer displays
those counts and the numeric confidence. The glTF resource observation establishes
unrestricted attempted resource loading in this controlled source path; it is not
proof that any particular production host or metadata service is reachable.

The [glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#coordinate-system-and-units)
defines model-space Y-up axes and meters. Those conventions do not establish a
project CRS, site north orientation or floor semantics. The current glTF bounding
code also maps vertical Y into northing, while its inferred floor count uses Z.
The specification permits [resource URIs](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#uris);
a server accepting a single uploaded model must enforce its own loading policy.

## Bounded proposed repair

Keep the existing parser/upload-summary interface. Reject empty/invalid/non-finite
OBJ vertices and empty/invalid native glTF geometry. For valid inputs, inventory
observed vertices/meshes and finite model-space X/Y/Z bounds through the existing
text-preview result, retaining the source filename and explicit format/units
limitations. Do not invent floors, walls, dimensions, CRS or semantic confidence.
OBJ model units remain unknown. glTF model-space meters and Y-up are identified
as format conventions, not surveyed coordinates. No surveyed geometry is created
without an explicit reviewed mapping to the project reference system.

Continue using the native glTF loader for actual model decoding. Require
self-contained model resources and reject model-supplied external resource loads
before fetch. Catch callback/load failures deterministically and remove the
parser's dependency on the higher-level router/scoring function. Keep validation
bounded by the existing upload limits; remove the extent-driven floor allocation.

Add focused regressions for malformed/partial/non-finite coordinates, no vertices,
large finite extents, native self-contained glTF/GLB controls, scene/node transforms,
external-resource rejection without requests, parser errors and upload-summary
output. Preserve successful parsing of supported valid self-contained geometry.
This is a repair of reported import evidence, not a replacement 3D editor or a
claim of CAD/BIM semantics, georeferencing, browser rendering or field accuracy.

The user explicitly approved this bounded source-only design. No deployment,
real-model upload or customer storage change is included. Original ignored
evidence: `.cache/parser-3d-audit.mjs` and `.cache/parser-3d-audit.json` (seven
executed synthetic probes). Original source SHA-256:
`2e3b94bc46ecbb0e85394fc838a4943ccd2b81d17e23caacab7de3e9577f609e`.

## Approved repair and verified behavior

The parser now returns the existing text-preview result for observed model
inventory, with no fabricated `building` output. The upload-summary consumer
therefore receives no invented floor/wall counts and presents extracted text
rather than an arbitrary confidence percentage. Source filename, file metadata,
format, finite X/Y/Z component bounds and supported native geometry counts are
retained in that inventory. OBJ units remain unknown. glTF bounds apply native
node and instance transforms and retain model-space conventions; they are not
mapped into a project CRS. Texture/material appearance and animation playback
are explicitly outside this inventory.

OBJ tokens must be complete finite numbers. Empty/vertex-free input is an error;
large extents do not create inferred floors. glTF/GLB container and resource
checks run before native decoding, reject null/non-finite transform components,
invalid child references/multiple parents/cycles and unsupported required
extensions. Native glTF decoding remains in use. Embedded buffers are decoded
through a scoped transport without fetch or browser ProgressEvent globals;
external resources are refused before loading. Geometry-only material handling
avoids loading texture appearance. All scoped geometry/material allocations
available after native parsing are disposed after inventory.

Mesh, line and point geometry are supported, including instanced mesh transforms.
Processing is limited to **10,000,000 position samples across geometry instances**,
in addition to the existing 100 MB file limit. Exceeding the limit returns an
error, not truncated or approximate bounds. The limit prevents compact instance
data from multiplying vertex processing without a bound; it is not a proof of
memory/CPU isolation for every hostile model. Compressed geometry requiring an
unconfigured decoder and unknown required extensions are rejected explicitly.

The maintained command `node --test tests/parser-3d-integrity.test.mjs` passes
**30 tests, zero skipped**, using the actual transpiled source and installed
Three.js/GLTFLoader. Native geometry decoding is real; the loader subclass only
counts parse invocations, and a restored-after-each-case fetch interceptor
rejects all requests. The first 17 cases failed against unchanged source before
repair. Further tests reproduced null-transform coercion, missing instance
transforms, compact instance multiplication, silently ignored required semantics
and native recursion on a cyclic hierarchy before their respective corrections.
The cyclic example produced a caught stack-overflow error; the repair rejects
it before any native parse invocation. No network reachability is claimed.

Positive fixtures cover finite local OBJ data, transformed self-contained glTF,
binary GLB, embedded textures without appearance decoding, point/line primitives
and GPU mesh instancing. Negative fixtures cover partial/non-finite coordinates,
missing geometry, malformed transforms, non-finite buffer positions, external
buffer/image references, truncated GLB, unsupported required extensions, cycles
and processing-budget rejection. These are original synthetic fixtures, not
professional BIM or surveyed control models.

Three adjacent Jest suites pass **9 tests**. Full application TypeScript and a
separate strict parser type check pass; scoped ESLint, Node test syntax, CI YAML
parsing and scoped whitespace checks pass. A final Fallow architecture run
reports **four** cycles, with the parser/router cycle absent. The four other
cycles and unconfigured boundary/policy diagnostics remain open. The existing
Jest CI job runs the native parser command after dependencies are installed;
GitHub-hosted execution remains unverified. Local native execution used the host
Node runtime, not a promoted application artifact.

The first type check caught an optional callback invocation; it was corrected,
then the final full and scoped checks passed. One initial probe could not start
because a local tsx launcher was absent; it supplied no parser evidence. An
initial Fallow follow-up rejected a report label containing a digit; the corrected
invocation completed, and the final graph report completed separately.

Release/acceptance gaps remain: complete glTF schema/extension conformance,
large/adversarial resource workloads, Next production artifact compatibility,
authenticated browser upload/render behavior, representative customer models,
survey georeferencing and actual field acceptance. This repair does not claim
those gates are complete. No database, browser storage, customer file, migration
or production service was changed by this work.

Additional ignored evidence: `.cache/parser-3d-{red,edge-red,final,jest}.log`,
`parser-3d-typecheck-final.log`, `parser-3d-scoped-typecheck.log`, and
`.cache/fallow-analysis/final-model.{json,metadata.json,stderr.log}`. The final
parser source SHA-256 is
`85b67fcfb6a65282fe42ed3614c265911c23c50253a7322aafdfc0539f734b0e`.
