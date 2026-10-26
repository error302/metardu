import { roadWorkbenchSection, type RoadWorkbenchModel } from './roadWorkbench'
export interface RoadScenePoint {
  easting: number
  northing: number
  elevation: number
}
/** Two batched draw calls replace thousands of individual section objects. */
export function roadWorkbenchLineSegments(
  paths: readonly (readonly RoadScenePoint[])[],
  origin: RoadScenePoint,
) {
  const values: number[] = []
  for (const path of paths)
    for (let i = 1; i < path.length; i++)
      for (const p of [path[i - 1], path[i]])
        values.push(
          p.easting - origin.easting,
          p.elevation - origin.elevation,
          origin.northing - p.northing,
        )
  return new Float32Array(values)
}
/** Formation mesh only. Measured sections remain lines; no terrain surface is invented. */
export function buildRoadWorkbenchScene(model: RoadWorkbenchModel) {
  const deck: RoadScenePoint[] = [],
    groundPaths: RoadScenePoint[][] = [],
    formationPaths: RoadScenePoint[][] = []
  const t = model.road?.crossSectionTemplate
  if (!t || !model.reference.verticalDatum?.trim())
    return { deck, groundPaths, formationPaths, origin: null }
  const half = t.carriagewayWidth / 2,
    outer = half + t.shoulderWidth,
    offsets = [...new Set([-outer, -half, 0, half, outer])]
  let previous: RoadScenePoint[] | null = null,
    origin: RoadScenePoint | null = null
  for (const p of model.plan) {
    const section = roadWorkbenchSection(model, p.chainage)
    if (section.measured) {
      if (section.worldGround.length > 1) groundPaths.push(section.worldGround)
      if (section.worldFormation.length > 1)
        formationPaths.push(section.worldFormation)
    }
    origin ??= section.worldFormation[0] ?? section.worldGround[0] ?? null
    const row = offsets.map((offset) =>
      section.worldFormation.find((p) => p.offset === offset),
    )
    if (row.some((p) => p === undefined)) {
      previous = null
      continue
    }
    const complete = row.filter(
      (p): p is NonNullable<typeof p> => p !== undefined,
    )
    if (previous)
      for (let i = 0; i < complete.length - 1; i++)
        deck.push(
          previous[i],
          previous[i + 1],
          complete[i],
          previous[i + 1],
          complete[i + 1],
          complete[i],
        )
    previous = complete
  }
  return { deck, groundPaths, formationPaths, origin }
}
