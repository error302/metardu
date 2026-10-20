import { act, renderHook } from '@testing-library/react'
import GeoJSON from 'ol/format/GeoJSON'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorSource from 'ol/source/Vector'
import { useMapInteractions } from '../useMapInteractions'
const surveyCrs = 'EPSG:32737'

it('downloads a GeoJSON object that a normal reader can parse once', async () => {
  const feature = new Feature({ geometry: new Point([0, 0]), name: 'Synthetic draft point' })
  const params = {
    currentSurveyCrs: surveyCrs, mapInstance: { current: null },
    drawSourceRef: { current: new VectorSource({ features: [feature] }) },
    hasFeature: () => true, setSaveMsg: jest.fn(),
  } as unknown as Parameters<typeof useMapInteractions>[0]
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  let captured: Blob | undefined
  URL.createObjectURL = jest.fn(blob => { captured = blob as Blob; return 'blob:simulation-export' })
  URL.revokeObjectURL = jest.fn()
  const { result } = renderHook(() => useMapInteractions(params))
  await act(async () => result.current.exportFeatures('GeoJSON'))
  if (!captured) throw new Error('No GeoJSON blob was downloaded')
  const exported = captured
  const contents = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(exported)
  })
  expect((JSON.parse(contents) as { type: string }).type).toBe('FeatureCollection')
  expect(new GeoJSON().readFeatures(contents)[0].get('name')).toBe('Synthetic draft point')
  expect(click).toHaveBeenCalledTimes(1)
  click.mockRestore()
})
