import { createAnnotationLayer } from '@/lib/map/annotations'
import { createParcelLayer } from '@/lib/map/layers'

const grid = 'EPSG:32636'
test('real OpenLayers point-only layers contain no invented area annotation or polygon', async () => {
  const annotations = await createAnnotationLayer({ coords3857: [], stations21037: [], epsg: grid })
  const parcel = await createParcelLayer([])
  expect(annotations.getSource()?.getFeatures()).toHaveLength(0)
  expect(parcel.getSource()?.getFeatures()).toHaveLength(0)
})
