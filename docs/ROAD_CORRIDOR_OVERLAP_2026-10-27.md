# Road corridor overlap review

27 October 2026. Source/component checkpoint. No production promotion or
whole-road terrain quantity acceptance.

The terrain workspace now reviews the entire declared-width normal strip for
possible self-overlap, independently of section spacing. Terrain coverage and
corridor separation have distinct statuses. A clear geometric model result does
not turn on a volume total; integration and error acceptance remain open.

## Geometric method

Local positive Jacobians alone cannot exclude a route returning onto another
part of itself. As background, [Durumeric's normal-injectivity work for closed
curves](https://arxiv.org/abs/0706.1037) distinguishes curvature and self-distance
constraints. The open-road assessment here uses its own projection/enclosure
tests, rather than directly applying that closed-curve formula.

`road-normal-strip-separation` version 1.0.0 builds the canonical analytic
alignment from copied inputs. It rejects an unknown reference, invalid width,
local fold/singularity, inconsistent join or unsupported geometry. The half-width
w is explicit and applies to the complete review strip; it is not silently
reduced to selected daylight points.

The method uses a global curvature magnitude bound K and requires wK < 1 with
the existing numerical positivity margin. Each canonical segment is straight or
a monotone-turn circular/clothoid span of less than pi radians. For a monotone
span with total turn Phi < pi, projecting its chord onto the bisecting tangent
gives at least 2 sin(Phi/2)/K, while two width-w normal offsets contribute at most
2w sin(Phi/2). This excludes a collision when wK < 1; the zero-turn case is
straight. This test also handles suitable spans containing adjacent segments.

For arbitrary turn signs, the midpoint-tangent projection excludes collisions
between nearby stations. The implementation conservatively uses arc separation
at most acos((1+wK)/2)/K. Beyond those analytic cases, it requires strict separation
of outward enclosures covering complete station intervals. Contacting enclosures
are subdivided; point samples do not establish a clear result. A crossing, close
return, exact contact, exhausted budget or unresolved separation remains
**Unassessed**. An unresolved enclosure is not labelled a proven intersection.

`roadStripEnclosure` is shared with continuous terrain coverage. For interval
length h, it expands the midpoint tangent rectangle by K h²/8 + w K h/2 in both
axes, plus an outward numerical guard. Bounding boxes precede robust-orientation
separating-axis checks. Boundary contact is not erased by an area tolerance.
The explicit segment evaluator preserves the established global station shape
and permits either segment's endpoint to be evaluated at a join.

This is an assessment of the builder's analytic C1 model. Join admission requires
matching chainages, endpoint distance within max(1e-7 m, 128 Float64 epsilons times
the coordinate scale), and heading difference at most 1e-10 radians. Enclosures
also include their scale-dependent outward guard. These are computational guards,
not survey accuracy statements. A clear result does not certify arbitrary
rounded/discontinuous input paths or rigorous interval-arithmetic uncertainty.
Independent numerical review of the model/join assumptions remains required.

Limits are 1,000 input alignment points, half-width in (0, 500] metres, 2,000,000
pair evaluations, 20,000 cached enclosures and subdivision depth 24. The checker
yields during work and honors cancellation. A 200-IP synthetic work package is
covered by tests; this is not a ward-scale or physical-phone performance claim.

## Workspace and source preservation

Computed terrain mode shows coverage and overlap review inline in the existing
layout. Changing design, width, reference or terrain invalidates previous results;
late cancelled results cannot reappear. Removing terrain, changing project or
leaving computed mode withdraws/cancels those assessments. A new regression
demonstrated stale clear status after a project switch with retained old props;
project identity now scopes both statuses and computed terrain admission.

No measured station, retained mesh, saved binding or project data is altered by
these diagnostics. The pure geometry checker does not authenticate account or
database ownership. The existing retained-revision reader and conditional save
command retain that responsibility. No new write endpoint or fixture was added.

## Evidence and open work

- 496 tests in 52 suites pass, including the prior road/terrain/recovery/quantity
  regression, both curve directions, straight/bent/S/U routes, actual crossing
  and looping routes, close parallel returns, exact contact, invalid/folded widths,
  reference refusal, cancellation and rotation/translation invariance.
- Shared-enclosure tests check 14,544 sampled offset positions against complete
  interval bounds across circular/transition geometry and both turns. These are
  implementation checks of the analytic bound, not a sampling-based proof.
- Component tests cover the real checker through terrain selection, cancellation,
  width/design changes, late old verdicts, terrain removal and project switches.
  Initial missing-status and stale-project regressions were observed failing.
- Application/test TypeScript, nine-file ESLint, security and existing Docker
  runtime checks pass. Receipts/manifests are in
  `.cache/road-corridor-overlap/source-checks.json`. Security retains 119 pinned
  applied migrations; healthy services and backup archive/header evidence do not
  establish restore recovery or deployment of this source.

No fresh authenticated browser, native SQL, worker-computation, provider,
physical-phone, receiving-CAD/print, field or professional acceptance is claimed.
Earlier source/SQL/browser/numerical receipts retain their own revision and
dependency scope and are preserved. No migration, image, container, build, push,
promotion, customer/billing/provider write or CAD-training edit was performed.

Whole-road terrain integration still requires event-aware subdivision, continuous
daylight treatment, error/convergence and uncertainty bounds, independently
accepted corridor assumptions, and revision-bound persistence/delivery. Selected
issued road revisions, non-UTM retained-surface admission, original-observation
reassociation, legacy command/reference and mirror consistency, ward-scale
collaboration, independent surveyor/field/CAD/print, admin/phone/provider/paid,
rejected customer clone/restore, worker artifact, owner-deferred signing-key and
coherent candidate/rollback promotion gates remain open. Preserve Cloudflare
containment and the localhost training drawing.
