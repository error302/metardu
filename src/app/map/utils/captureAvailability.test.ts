import { getCaptureAvailability } from './captureAvailability'

test('no project: every capture action is disabled with a reason', () => {
  const state = getCaptureAvailability({ projectId: null, surveyCrs: 'EPSG:4326' })
  expect(state.projectLinked).toBe(false)
  expect(state.canRegisterPoints).toBe(false)
  expect(state.canSketch).toBe(false)
  expect(state.reason).toMatch(/Link a project/)
})

test('project without survey CRS: register works, sketching waits for a CRS', () => {
  const state = getCaptureAvailability({ projectId: 'p1', surveyCrs: null })
  expect(state.canRegisterPoints).toBe(true)
  expect(state.canSketch).toBe(false)
  expect(state.reason).toMatch(/survey CRS/)
})

test('project and CRS: capture fully available', () => {
  const state = getCaptureAvailability({ projectId: 'p1', surveyCrs: 'EPSG:4326' })
  expect(state).toEqual({ projectLinked: true, canRegisterPoints: true, canSketch: true, reason: null })
})
