/** @jest-environment jsdom */
import corners from '../data/cassini/subsheet-data.cjs'
import { act, renderHook } from '@testing-library/react'
import { InputForm } from '@/app/tools/cassini-utm/InputForm'
import { render, screen } from '@testing-library/react'
import { projectedResultToWgs84 } from '@/lib/geo/cassini/verify'
import { useCassiniUtmState } from '@/app/tools/cassini-utm/useCassiniUtmState'

test('clearing custom transformation parameters cannot silently calculate with defaults', async () => {
  const { result, unmount } = renderHook(() => useCassiniUtmState())
  act(() => {
    result.current.setUseCustomParams(true)
    result.current.setCustomP('')
    result.current.setSingleE('12345.6')
    result.current.setSingleN('-65432.1')
  })
  await act(async () => { await result.current.handleSingleConvert() })
  expect(result.current.singleResult).toBeNull()
  expect(result.current.conversionError).toContain('finite')
  act(() => {
    result.current.setCustomP('0')
    result.current.setCustomQ('0')
    result.current.setBatchText('SYN,12345.6,-65432.1')
  })
  await act(async () => { await result.current.handleBatchConvert() })
  expect(result.current.batchResults).toEqual([])
  expect(result.current.batchErrors.join(' ')).toContain('non-singular')
  unmount()
})


test('editing a model clears an old conversion before it can be copied as the new model', async () => {
  const { result, unmount } = renderHook(() => useCassiniUtmState())
  act(() => { result.current.setUseCustomParams(true); result.current.setSingleE('12345.6'); result.current.setSingleN('-65432.1') })
  await act(async () => { await result.current.handleSingleConvert() })
  expect(result.current.singleResult).not.toBeNull()
  act(() => { result.current.setCustomQ('0.002') })
  expect(result.current.singleResult).toBeNull()
  unmount()
})


test('batch and single conversions honor the same selected affine model', async () => {
  const sheetId = '148/1'
  const controls = Object.values(corners[sheetId])[0]
  const e = controls.reduce((sum, c) => sum + c.cassX, 0) / controls.length
  const n = controls.reduce((sum, c) => sum + c.cassY, 0) / controls.length
  const { result, unmount } = renderHook(() => useCassiniUtmState())
  act(() => {
    result.current.setSelectedSheetId(sheetId)
    result.current.setTransformMethod('affine6')
    result.current.setSingleE(String(e)); result.current.setSingleN(String(n))
    result.current.setBatchText(`SYN,${e},${n}`)
  })
  await act(async () => { await result.current.handleSingleConvert() })
  const single = result.current.singleResult
  expect(single).not.toBeNull()
  await act(async () => { await result.current.handleBatchConvert() })
  expect(result.current.batchResults).toHaveLength(1)
  expect(result.current.batchResults[0].utmE).toBe(single?.utmE)
  expect(result.current.batchResults[0].utmN).toBe(single?.utmN)
  unmount()
})


test('an unavailable batch sub-sheet cannot silently fall back to another model', async () => {
  const { result, unmount } = renderHook(() => useCassiniUtmState())
  act(() => { result.current.setSelectedSubSheetId('SYN-NOT-AVAILABLE'); result.current.setBatchText('SYN,12345.6,-65432.1') })
  await act(async () => { await result.current.handleBatchConvert() })
  expect(result.current.batchResults).toEqual([])
  expect(result.current.batchErrors.join(' ')).toContain('unavailable')
  unmount()
})


test('geographic output uses an explicit grid and never assumes zone 37', () => {
  const west = projectedResultToWgs84(500000, 9800000, 'EPSG:' + 32736)
  const east = projectedResultToWgs84(500000, 9800000, 'EPSG:' + 32737)
  expect(west.lon).toBeCloseTo(33, 8)
  expect(east.lon).toBeCloseTo(39, 8)
  expect(west.lat).toBeCloseTo(east.lat, 8)
  expect(() => projectedResultToWgs84(500000, 9800000, 'EPSG:3857')).toThrow()
})
test('conversion labels expose actual units without literal template code', () => {
  function Fixture() { const state = useCassiniUtmState(); return <InputForm {...state} /> }
  const mounted = render(<Fixture />)
  expect(screen.getByLabelText('Easting (ft)')).toBeVisible()
  expect(screen.getByLabelText('Northing (ft)')).toBeVisible()
  mounted.unmount()
})
