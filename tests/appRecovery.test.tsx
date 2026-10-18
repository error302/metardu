import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AppErrorBoundary from '@/components/shared/AppErrorBoundary'
import OfflinePage from '@/app/offline/page'
import { isAssetLoadError, reloadCurrentDocument } from '@/lib/app/documentRecovery'

jest.mock('@/lib/monitoring/sentry', () => ({ captureError: jest.fn() }))
jest.mock('@/lib/app/documentRecovery', () => ({ ...jest.requireActual('@/lib/app/documentRecovery'), reloadCurrentDocument: jest.fn() }))

describe('document recovery', () => {
  it('offers a deliberate full reload for a failed asset rather than repeating a render reset', () => {
    const reset = jest.fn()
    render(<AppErrorBoundary error={Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' })} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(reloadCurrentDocument).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
    expect(screen.getByText(/save.*work/i)).toBeInTheDocument()
  })

  it('recognizes browser asset errors without classifying ordinary module errors as network failures', () => {
    for (const message of ['Loading CSS chunk 42 failed.', 'Failed to fetch dynamically imported module: https://example.test/a.js', 'Importing a module script failed.']) {
      expect(isAssetLoadError(new Error(message))).toBe(true)
    }
    expect(isAssetLoadError(new Error('Module computed an invalid result'))).toBe(false)
  })

  it('retains the ordinary render retry for application errors', () => {
    const reset = jest.fn()
    render(<AppErrorBoundary error={new Error('A computation failed')} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})

describe('offline recovery', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('checks public uncached health and leaves navigation to the operator', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'healthy' }) })
    global.fetch = fetchMock
    render(<OfflinePage />)
    fireEvent.click(screen.getByRole('button', { name: /try again|check connection/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/public/health', expect.objectContaining({ cache: 'no-store', credentials: 'omit', redirect: 'error' })))
    expect(await screen.findByText(/connection.*restored/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('checks a reconnect event without redirecting or claiming automatic delivery', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ status: 'unhealthy' }) })
    render(<OfflinePage />)
    fireEvent(window, new Event('online'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/not ready|unavailable/i)).toBeInTheDocument()
    expect(screen.queryByText(/sync automatically/i)).not.toBeInTheDocument()
  })

  it('does not treat a successful captive-portal response as restored service', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('HTML response') } })
    render(<OfflinePage />)
    fireEvent.click(screen.getByRole('button', { name: /try again|check connection/i }))
    expect(await screen.findByText(/could not reach|unavailable/i)).toBeInTheDocument()
  })

  it('coalesces repeated reconnects and cancels a pending health check on unmount', async () => {
    global.fetch = jest.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
    }))
    const view = render(<OfflinePage />)
    fireEvent(window, new Event('online'))
    fireEvent(window, new Event('online'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await Promise.resolve()
  })

  it('ends a stalled health check and lets the operator retry', async () => {
    jest.useFakeTimers()
    global.fetch = jest.fn().mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
    }))
    try {
      render(<OfflinePage />)
      fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
      await act(async () => { jest.advanceTimersByTime(10001) })
      expect(screen.getByRole('status')).toHaveTextContent(/could not reach/i)
      expect(screen.getByRole('button', { name: 'Check connection' })).toBeEnabled()
    } finally { jest.useRealTimers() }
  })
})
