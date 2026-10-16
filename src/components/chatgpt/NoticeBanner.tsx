'use client'
import Link from 'next/link'
import { useCallback, useSyncExternalStore } from 'react'
import noticeContent from '@/lib/chatgpt/noticeContent.json'

/**
 * Dismissal is keyed to the notice version, so publishing a new notice
 * version shows the banner again. The full notice stays reachable from the
 * footer and /docs/chatgpt-notice after the banner is dismissed.
 */
export const CHATGPT_NOTICE_DISMISS_KEY = `metardu:chatgpt-notice-dismissed:${noticeContent.version}`
const CHANGE_EVENT = 'metardu:chatgpt-notice-dismissed'

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(CHATGPT_NOTICE_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function ChatGPTNoticeBanner() {
  // Server snapshot is "not dismissed" so the notice is present in the
  // server-rendered HTML; the client then hides it if the user dismissed it.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => false)

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(CHATGPT_NOTICE_DISMISS_KEY, '1')
    } catch {
      /* storage unavailable (private mode) — hide for this page view only */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  if (dismissed) return null

  return (
    <aside
      aria-label="ChatGPT data-sharing notice"
      className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2 sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <p className="min-w-0 flex-1 text-sm leading-6">
          <strong>Optional ChatGPT connection.</strong>{' '}
          <span className="hidden sm:inline">Review the information shared and the notice period before linking an account. </span>
          <Link href="/docs/chatgpt-notice" className="text-[var(--accent)] underline">
            Read the data-sharing notice
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss ChatGPT notice"
          title="Dismiss — the notice stays available in the footer"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
