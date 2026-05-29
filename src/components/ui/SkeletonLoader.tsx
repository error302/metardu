/**
 * Reusable skeleton / loading placeholder components matching METARDU dark theme.
 * Use these in loading.tsx files or as inline placeholders for async content.
 */

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  style?: React.CSSProperties
}

function Skeleton({ className = '', width, height, style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--bg-tertiary)] ${className}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  )
}

/** Generic card skeleton */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div
      className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5 space-y-3"
      aria-hidden="true"
    >
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      {Array.from({ length: lines - 2 > 0 ? lines - 2 : 1 }).map((_, i) => (
        <Skeleton key={i} className={`h-3 w-${i % 2 === 0 ? '5/6' : '2/3'}`} />
      ))}
    </div>
  )
}

/** Skeleton mimicking a data table */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse space-y-1.5" aria-hidden="true">
      {/* Header */}
      <div className="flex gap-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-8 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-9 flex-1 bg-[var(--bg-secondary)]" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Skeleton for a map viewport */
export function SkeletonMap({ className = '' }: { className?: string }) {
  return (
    <div
      className={`w-full bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center ${className}`}
      style={{ minHeight: 320 }}
      aria-hidden="true"
    >
      <div className="text-center space-y-3 animate-pulse">
        <Skeleton className="h-10 w-10 rounded-full mx-auto" />
        <Skeleton className="h-4 w-28 mx-auto" />
      </div>
    </div>
  )
}

/** Skeleton for a generic list of items */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-14 bg-[var(--bg-card)] rounded-lg border border-[var(--border-color)]" />
      ))}
    </div>
  )
}

/** Skeleton for a chart / graph area */
export function SkeletonChart({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-4 ${className}`} aria-hidden="true">
      <Skeleton className="h-4 w-32 mb-4" />
      <div className="flex items-end gap-1.5" style={{ height: 160 }}>
        {[40, 65, 45, 80, 55, 70, 90, 60, 75, 50, 85, 65].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-[var(--bg-tertiary)]"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  )
}

/** Skeleton for a metrics / stats row */
export function SkeletonMetrics({ count = 3 }: { count?: number }) {
  return (
    <div className="animate-pulse grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-5">
          <Skeleton className="h-3 w-20 mb-3" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  )
}

/** Skeleton for a toolbar / action bar */
export function SkeletonToolbar() {
  return (
    <div className="animate-pulse flex items-center gap-3 p-3 bg-[var(--bg-secondary)] rounded-lg" aria-hidden="true">
      <Skeleton className="h-9 w-20 rounded-md" />
      <Skeleton className="h-9 w-24 rounded-md" />
      <div className="flex-1" />
      <Skeleton className="h-9 w-9 rounded-full" />
      <Skeleton className="h-9 w-9 rounded-full" />
    </div>
  )
}

/** Compact inline skeleton for text content */
export function SkeletonText({ lines = 3, gap = 2 }: { lines?: number; gap?: number }) {
  return (
    <div className={`animate-pulse space-y-${gap}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 ? '40%' : '100%' }}
        />
      ))}
    </div>
  )
}

/** Skeleton mimicking a form input with label */
export function SkeletonFormField() {
  return (
    <div className="animate-pulse space-y-1.5" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  )
}

export { Skeleton }
