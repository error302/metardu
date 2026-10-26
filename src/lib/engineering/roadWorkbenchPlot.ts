/** Plot axes describe the rendered coordinates, including aspect-ratio padding. */
export function roadWorkbenchPlot(
  points: readonly [number, number][],
  equalAxes: boolean,
  viewportWidth = 800,
) {
  if (!points.length || points.some((p) => !p.every(Number.isFinite)))
    throw Error('A plot requires finite source coordinates.')
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1])
  const loX = Math.min(...xs),
    hiX = Math.max(...xs),
    loY = Math.min(...ys),
    hiY = Math.max(...ys)
  const width = hiX - loX || 1,
    height = hiY - loY || 1
  if (!Number.isFinite(viewportWidth) || viewportWidth < 240)
    throw Error('The plot viewport is too narrow.')
  const drawingWidth = viewportWidth - 140
  const scale = equalAxes ? Math.min(drawingWidth / width, 200 / height) : null
  const spanX = scale === null ? width : drawingWidth / scale,
    spanY = scale === null ? height : 200 / scale
  const xMin = loX - (spanX - (hiX - loX)) / 2,
    yMin = loY - (spanY - (hiY - loY)) / 2
  const xMax = xMin + spanX,
    yMax = yMin + spanY
  const project = ([x, y]: [number, number]) =>
    [
      112 + ((x - xMin) / spanX) * drawingWidth,
      240 - ((y - yMin) / spanY) * 200,
    ] as [number, number]
  const chainageAt = (pixel: number) =>
    xMin + Math.max(0, Math.min(1, (pixel - 112) / drawingWidth)) * spanX
  return {
    xMin,
    xMax,
    yMin,
    yMax,
    project,
    chainageAt,
    right: viewportWidth - 28,
  }
}
