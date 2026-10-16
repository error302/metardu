import { act, renderHook } from '@testing-library/react'
import { useMapGpsControl, type MapGpsControlParams } from '../useMapGpsControl'

function fixture() {
  const listeners = new Map<string, Set<() => void>>()
  let tracking = false
  const animate = jest.fn()
  const gps = {
    on: (name: string, fn: () => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)?.add(fn) },
    un: (name: string, fn: () => void) => listeners.get(name)?.delete(fn),
    setTracking: jest.fn((value: boolean) => { tracking = value }), getTracking: () => tracking,
    getPosition: () => [4000000, -100000],
  }
  const params = { mapInstance: { current: { getView: () => ({ animate }) } }, cleanupRef: { current: { geolocation: gps } }, mapReady: true,
    setGpsTracking: jest.fn(), setGpsPos: jest.fn(), setStakeoutActive: jest.fn(), setSaveMsg: jest.fn() } as unknown as MapGpsControlParams
  return { params, gps, animate, emit: (name: string) => [...(listeners.get(name) ?? [])].forEach(fn => fn()), listeners }
}
it('starts only on request and stops without recentering on a late fix', () => {
  const f = fixture(); const { result, unmount } = renderHook(() => useMapGpsControl(f.params))
  expect(f.gps.setTracking).not.toHaveBeenCalled()
  act(() => result.current()); expect(f.gps.getTracking()).toBe(true)
  act(() => result.current()); expect(f.gps.getTracking()).toBe(false)
  act(() => f.emit('change:position')); expect(f.animate).not.toHaveBeenCalled()
  expect(f.params.setGpsPos).toHaveBeenLastCalledWith(null)
  unmount()
})
it('centers once, then leaves later fixes free from forced map-follow', () => {
  const f = fixture(); const { result } = renderHook(() => useMapGpsControl(f.params))
  act(() => result.current()); act(() => { f.emit('change:position'); f.emit('change:position') })
  expect(f.animate).toHaveBeenCalledTimes(1)
})
it('handles actual OL error events, lets the user retry and releases tracking on unmount', () => {
  const f = fixture(); const { result, unmount } = renderHook(() => useMapGpsControl(f.params))
  act(() => result.current()); act(() => f.emit('error'))
  expect(f.gps.getTracking()).toBe(false)
  expect(f.params.setSaveMsg).toHaveBeenCalledWith(expect.stringMatching(/location is unavailable/))
  act(() => result.current()); expect(f.gps.getTracking()).toBe(true)
  unmount(); expect(f.gps.getTracking()).toBe(false)
  expect(f.listeners.get('error')?.size).toBe(0)
})
