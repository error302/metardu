# Curved-road section rates and profile arithmetic

27 October 2026. Source, synthetic arithmetic and component checkpoint.
No production promotion, complete terrain volume or field acceptance.

Continuous terrain coverage alone cannot justify a total road volume. A curved
route also needs lateral first moments and signed curvature. The shared core now
has a prepared retained-terrain section sampler for that calculation. It uses the
saved horizontal and vertical design, actual retained triangle intersections,
template and nearest daylight geometry. It returns local review values rather
than a total. The workspace's whole-road terrain volumes remain **Unassessed**.

## Calculation and source

Offsets t are positive right; signed curvature k is positive for a right turn.
For grid arc length s and X(s,t) = P(s) + t Nright(s), differentiating the tangent
and normal gives X_s = (1-k t) T and X_t = Nright. The local plan Jacobian is
1-k t while it remains positive. Consequently each cut/fill volume rate is
A-k M, where A is section area and M is its signed lateral first moment.

The general change-of-variables basis is documented in
[NIST DLMF, Jacobians and Change of Variables](https://dlmf.nist.gov/1.5#vi).
The road-specific formula above is the derivation applied here; that reference
does not certify this software or its surveying outputs.

`integrateProfileSweep` integrates each separated piecewise-linear depth exactly
in real arithmetic, subject to Float64 evaluation. Positive Bernstein-product
terms avoid cancellation in the rate near an inner offset radius. Signed first
moments and rates use compensated accumulation. Areas are m², moments m³ and
rates m³ per metre of grid centreline; a rate is not a total volume. A folded or
numerically singular offset map is refused, rather than using an absolute
Jacobian to conceal it. The positivity guard is 64 Float64 epsilons times the
offset/curvature scale, not an instrument tolerance or global overlap proof.

`roadHorizontalCurvature` evaluates tangent, circular and clothoid entry/exit
curvature, including both turn directions. Callers explicitly choose the before
or after derivative at circular PC/PT jumps. Outward endpoint derivatives are
unknown. Existing horizontal station outputs retain their established shape.

`prepareRoadTerrainSectionSampler` copies only consumed road/reference/terrain
inputs and builds the geometry once. Its canonical source key includes actual
supplied mesh coordinates/faces as well as the selected identity, so caller
mutation cannot change a prepared calculation. It requires the binding's exact
identity, matching declared metre/grid/height reference, full vertical coverage,
complete shoulders, actual terrain coverage and daylight at each requested
section. It does not overwrite or adopt original measured stations.

Matching claimed metadata in this pure kernel is not authentication. A future
saved quantity command must obtain the terrain through the existing validated,
owner-bound retained-revision reader, revalidate source evidence transactionally
and bind its actual inputs/outcomes. This kernel adds no server write or approval.

## Numerical corrections and history

The existing profile separator multiplied endpoint residuals to test their signs.
Tiny opposite residuals could underflow and incorrectly lose separated cut/fill.
The daylight solver's same-sign product could similarly invent a crossing.
Both now compare signs directly and normalize crossing ratios before multiplying
by interval length. Unresolvable crossings and nonfinite residuals fail closed.
These are synthetic numerical edge cases, not evidence of a particular field job
being affected.

New average-end-area quantity runs use version **1.0.1** for these corrections.
That method still expressly excludes curvature corrections and material factors;
the new section-rate kernel does not silently change its basis. Archive readers
admit only the exact known 1.0.0 and 1.0.1 versions with the existing payload,
input and result hash checks. Old values, hashes, versions and request identities
are retained on read/retry. The register and derived CSV label earlier arithmetic
for review and a new draft; no stored archive is automatically upgraded.

## Evidence

- 461 tests in 50 suites pass, including the road/recovery/terrain/register
  regression plus adjacent shared-profile and chainage consumers.
- Failing-before/passing-after tests cover missing sweep/curvature/sampler
  operations, lost tiny cut/fill, invented tiny daylight, older archive admission
  and its missing UI notice. Signed derivatives agree with independently sampled
  heading differences in both curve types; endpoint sides are explicit.
- The opt-in numerical Jest fixture emits 69 deterministic native cases. The
  separate Python verifier uses exact Fraction interpolation, zero roots and
  polynomial area/moment antiderivatives, then A-k M for the rate. All 414 scalar
  comparisons pass, including mixed profiles, signed offsets, large height/offset
  shifts and extreme finite depth scales. This is independently implemented
  arithmetic verification by this project, not independent professional review.
- The comparison threshold is 5e-11 of the absolute reference contribution scale
  plus 1e-320. It distinguishes tiny nonzero results from zero; it is not an
  accuracy specification. Source and verifier hashes are retained in
  `.cache/road-section-sweep/numerical-independent.json`.
- Application/test TypeScript, 15-file ESLint, the security gate and existing
  production/support runtime health pass. Revision-bound receipts and exact
  manifests are in `.cache/road-section-sweep/source-checks.json`.

Reproduce the arithmetic fixture with `METARDU_ROAD_SWEEP_EVIDENCE=1` and the
`profileSweepNumerical.test.ts` Jest test, then run
`python scripts/verify-road-profile-sweep.py` from the checkout. No database,
network, browser, fixture account, billing state or customer data is mutated.

This checkpoint has no fresh authenticated browser, native database, provider,
physical phone, worker-computation, CAD/print or field proof. Earlier receipts
retain their own source scope. No migration, container, build, push or promotion
was performed. Backup archive/header success still does not prove restoration.

## Remaining gates

Whole-road terrain integration still needs event-aware subdivision, defensible
error/convergence bounds, daylight across the complete route, and global corridor
injectivity/overlap treatment. Matching a few section rates cannot establish those
requirements. Quantity source/outcome persistence and issued revision delivery
remain separate work. Preserve the existing non-UTM admission, legacy durable
reference/mirror consistency, ward-scale collaboration, independent surveyor/
field/CAD/print, admin/physical phone/provider/paid, rejected customer clone/
restore, worker artifact, owner-deferred signing-key and coherent promotion/
rollback gates. Preserve Cloudflare containment and the localhost training CAD.
