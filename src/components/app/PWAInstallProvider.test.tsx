import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PWAInstallProvider, usePWAInstall } from './PWAInstallProvider'
import { PWAInstallBanner } from './PWAInstallBanner'

jest.mock('@/lib/i18n/LanguageContext', () => ({ useLanguage: () => ({
  hydrated: true, t: (key: string) => ({ 'pwa.installTitle': 'Install METARDU', 'pwa.installNow': 'Install', 'pwa.notNow': 'Not now' } as Record<string, string>)[key] ?? key,
}) }))
function State() {
  const state = usePWAInstall()
  return <><output aria-label="Installation status">{String(state.installed)}</output><output aria-label="Apple mobile browser">{String(state.ios)}</output><button onClick={() => { void state.install() }}>Other install entry</button></>
}
function App({ manual = false }: { manual?: boolean }) {
  return <PWAInstallProvider><PWAInstallBanner manual={manual} /><State /></PWAInstallProvider>
}
function promptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = jest.fn<Promise<unknown>, []>().mockResolvedValue(undefined)
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome }) })
  act(() => { window.dispatchEvent(event) })
  return { event, prompt }
}
const matchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia')
const userAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
const platform = Object.getOwnPropertyDescriptor(navigator, 'platform')
const touch = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints')
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn((query: string) => ({
    media: query, matches: false, onchange: null, addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: () => true,
  })) })
})
afterEach(() => {
  jest.restoreAllMocks()
  if (matchMedia) Object.defineProperty(window, 'matchMedia', matchMedia)
  else Reflect.deleteProperty(window, 'matchMedia')
  for (const [key, descriptor] of [['userAgent', userAgent], ['platform', platform], ['maxTouchPoints', touch]] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor)
    else Reflect.deleteProperty(navigator, key)
  }
})
it('consumes one browser prompt across competing entry points and hides after acceptance', async () => {
  render(<App />)
  const { event, prompt } = promptEvent()
  expect(event.defaultPrevented).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  fireEvent.click(screen.getByRole('button', { name: 'Other install entry' }))
  await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText('Installation status')).toHaveTextContent('false')
  act(() => { window.dispatchEvent(new Event('appinstalled')) })
  expect(screen.getByLabelText('Installation status')).toHaveTextContent('true')
  expect(prompt).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('region', { name: 'Install METARDU' })).not.toBeInTheDocument()
})
it('handles a rejected native prompt without an unhandled error or a reusable stale event', async () => {
  render(<App manual />)
  const prompt = jest.fn<Promise<unknown>, []>().mockRejectedValue(new Error('Native installer unavailable'))
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) })
  act(() => { window.dispatchEvent(event) })
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('browser menu')
  expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Other install entry' }))
  expect(prompt).toHaveBeenCalledTimes(1)
})
it('respects cancellation and still permits explicit installation from the guide', async () => {
  const { unmount } = render(<App />)
  const { prompt } = promptEvent('dismissed')
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Install METARDU' })).not.toBeInTheDocument())
  expect(prompt).toHaveBeenCalledTimes(1)
  unmount()
  render(<App manual />)
  promptEvent()
  expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument()
})
it('responds to installation completed through browser UI', () => {
  render(<App />)
  promptEvent()
  act(() => { window.dispatchEvent(new Event('appinstalled')) })
  expect(screen.getByLabelText('Installation status')).toHaveTextContent('true')
  expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
})
it('recognizes standalone launches without advertising another installation', () => {
  jest.mocked(window.matchMedia).mockImplementation(query => ({
    media: query, matches: query.includes('standalone'), onchange: null, addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: () => true,
  }))
  render(<App manual />)
  expect(screen.getByRole('heading', { name: 'METARDU is installed' })).toBeInTheDocument()
  const { event } = promptEvent()
  expect(event.defaultPrevented).toBe(false)
})
it('recognizes iPad desktop-mode browsers for manual Safari guidance', () => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Macintosh) AppleWebKit Safari' })
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 })
  render(<App manual />)
  expect(screen.getByLabelText('Apple mobile browser')).toHaveTextContent('true')
  expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument()
  expect(screen.getByText(/Use the steps below/)).toBeInTheDocument()
})
it('removes both global event listeners when the provider unmounts', () => {
  const remove = jest.spyOn(window, 'removeEventListener')
  const { unmount } = render(<App />)
  unmount()
  expect(remove).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('appinstalled', expect.any(Function))
})

it('keeps the captured prompt when navigating from a workspace banner to the guide', async () => {
  const { rerender } = render(<PWAInstallProvider><PWAInstallBanner key="workspace" /></PWAInstallProvider>)
  const { prompt } = promptEvent()
  rerender(<PWAInstallProvider><PWAInstallBanner key="guide" manual /></PWAInstallProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  expect(await screen.findByRole('heading', { name: 'Finish installing METARDU' })).toBeInTheDocument()
  act(() => { window.dispatchEvent(new Event('appinstalled')) })
  expect(screen.getByRole('heading', { name: 'METARDU is installed' })).toBeInTheDocument()
  expect(prompt).toHaveBeenCalledTimes(1)
})
