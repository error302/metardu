'use client'

import { Component, ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
          <div className="text-center p-8">
            <h2 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h2>
            <p className="text-[var(--text-muted)] mb-4">An error occurred loading this project.</p>
            <div className="space-x-4">
              <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[var(--accent)] text-black rounded font-semibold">Reload</button>
              <a href="/dashboard" className="px-4 py-2 border border-[var(--border-color)] rounded">Dashboard</a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
