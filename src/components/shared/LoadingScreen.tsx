'use client'

/**
 * LoadingScreen — Branded full-screen loading for METARDU
 *
 * Shows during:
 * - Initial app load
 * - Heavy computations (Bowditch adjustment, area calc)
 * - Document generation
 * - Map tile downloading
 * - Batch parcel import
 *
 * Features:
 * - Animated METARDU logo with contour lines
 * - Progress bar with percentage
 * - Contextual status messages
 * - Smooth fade-out when complete
 */

import { useState, useEffect, useCallback } from 'react'
import MetarduLogo from '@/components/MetarduLogo'

interface LoadingScreenProps {
  /** Show the loading screen */
  visible: boolean
  /** Progress 0-100 (null = indeterminate) */
  progress?: number | null
  /** Status message */
  message?: string
  /** Sub-message (smaller text) */
  subMessage?: string
  /** Auto-dismiss after this many ms (0 = manual) */
  autoDismiss?: number
  /** Called when dismissed */
  onDismiss?: () => void
}

export function LoadingScreen({
  visible,
  progress = null,
  message = 'Loading...',
  subMessage,
  autoDismiss = 0,
  onDismiss,
}: LoadingScreenProps) {
  const [internalVisible, setInternalVisible] = useState(visible)

  useEffect(() => {
    setInternalVisible(visible)
  }, [visible])

  useEffect(() => {
    if (autoDismiss > 0 && visible) {
      const timer = setTimeout(() => {
        setInternalVisible(false)
        onDismiss?.()
      }, autoDismiss)
      return () => clearTimeout(timer)
    }
  }, [autoDismiss, visible, onDismiss])

  if (!internalVisible) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0f] flex items-center justify-center animate-in fade-in duration-300">
      {/* Animated contour background */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        <svg viewBox="0 0 800 600" className="w-full h-full">
          <defs>
            <pattern id="contour-pattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 0 50 Q 25 30 50 50 T 100 50" fill="none" stroke="#D17B47" strokeWidth="0.5" />
              <path d="M 0 30 Q 25 10 50 30 T 100 30" fill="none" stroke="#D17B47" strokeWidth="0.3" />
              <path d="M 0 70 Q 25 50 50 70 T 100 70" fill="none" stroke="#D17B47" strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect width="800" height="600" fill="url(#contour-pattern)" />
        </svg>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Official logo */}
        <div className="mb-8">
          <MetarduLogo size={72} showWordmark={false} color="#D17B47" />
        </div>

        {/* Brand name */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-[#D17B47]">M</span>
            <span className="text-white">ETARDU</span>
          </h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em] mt-1">
            Survey Engine
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-64">
          {progress !== null ? (
            <div className="space-y-2">
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#D17B47] to-[#FFB84D] rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>{message}</span>
                <span className="font-mono">{Math.round(progress)}%</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-gradient-to-r from-[#D17B47] to-[#FFB84D] rounded-full animate-indeterminate" />
              </div>
              <div className="text-center text-[10px] text-gray-500">{message}</div>
            </div>
          )}
        </div>

        {/* Sub-message */}
        {subMessage && (
          <p className="text-[9px] text-gray-600 mt-3 max-w-xs text-center">
            {subMessage}
          </p>
        )}
      </div>

      <style jsx>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .animate-indeterminate {
          animation: indeterminate 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
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
