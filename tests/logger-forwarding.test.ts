/** @jest-environment node */
const mockCaptureException = jest.fn()
const mockErrorOutput = jest.fn()
jest.mock('@sentry/nextjs', () => ({ captureException: mockCaptureException }))
const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const settle = async () => {
  await new Promise<void>(resolve => setImmediate(resolve))
  await new Promise<void>(resolve => setImmediate(resolve))
}
beforeEach(() => {
  jest.resetModules()
  mockCaptureException.mockClear()
  mockErrorOutput.mockClear()
  jest.spyOn(console, 'error').mockImplementation(mockErrorOutput)
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN
  else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn
  jest.restoreAllMocks()
})

test('server logger forwards an Error without another module preloading monitoring', async () => {
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://synthetic.invalid/1'
  const { logger } = jest.requireActual<typeof import('@/lib/logger')>('@/lib/logger')
  const error = new Error('synthetic forwarding fixture')
  logger.error('Background processing failed', { error, requestId: 'synthetic-request' })
  await settle()
  expect(mockCaptureException).toHaveBeenCalledTimes(1)
  expect(mockCaptureException).toHaveBeenCalledWith(error, { extra: {
    message: 'Background processing failed', requestId: 'synthetic-request', error,
  } })
})

test('development reporting remains bounded by the existing recursion guard', async () => {
  delete process.env.NEXT_PUBLIC_SENTRY_DSN
  const { logger } = jest.requireActual<typeof import('@/lib/logger')>('@/lib/logger')
  logger.error('Synthetic local error', { error: new Error('synthetic') })
  await settle()
  expect(mockErrorOutput).toHaveBeenCalledTimes(2)
  expect(mockCaptureException).not.toHaveBeenCalled()
})

test('NO_FORWARD retains local output without sending another monitoring event', async () => {
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://synthetic.invalid/1'
  const { logger, NO_FORWARD } = jest.requireActual<typeof import('@/lib/logger')>('@/lib/logger')
  logger.error('Already captured', { error: new Error('synthetic'), [NO_FORWARD]: true })
  await settle()
  expect(mockErrorOutput).toHaveBeenCalledTimes(1)
  expect(mockCaptureException).not.toHaveBeenCalled()
})

test('ordinary messages and non-Error values do not become exception reports', async () => {
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://synthetic.invalid/1'
  const { logger } = jest.requireActual<typeof import('@/lib/logger')>('@/lib/logger')
  logger.info('Synthetic status')
  logger.warn('Synthetic warning')
  logger.error('Synthetic text error', { error: 'unstructured fixture' })
  await settle()
  expect(mockCaptureException).not.toHaveBeenCalled()
})
