import { act, renderHook } from '@testing-library/react'
import { useAutoSave } from './useAutoSave'

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })
it('opens a retained snapshot without writing it again, then saves subsequent edits', async () => {
  jest.useFakeTimers()
  const onSave = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined)
  const { result, rerender } = renderHook(({ value, opened }) => {
    const options = { data: value, onSave, interval: 1000, readSnapshotKey: opened }
    return useAutoSave(options)
  }, { initialProps: { value: { bs: '', height: null as number | null }, opened: 0 } })
  rerender({ value: { bs: '1.5000', height: null }, opened: 1 })
  expect(result.current.hasUnsavedChanges).toBe(false)
  const unload = new Event('beforeunload', { cancelable: true })
  await act(async () => { jest.advanceTimersByTime(2000); window.dispatchEvent(unload) })
  expect(unload.defaultPrevented).toBe(false)
  expect(onSave).not.toHaveBeenCalled()
  expect(result.current.lastAutoSave).toBeNull()
  rerender({ value: { bs: '1.7500', height: 0 }, opened: 1 })
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenLastCalledWith({ bs: '1.7500', height: 0 })
})

it('an older in-flight save cannot acknowledge a newly opened snapshot or its later edits', async () => {
  jest.useFakeTimers()
  let finish: () => void = () => {}
  const pending = new Promise<void>(resolve => { finish = resolve })
  const onSave = jest.fn<Promise<void>, [unknown]>().mockReturnValueOnce(pending).mockResolvedValue(undefined)
  const { result, rerender } = renderHook(({ value, opened }) => {
    const options = { data: value, onSave, interval: 1000, readSnapshotKey: opened }
    return useAutoSave(options)
  }, { initialProps: { value: 'initial', opened: 0 } })
  rerender({ value: 'old book edit', opened: 0 })
  act(() => jest.advanceTimersByTime(1000))
  rerender({ value: 'newly opened saved book', opened: 1 })
  expect(result.current.hasUnsavedChanges).toBe(false)
  rerender({ value: 'new book edit', opened: 1 })
  await act(async () => { finish(); await pending })
  expect(result.current.hasUnsavedChanges).toBe(true)
  expect(result.current.lastAutoSave).toBeNull()
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(onSave).toHaveBeenLastCalledWith('new book edit')
})

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

it('background and unload events cannot repeatedly retry a failing device save before its deadline', async () => {
  jest.useFakeTimers()
  jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  const onSave = jest.fn<Promise<void>, [unknown]>().mockRejectedValue(new DOMException('Device storage full', 'QuotaExceededError'))
  const { result, rerender } = renderHook(({ value }) => useAutoSave({ data: value, onSave, interval: 1000 }), { initialProps: { value: 'initial' } })
  rerender({ value: '1.5000' })
  await act(async () => { jest.advanceTimersByTime(1000) })
  for (let index = 0; index < 3; index++) {
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('beforeunload', { cancelable: true })) })
  }
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(result.current.hasUnsavedChanges).toBe(true)
  expect(result.current.lastAutoSave).toBeNull()
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(onSave).toHaveBeenCalledTimes(2)
  rerender({ value: '1.7500' })
  await act(async () => { jest.advanceTimersByTime(1000); document.dispatchEvent(new Event('visibilitychange')) })
  expect(onSave).toHaveBeenCalledTimes(2)
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(onSave).toHaveBeenCalledTimes(3)
  expect(onSave).toHaveBeenLastCalledWith('1.7500')
})

it('repeated failures back off to fifteen minutes while retaining the newest raw values for recovery', async () => {
  jest.useFakeTimers()
  const onSave = jest.fn<Promise<void>, [unknown]>().mockRejectedValue(new Error('Storage unavailable'))
  const { result, rerender } = renderHook(({ value }) => useAutoSave({ data: value, onSave }), { initialProps: { value: { reading: '', height: null as number | null } } })
  rerender({ value: { reading: '1.5000', height: null } })
  for (const delay of [30000, 30000, 60000, 120000, 240000, 480000, 900000]) {
    const previous = onSave.mock.calls.length
    if (delay > 30000) {
      await act(async () => { jest.advanceTimersByTime(delay - 30000) })
      expect(onSave).toHaveBeenCalledTimes(previous)
    }
    await act(async () => { jest.advanceTimersByTime(30000) })
    expect(onSave).toHaveBeenCalledTimes(previous + 1)
  }
  rerender({ value: { reading: '1.7500', height: 0 } })
  onSave.mockResolvedValue(undefined)
  await act(async () => { jest.advanceTimersByTime(900000) })
  expect(onSave).toHaveBeenLastCalledWith({ reading: '1.7500', height: 0 })
  expect(result.current.hasUnsavedChanges).toBe(false)
  expect(result.current.error).toBeNull()
  rerender({ value: { reading: '1.8000', height: null } })
  await act(async () => { jest.advanceTimersByTime(30000) })
  expect(onSave).toHaveBeenLastCalledWith({ reading: '1.8000', height: null })
})

it('explicit save can retry a repaired device immediately and successful persistence resets the automatic delay', async () => {
  jest.useFakeTimers()
  const onSave = jest.fn<Promise<void>, [unknown]>().mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(undefined)
  const { result, rerender } = renderHook(({ value }) => useAutoSave({ data: value, onSave, interval: 1000 }), { initialProps: { value: 'initial' } })
  rerender({ value: 'raw observation' })
  await act(async () => { jest.advanceTimersByTime(1000) })
  await act(async () => { await result.current.saveNow() })
  expect(result.current.hasUnsavedChanges).toBe(false)
  rerender({ value: 'new observation' })
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(onSave).toHaveBeenLastCalledWith('new observation')
  expect(onSave).toHaveBeenCalledTimes(3)
})

it('a successful external save can resume automatic persistence without claiming newer unsaved edits were saved', async () => {
  jest.useFakeTimers()
  const onSave = jest.fn<Promise<void>, [unknown]>().mockRejectedValue(new Error('Device storage full'))
  const { result, rerender } = renderHook(({ value }) => useAutoSave({ data: value, onSave, interval: 1000 }), { initialProps: { value: 'initial' } })
  rerender({ value: 'first observation' })
  await act(async () => { jest.advanceTimersByTime(1000) })
  await act(async () => { jest.advanceTimersByTime(1000) })
  // The page's manual path has persisted an older snapshot independently.
  // Resuming automatic retries cannot acknowledge the newly edited snapshot.
  act(() => { result.current.resetFailureDelay() })
  expect(result.current.lastAutoSave).toBeNull()
  expect(result.current.hasUnsavedChanges).toBe(true)
  rerender({ value: 'newer observation' })
  onSave.mockResolvedValue(undefined)
  await act(async () => { jest.advanceTimersByTime(1000) })
  expect(onSave).toHaveBeenLastCalledWith('newer observation')
  expect(result.current.hasUnsavedChanges).toBe(false)
})
