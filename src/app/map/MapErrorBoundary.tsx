'use client';

import React from 'react'

// ─── Proper React Error Boundary (class component required) ───────────
// The previous implementation only caught window.error / unhandledrejection
// events, which does NOT catch React rendering errors (those bypass it and
// propagate to Next.js error.tsx showing the generic "Something went wrong").
// A true error boundary MUST be a class component with getDerivedStateFromError.

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class MapErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MapErrorBoundary] Caught render error:', error, errorInfo)
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null })
    // Force a full remount by using setTimeout
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-[calc(100vh-4rem)] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center max-w-lg px-6 bg-[#14141e]/90 rounded-xl py-6 shadow-2xl">
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Map failed to load</h3>
            <p className="text-gray-400 text-sm mb-1">{this.state.error?.message || 'An unexpected error occurred'}</p>
            {this.state.error?.stack && (
              <pre className="text-[10px] text-gray-600 mt-2 p-2 bg-white/[0.02] rounded-lg text-left overflow-auto max-h-32">
                {this.state.error.stack.slice(0, 500)}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="mt-4 px-5 py-2 bg-[#E8841A] hover:bg-[#E8841A]/80 text-white text-sm rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
