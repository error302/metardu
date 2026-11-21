/**
 * Capture availability — one rule for when map capture tools may run.
 *
 * A project must be linked before anything is captured: points need a
 * register to land in, and sketches/measurements without a project have
 * nowhere durable to live. A survey CRS is additionally required before
 * sketching or measuring, because those produce survey-plane values.
 * The panel renders this state (disabled tools + reason) instead of
 * letting a tap fail at runtime.
 */
export interface CaptureAvailability {
  projectLinked: boolean
  /** Key-in / instrument / import actions that write to the point register. */
  canRegisterPoints: boolean
  /** Sketch and measure tools that produce geometry on the map. */
  canSketch: boolean
  /** Why capture is unavailable, or null when fully available. */
  reason: string | null
}

export function getCaptureAvailability(input: {
  projectId: string | null
  surveyCrs: string | null
}): CaptureAvailability {
  if (!input.projectId) {
    return {
      projectLinked: false,
      canRegisterPoints: false,
      canSketch: false,
      reason: 'Link a project to capture survey data. Capture tools stay disabled until a project is active.',
    }
  }
  if (!input.surveyCrs) {
    return {
      projectLinked: true,
      canRegisterPoints: true,
      canSketch: false,
      reason: 'Set the survey CRS to sketch or measure on the map. Points can still be keyed into the register.',
    }
  }
  return { projectLinked: true, canRegisterPoints: true, canSketch: true, reason: null }
}
