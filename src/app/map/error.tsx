'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function MapErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Map Error]', error)
    try { require('@sentry/nextjs').captureException(error) } catch {}
  }, [error])
  return (
    <div className="h-[calc(100vh-4rem)] bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center max-w-lg px-6">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-500/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-white font-semibold text-lg mb-2">Map failed to load</h3>
        <p className="text-gray-400 text-sm mb-1">
          {error?.message || 'An unexpected error occurred while loading the map.'}
        </p>
        <p className="text-gray-500 text-xs mb-6">
          This is usually a temporary issue with map libraries loading.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2 bg-[#E8841A] hover:bg-[#E8841A]/80 text-white text-sm rounded-lg transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="text-xs text-gray-600 mt-4 font-mono">Error ref: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
