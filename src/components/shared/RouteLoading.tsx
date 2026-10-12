import type { ReactNode } from 'react'
import { LoadingState } from './LoadingState'

export interface RouteLoadingProps {
  /** Retained for existing route call sites. */
  lines: string[]
  height?: number
  skeleton?: ReactNode
  /** Accessible status label, announced without adding visible loading copy. */
  label?: string
}

/** Route boundaries use the same logo-only loader as the app entry screen. */
export function RouteLoading({ label = 'Loading' }: RouteLoadingProps) {
  return <LoadingState message={label} />
}

export default RouteLoading
