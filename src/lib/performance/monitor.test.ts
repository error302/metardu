/** @jest-environment node */
import { performanceMonitor } from './monitor'

beforeEach(() => performanceMonitor.clearStats())

it('shows the real budget penalties without treating missing readings as healthy', () => {
  expect(performanceMonitor.getScore()).toBeNull()
  performanceMonitor.record('TTFB', 2774)
  performanceMonitor.record('FCP', 3132)
  performanceMonitor.record('LCP', 4388)
  performanceMonitor.record('CLS', 0.037)
  performanceMonitor.record('FID', 1)
  expect(performanceMonitor.getScore()).toBe(60)
})

it('uses the finalized reading and measures responsiveness with INP when available', () => {
  performanceMonitor.record('LCP', 1900)
  performanceMonitor.record('LCP', 2500, { source: 'web-vitals' })
  performanceMonitor.record('LCP', 4600)
  performanceMonitor.record('CLS', 0.1)
  performanceMonitor.record('TTFB', 600)
  performanceMonitor.record('FCP', 1800)
  performanceMonitor.record('FID', 1)
  performanceMonitor.record('INP', 201, { source: 'web-vitals' })
  expect(performanceMonitor.getReport().webVitals.LCP).toBe(2500)
  expect(performanceMonitor.getScore()).toBe(80)
})
