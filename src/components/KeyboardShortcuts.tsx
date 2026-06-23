'use client';

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getRegisteredHotkeys, formatHotkey } from '@/hooks/useHotkeys'
import type { HotkeyRegistration } from '@/hooks/useHotkeys'

// Static shortcuts always available (not dynamically registered)
const staticShortcuts = [
  { key: '?', description: 'Show keyboard shortcuts', category: 'General' },
  { key: 'Esc', description: 'Close modal / Clear selection', category: 'General' },
  { key: 'Ctrl+Z', description: 'Undo last action', category: 'General' },
  { key: 'Ctrl+Shift+Z', description: 'Redo', category: 'General' },
  { key: 'Ctrl+S', description: 'Save / Export', category: 'Actions' },
  { key: 'Ctrl+P', description: 'Print results', category: 'Actions' },
  { key: '/', description: 'Focus search', category: 'Actions' },
  { key: 'g d', description: 'Go to Dashboard', category: 'Navigation' },
  { key: 'g t', description: 'Go to Tools', category: 'Navigation' },
  { key: 'g p', description: 'Go to Projects', category: 'Navigation' },
  { key: 'n p', description: 'New Project', category: 'Actions' },
  { key: 'd', description: 'Toggle Distance mode (in project)', category: 'Project' },
  { key: 'a', description: 'Toggle Area mode (in project)', category: 'Project' },
  { key: 'p', description: 'Add Point (in project)', category: 'Project' },
  { key: 'n', description: 'New observation (in fieldbook)', category: 'Fieldbook' },
  { key: 'Ctrl+N', description: 'New observation & keep form open', category: 'Fieldbook' },
]

export default function KeyboardShortcuts() {
  const [show, setShow] = useState(false)
  const [dynamicShortcuts, setDynamicShortcuts] = useState<HotkeyRegistration[]>([])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        setDynamicShortcuts(getRegisteredHotkeys())
        setShow(prev => !prev)
      }
      if (e.key === 'Escape') setShow(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!show) return null

  // Merge static + dynamic (dynamic overrides static by description)
  const dynamicDescs = new Set(dynamicShortcuts.map(s => s.description))
  const allShortcuts = [
    ...dynamicShortcuts.map(s => ({ key: s.keys, description: s.description, category: 'Context' })),
    ...staticShortcuts.filter(s => !dynamicDescs.has(s.description)),
  ]

  const grouped = allShortcuts.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, typeof allShortcuts>)

  // Order categories
  const categoryOrder = ['General', 'Navigation', 'Actions', 'Fieldbook', 'Project', 'Context']
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => (categoryOrder.indexOf(a) ?? 99) - (categoryOrder.indexOf(b) ?? 99)
  )

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
      onClick={() => setShow(false)}
    >
      <div
        className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[var(--border-color)]">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Keyboard Shortcuts</h2>
            <button
              onClick={() => setShow(false)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">Press ? to toggle this menu</p>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[60vh]">
          {sortedCategories.map(category => (
            <div key={category}>
              <h3 className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-2.5">
                {category}
              </h3>
              <div className="space-y-1">
                {grouped[category].map((s, i) => (
                  <div
                    key={`${s.key}-${i}`}
                    className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <span className="text-sm text-[var(--text-secondary)]">{s.description}</span>
                    <kbd className="px-2 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded text-[11px] font-mono text-[var(--accent)] whitespace-nowrap">
                      {formatHotkey(s.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[var(--border-color)] text-center">
          <Link href="/docs" className="text-xs text-[var(--accent)] hover:underline">
            View full documentation →
          </Link>
        </div>
      </div>
    </div>
  )
}
