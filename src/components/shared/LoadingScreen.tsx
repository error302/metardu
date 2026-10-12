'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AsciiRecipeConfig } from '@/components/ascii/types'
import { LoadingState } from './LoadingState'

interface LoadingScreenProps {
  visible?: boolean
  progress?: number | null
  message?: string
  subMessage?: string
  autoDismiss?: number
  /** Retained for call-site compatibility; loading no longer renders a canvas. */
  recipeConfig?: AsciiRecipeConfig
  onDismiss?: () => void
  onComplete?: () => void
}

export function LoadingScreen({ visible = true, progress = null, message, subMessage, autoDismiss = 0, onDismiss, onComplete }: LoadingScreenProps) {
  const [internalVisible, setInternalVisible] = useState(visible)
  useEffect(() => { setInternalVisible(visible) }, [visible])
  useEffect(() => {
    if (autoDismiss <= 0 || !visible) return
    const timer = setTimeout(() => { setInternalVisible(false); onDismiss?.(); onComplete?.() }, autoDismiss)
    return () => clearTimeout(timer)
  }, [autoDismiss, visible, onDismiss, onComplete])
  if (!internalVisible) return null
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f1513] text-[#f2f1eb]">
    <LoadingState message={message} subMessage={subMessage} progress={progress} />
  </div>
}

/**
 * ProgressBar — Inline progress bar component
 */
export function ProgressBar({
  progress,
  message,
  variant = 'default',
}: {
  progress: number
  message?: string
  variant?: 'default' | 'success' | 'warning' | 'error'
}) {
  const colors = {
    default: 'from-[#D17B47] to-[#FFB84D]',
    success: 'from-emerald-500 to-emerald-400',
    warning: 'from-amber-500 to-amber-400',
    error: 'from-red-500 to-red-400',
  }

  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${colors[variant]} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      {message && (
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>{message}</span>
          <span className="font-mono">{Math.round(progress)}%</span>
        </div>
      )}
    </div>
  )
}

/**
 * Spinner — Small inline spinner
 */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.2"
      />
      <path
        d="M 12 2 A 10 10 0 0 1 22 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * useLoading hook — Manage loading state
 */
export function useLoading() {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [message, setMessage] = useState('')

  const start = useCallback((msg?: string) => {
    setIsLoading(true)
    setProgress(null)
    setMessage(msg || 'Loading...')
  }, [])

  const update = useCallback((progress: number, msg?: string) => {
    setProgress(progress)
    if (msg) setMessage(msg)
  }, [])

  const done = useCallback(() => {
    setProgress(100)
    setTimeout(() => {
      setIsLoading(false)
      setProgress(null)
    }, 300)
  }, [])

  return { isLoading, progress, message, start, update, done }
}
