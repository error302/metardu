/**
 * Performance Monitoring for METARDU
 * Track and report performance metrics
 */
import { logger } from '@/lib/logger'
import { PERFORMANCE_BUDGETS } from './config'

interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  tags?: Record<string, string>
}

export interface PerformanceReport {
  webVitals: WebVitalsReport
  customMetrics: Record<string, number>
  errors: ErrorReport[]
}

interface WebVitalsReport {
  FCP?: number // First Contentful Paint
  LCP?: number // Largest Contentful Paint
  FID?: number // First Input Delay
  INP?: number // Interaction to Next Paint
  CLS?: number // Cumulative Layout Shift
  TTFB?: number // Time to First Byte
}

const LOAD_VITALS = ['FCP', 'LCP', 'CLS', 'TTFB'] as const
const VITAL_NAMES: ReadonlySet<string> = new Set([...LOAD_VITALS, 'FID', 'INP'])

interface ErrorReport {
  message: string
  stack?: string
  timestamp: number
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private errors: ErrorReport[] = []
  private isReporting = false
  private reportInterval: NodeJS.Timeout | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.initWebVitals()
      this.initErrorTracking()
    }
  }

  private initWebVitals(): void {
    if (typeof PerformanceObserver === 'undefined') return
    const supported = PerformanceObserver.supportedEntryTypes ?? []

    // Provide live readings until Next.js reports the finalized vitals.
    if (supported.includes('largest-contentful-paint')) {
      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        if (lastEntry) this.record('LCP', lastEntry.startTime)
      })
      observer.observe({ type: 'largest-contentful-paint', buffered: true })
    }

    if (supported.includes('layout-shift')) {
      this.record('CLS', 0)
      let sessionStart = -Infinity
      let lastShift = -Infinity
      let sessionValue = 0
      let largestSession = 0
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }
          if (shift.hadRecentInput) continue
          if (shift.startTime - lastShift >= 1000 || shift.startTime - sessionStart >= 5000) {
            sessionStart = shift.startTime
            sessionValue = 0
          }
          lastShift = shift.startTime
          sessionValue += shift.value
          largestSession = Math.max(largestSession, sessionValue)
        }
        this.record('CLS', largestSession)
      })
      observer.observe({ type: 'layout-shift', buffered: true })
    }
  }

  private initErrorTracking(): void {
    window.addEventListener('error', (e) => {
      this.trackError(e.message, e.error instanceof Error ? e.error.stack : undefined)
    })

    window.addEventListener('unhandledrejection', (e) => {
      this.trackError(String(e.reason), undefined)
    })
  }

  // Record a metric
  record(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      tags,
    })

    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000)
    }

    // Log slow metrics in development
    if (process.env.NODE_ENV === 'development' && value > 1000) {
      logger.warn(`[Performance] Slow ${name}: ${value.toFixed(2)}ms`)
    }
  }

  // Track API call performance
  async trackApiCall<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    try {
      const result = await fn()
      this.record(`api.${name}`, performance.now() - start)
      return result
    } catch (error) {
      this.record(`api.${name}.error`, performance.now() - start)
      throw error
    }
  }

  // Track component render time
  trackRender(componentName: string): () => void {
    const start = performance.now()
    return () => {
      this.record(`render.${componentName}`, performance.now() - start)
    }
  }

  // Track error
  trackError(message: string, stack?: string): void {
    this.errors.push({
      message,
      stack,
      timestamp: Date.now(),
    })

    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-100)
    }
  }

  // Get current metrics
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }

  // Get errors
  getErrors(): ErrorReport[] {
    return [...this.errors]
  }

  // Get summary report
  getReport(): PerformanceReport {
    const webVitals: WebVitalsReport = {}
    const customMetrics: Record<string, number> = {}

    const customSamples: PerformanceMetric[] = []
    const finalized = new Set<string>()
    for (const metric of this.metrics) {
      if (!VITAL_NAMES.has(metric.name)) {
        customSamples.push(metric)
        continue
      }
      if (metric.tags?.source === 'web-vitals') {
        finalized.add(metric.name)
      } else if (finalized.has(metric.name)) {
        continue
      }
      webVitals[metric.name as keyof WebVitalsReport] = metric.value
    }

    for (const [name, values] of Object.entries(this.groupByName(customSamples))) {
      customMetrics[name] = values.reduce((a, b) => a + b, 0) / values.length
    }

    return {
      webVitals,
      customMetrics,
      errors: this.errors.slice(-10), // Last 10 errors
    }
  }

  private groupByName(metrics: PerformanceMetric[]): Record<string, number[]> {
    return metrics.reduce((acc, metric) => {
      if (!acc[metric.name]) acc[metric.name] = []
      acc[metric.name].push(metric.value)
      return acc
    }, {} as Record<string, number[]>)
  }

  // Start auto-reporting
  startReporting(intervalMs = 60000): void {
    if (this.reportInterval) return

    this.reportInterval = setInterval(() => {
      this.sendReport()
    }, intervalMs)
  }

  // Stop auto-reporting
  stopReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval)
      this.reportInterval = null
    }
  }

  // Send report to analytics
  private async sendReport(): Promise<void> {
    if (this.isReporting) return
    this.isReporting = true

    try {
      const report = this.getReport()
      
      // Send to analytics endpoint
      await fetch('/api/analytics/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      })

      // Clear sent metrics
      this.metrics = []
      this.errors = []
    } catch {
      // Silently fail
    } finally {
      this.isReporting = false
    }
  }

  getScore(report = this.getReport()): number | null {
    const { webVitals } = report
    const responsiveness = webVitals.INP === undefined ? 'FID' : 'INP'
    const required = [...LOAD_VITALS, responsiveness] as const
    if (required.some(name => webVitals[name] === undefined)) return null

    let score = 100
    for (const name of required) {
      const value = webVitals[name]
      if (value !== undefined && value > PERFORMANCE_BUDGETS[name]) {
        score -= name === 'FCP' || name === 'TTFB' ? 10 : 20
      }
    }
    return Math.max(0, score - Math.min(20, report.errors.length * 2))
  }

  // Clear all collected stats
  clearStats(): void {
    this.metrics = []
    this.errors = []
  }
}

// Hook for React components
export function usePerformanceTrack(componentName: string): void {
  if (typeof window === 'undefined') return

  const endTrack = performanceMonitor.trackRender(componentName)

  try {
    // Schedule cleanup — this is a best-effort hook without useEffect
    // Consumers should call endTrack() manually or wrap in useEffect
  } catch {
    endTrack()
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor()
export default performanceMonitor
