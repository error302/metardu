import { act, renderHook } from '@testing-library/react'
import { useAutoSave } from './useAutoSave'

afterEach(() => jest.useRealTimers())
it('saves edits made during an in-flight write on the next heartbeat', async () => {
  jest.useFakeTimers()
  let finish: () => void = () => {}
  const firstWrite = new Promise<void>(resolve => { finish = resolve })
  const onSave = jest.fn<Promise<void>, [unknown]>().mockReturnValueOnce(firstWrite).mockResolvedValue(undefined)
  const { result, rerender } = renderHook(({ value }) => useAutoSave({ data: value, onSave, interval: 1000 }), { initialProps: { value: 'initial' } })
  rerender({ value: 'first edit' })
  act(() => jest.advanceTimersByTime(1000))
  expect(onSave).toHaveBeenLastCalledWith('first edit')
  rerender({ value: 'edit made while saving' })
  await act(async () => { finish(); await firstWrite })
  expect(result.current.hasUnsavedChanges).toBe(true)
  await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve() })
  expect(onSave).toHaveBeenLastCalledWith('edit made while saving')
  expect(result.current.hasUnsavedChanges).toBe(false)
})
it('keeps a rejected save dirty so it can retry', async () => {
  jest.useFakeTimers()
  const onSave = jest.fn<Promise<void>, [unknown]>().mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(undefined)
  const { result, rerender } = renderHook(({ value }) => useAutoSave({ data: value, onSave, interval: 1000 }), { initialProps: { value: 'initial' } })
  rerender({ value: 'raw observation' })
  await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve() })
  expect(result.current.hasUnsavedChanges).toBe(true)
  expect(result.current.error).toBe('Storage unavailable')
  await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve() })
  expect(onSave).toHaveBeenCalledTimes(2)
  expect(result.current.hasUnsavedChanges).toBe(false)
})
