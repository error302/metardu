'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/api-client/client'
import {
  type FeedbackCategory,
  buildFeedbackPayload,
  markFeedbackSubmitted,
  canSubmitFeedback,
  captureScreenshot,
  logFeedbackToConsole,
} from '@/lib/feedback/feedbackCollector'
import { ChangelogPanel } from '@/components/feedback/ChangelogPanel'

type Tab = 'feedback' | 'changelog'

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('feedback')
  const [type, setType] = useState<FeedbackCategory>('general')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [includeErrors, setIncludeErrors] = useState(true)

  const resetForm = useCallback(() => {
    setSubmitted(false)
    setMessage('')
    setEmail('')
    setScreenshot(null)
    setType('general')
  }, [])

  const handleCaptureScreenshot = useCallback(async () => {
    setCapturingScreenshot(true)
    try {
      const dataUrl = await captureScreenshot()
      setScreenshot(dataUrl)
    } catch {
      setScreenshot(null)
    } finally {
      setCapturingScreenshot(false)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    if (!canSubmitFeedback()) return

    setLoading(true)

    try {
      const payload = buildFeedbackPayload(
        type,
        message,
        email || undefined,
        screenshot || undefined
      )

      // Try DbClient first
      try {
        const dbClient = createClient()
        const { data: { session } } = await dbClient.auth.getSession()
        const user = session?.user

        await dbClient.from('feedback').insert({
          type,
          message: payload.message,
          email: email || null,
          page_url: payload.pageUrl,
          user_id: user?.id || null,
          metadata: payload.metadata,
          screenshot_url: payload.screenshotDataUrl || null,
        })
      } catch {
        // DbClient may not be configured — fallback to console
        logFeedbackToConsole(payload)
      }

      markFeedbackSubmitted()
      setSubmitted(true)
      setTimeout(() => {
        resetForm()
      }, 2500)
    } catch (error) {
      console.error('Feedback error:', error)
      logFeedbackToConsole(
        buildFeedbackPayload(type, message, email || undefined, screenshot || undefined)
      )
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Send feedback"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 bg-[var(--accent)] text-black px-3 py-2 rounded-full shadow-lg text-xs font-semibold z-40 hover:bg-[var(--accent-dim)] transition-colors flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
        </svg>
        Feedback
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl shadow-2xl w-[22rem] max-h-[80vh] z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-[var(--accent)] px-4 py-3 flex justify-between items-center flex-shrink-0">
        <h3 className="text-black font-bold text-sm">Beta Feedback</h3>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex bg-black/10 rounded-md overflow-hidden">
            <button
              onClick={() => setTab('feedback')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === 'feedback' ? 'bg-black text-[var(--accent)]' : 'text-black/70 hover:text-black'
              }`}
            >
              Report
            </button>
            <button
              onClick={() => setTab('changelog')}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === 'changelog' ? 'bg-black text-[var(--accent)]' : 'text-black/70 hover:text-black'
              }`}
            >
              What&apos;s New
            </button>
          </div>
          <button onClick={() => { setIsOpen(false); resetForm() }} className="text-black hover:text-black/60 ml-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'changelog' ? (
          <ChangelogPanel />
        ) : submitted ? (
          <div className="text-center py-10 px-4">
            <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
              </svg>
            </div>
            <p className="text-green-400 font-semibold mb-1">Thank you!</p>
            <p className="text-[var(--text-muted)] text-xs">Your feedback has been submitted and will help improve METARDU.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            {/* Type selector */}
            <div className="flex gap-1.5">
              {([
                { key: 'bug' as FeedbackCategory, label: 'Bug', icon: '🐛' },
                { key: 'feature' as FeedbackCategory, label: 'Feature', icon: '💡' },
                { key: 'performance' as FeedbackCategory, label: 'Slow', icon: '⚡' },
                { key: 'general' as FeedbackCategory, label: 'Other', icon: '💬' },
              ]).map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-medium transition-all ${
                    type === key
                      ? 'bg-[var(--accent)] text-black shadow-md shadow-[var(--accent)]/20'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-white hover:bg-[var(--border-color)]'
                  }`}
                >
                  <span className="block text-sm mb-0.5">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Message */}
            <div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? 'What went wrong? Steps to reproduce…'
                    : type === 'feature'
                      ? 'What feature would you like?'
                      : type === 'performance'
                        ? 'What is slow? When does it happen?'
                        : 'How can we improve METARDU?'
                }
                rows={4}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm resize-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none transition-all"
                required
              />
            </div>

            {/* Email */}
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional — for follow-up)"
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none transition-all"
              />
            </div>

            {/* Screenshot capture */}
            <div>
              <button
                type="button"
                onClick={handleCaptureScreenshot}
                disabled={capturingScreenshot}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs text-[var(--text-secondary)] border border-dashed border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
              >
                {capturingScreenshot ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"/>
                  </svg>
                )}
                {screenshot ? 'Screenshot captured ✓' : 'Attach screenshot'}
              </button>

              {screenshot && (
                <div className="mt-2 relative">
                  <img
                    src={screenshot}
                    alt="Screenshot preview"
                    className="w-full rounded-lg border border-[var(--border-color)] opacity-80"
                  />
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px]"
                    aria-label="Remove screenshot"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Include errors checkbox */}
            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={includeErrors}
                onChange={(e) => setIncludeErrors(e.target.checked)}
                className="rounded border-[var(--border-color)] bg-[var(--bg-tertiary)]"
              />
              Include recent error logs
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="w-full py-2.5 bg-[var(--accent)] text-black font-bold rounded-lg hover:bg-[var(--accent-dim)] disabled:opacity-40 transition-colors text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Sending…
                </span>
              ) : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
