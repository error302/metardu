import { act, fireEvent, render, screen } from '@testing-library/react'
import { AppUpdateBanner } from '@/components/app/AppUpdateBanner'
import { reloadCurrentDocument } from '@/lib/app/documentRecovery'

jest.mock('@/lib/app/documentRecovery', () => ({ reloadCurrentDocument: jest.fn() }))
afterEach(() => { jest.clearAllMocks(); jest.useRealTimers() })

it('finds an already waiting update without reloading the open workspace', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: jest.fn() })
  const registration = Object.assign(new EventTarget(), { waiting: worker, installing: null })
  const container = Object.assign(new EventTarget(), {
    controller: {}, getRegistration: jest.fn().mockResolvedValue(registration), ready: Promise.resolve(registration),
  })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
  try {
    await act(async () => { render(<AppUpdateBanner />) })
    expect(screen.getByRole('button', { name: 'Reload when ready' })).toBeInTheDocument()
    expect(screen.getByText(/save your work/i)).toBeInTheDocument()
    expect(worker.postMessage).not.toHaveBeenCalled()
  } finally {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  }
})

it('reloads only after an operator click and successful activation', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: jest.fn() })
  const registration = Object.assign(new EventTarget(), { waiting: worker, installing: null })
  const container = Object.assign(new EventTarget(), {
    controller: {}, getRegistration: jest.fn().mockResolvedValue(registration), ready: Promise.resolve(registration),
  })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
  try {
    await act(async () => { render(<AppUpdateBanner />) })
    fireEvent.click(screen.getByRole('button', { name: 'Reload when ready' }))
    expect(reloadCurrentDocument).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /preparing/i })).toBeDisabled()
    await act(async () => { worker.state = 'activated'; worker.dispatchEvent(new Event('statechange')) })
    expect(reloadCurrentDocument).toHaveBeenCalledTimes(1)
  } finally { Reflect.deleteProperty(navigator, 'serviceWorker') }
})

it('shows a recoverable activation failure without reloading after a timeout', async () => {
  jest.useFakeTimers()
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: jest.fn() })
  const registration = Object.assign(new EventTarget(), { waiting: worker, installing: null })
  const container = Object.assign(new EventTarget(), {
    controller: {}, getRegistration: jest.fn().mockResolvedValue(registration), ready: Promise.resolve(registration),
  })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
  try {
    await act(async () => { render(<AppUpdateBanner />) })
    fireEvent.click(screen.getByRole('button', { name: 'Reload when ready' }))
    await act(async () => { jest.advanceTimersByTime(15001) })
    expect(screen.getByRole('alert')).toHaveTextContent(/has not reloaded/)
    expect(screen.getByRole('button', { name: 'Reload when ready' })).toBeEnabled()
    expect(reloadCurrentDocument).not.toHaveBeenCalled()
  } finally { Reflect.deleteProperty(navigator, 'serviceWorker') }
})
