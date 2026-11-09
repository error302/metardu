import { act, renderHook } from '@testing-library/react'
import { useMapPrintFlow, type UseMapPrintFlowParams } from '../useMapPrintFlow'

jest.mock('@/lib/surveyMapEngine/io/mapViewportPrint', () => ({ captureMapViewport: jest.fn(), mapViewportPdf: jest.fn(), mapViewportPng: jest.fn() }))
import { captureMapViewport, mapViewportPdf, mapViewportPng } from '@/lib/surveyMapEngine/io/mapViewportPrint'

function fixture() {
  const footer = document.createElement('div')
  footer.innerHTML = '<button>i</button><ul><li>Synthetic provider</li></ul>'
  const map = { getView: () => ({ getRotation: () => 0 }) }
  const onError = jest.fn()
  const params = { mapInstance: { current: map }, attributionTargetRef: { current: footer }, drawSourceRef: { current: null }, currentSurveyCrs: null, onError } as unknown as UseMapPrintFlowParams
  return { params, map, onError }
}
it('exports the current frame without opening a sheet or popup on the working map', async () => {
  const f = fixture()
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  URL.createObjectURL = jest.fn(() => 'blob:synthetic-print')
  URL.revokeObjectURL = jest.fn()
  jest.mocked(captureMapViewport).mockResolvedValue(document.createElement('canvas'))
  jest.mocked(mapViewportPdf).mockResolvedValue(new Blob(['synthetic']))
  const { result } = renderHook(() => useMapPrintFlow(f.params))
  await act(async () => result.current.handlePrintMap())
  expect(captureMapViewport).toHaveBeenCalledWith(f.map)
  expect(mapViewportPdf).toHaveBeenCalledWith(expect.objectContaining({ surveyCrs: null, credits: 'Synthetic provider' }), undefined)
  expect(click).toHaveBeenCalledTimes(1)
  expect(result.current.showSheetLayout).toBe(false)
  expect(result.current.isPrinting).toBe(false)
  click.mockRestore()
})
it('downloads a PNG from the same rendered map and passes the requested logo preference', async () => {
  const f = fixture()
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('metardu-current-map.png')
  })
  try {
    URL.createObjectURL = jest.fn(() => 'blob:synthetic-capture')
    URL.revokeObjectURL = jest.fn()
    jest.mocked(captureMapViewport).mockResolvedValue(document.createElement('canvas'))
    jest.mocked(mapViewportPng).mockResolvedValue(new Blob(['synthetic'], { type: 'image/png' }))
    const { result } = renderHook(() => useMapPrintFlow({ ...f.params, useCompanyLogo: true }))
    await act(async () => result.current.captureMap())
    expect(mapViewportPng).toHaveBeenCalledWith(expect.objectContaining({ credits: 'Synthetic provider', useCompanyLogo: true }))
    expect(click).toHaveBeenCalledTimes(1)
  } finally {
    click.mockRestore()
  }
})

it('reports a capture failure without a download or stale sheet overlay', async () => {
  const f = fixture()
  jest.mocked(captureMapViewport).mockRejectedValue(new Error('Source blocks image export'))
  const { result } = renderHook(() => useMapPrintFlow(f.params))
  await act(async () => result.current.handlePrintMap())
  expect(f.onError).toHaveBeenCalledWith('Error: Source blocks image export')
  expect(result.current.showSheetLayout).toBe(false)
  expect(result.current.isPrinting).toBe(false)
})
