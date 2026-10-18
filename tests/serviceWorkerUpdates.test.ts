import { requestServiceWorkerActivation, watchServiceWorkerUpdates } from '@/lib/app/serviceWorkerUpdates'

function fixture() {
  const worker = Object.assign(new EventTarget(), { state: 'installed', postMessage: jest.fn() })
  const registration = Object.assign(new EventTarget(), { waiting: worker, installing: null as typeof worker | null })
  const container = Object.assign(new EventTarget(), {
    controller: {} as unknown,
    getRegistration: jest.fn().mockResolvedValue(registration),
    ready: Promise.resolve(registration),
  })
  return { worker, registration, container, api: container as unknown as ServiceWorkerContainer, sw: worker as unknown as ServiceWorker }
}

describe('update observation', () => {
  it('observes a registration created after mount exactly once and detaches on disposal', async () => {
    const f = fixture()
    f.container.getRegistration.mockResolvedValue(undefined)
    let ready!: (value: typeof f.registration) => void
    f.container.ready = new Promise(resolve => { ready = resolve })
    const notify = jest.fn()
    const stop = watchServiceWorkerUpdates(f.api, notify)
    await Promise.resolve()
    expect(notify).not.toHaveBeenCalled()
    ready(f.registration)
    await Promise.resolve()
    expect(notify).toHaveBeenCalledWith(f.worker)
    expect(notify).toHaveBeenCalledTimes(1)
    stop()
    f.worker.dispatchEvent(new Event('statechange'))
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('detects a new installing worker but does not announce first installation', async () => {
    const f = fixture()
    f.registration.waiting = null as unknown as typeof f.worker
    const notify = jest.fn()
    const stop = watchServiceWorkerUpdates(f.api, notify)
    await Promise.resolve()
    f.worker.state = 'installing'
    f.registration.installing = f.worker
    f.registration.dispatchEvent(new Event('updatefound'))
    expect(notify).not.toHaveBeenCalled()
    f.worker.state = 'installed'
    f.container.controller = null
    f.worker.dispatchEvent(new Event('statechange'))
    expect(notify).not.toHaveBeenCalled()
    f.container.controller = {}
    f.worker.dispatchEvent(new Event('statechange'))
    expect(notify).toHaveBeenCalledTimes(1)
    stop()
  })

  it('ignores ready promises resolved after unmount', async () => {
    const f = fixture()
    const notify = jest.fn()
    const stop = watchServiceWorkerUpdates(f.api, notify)
    stop()
    await Promise.resolve()
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('deliberate activation', () => {
  afterEach(() => jest.useRealTimers())
  it('waits for this worker to activate, including without clientsClaim', async () => {
    const f = fixture()
    const remove = jest.spyOn(f.container, 'removeEventListener')
    const promise = requestServiceWorkerActivation(f.api, f.sw, { signal: new AbortController().signal })
    expect(f.worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    const done = jest.fn()
    void promise.then(done)
    f.container.dispatchEvent(new Event('controllerchange'))
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    f.worker.state = 'activated'
    f.worker.dispatchEvent(new Event('statechange'))
    await expect(promise).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalledWith('controllerchange', expect.any(Function))
  })

  it('rejects timeout without navigating and removes listeners', async () => {
    jest.useFakeTimers()
    const f = fixture()
    const remove = jest.spyOn(f.worker, 'removeEventListener')
    const result = requestServiceWorkerActivation(f.api, f.sw, { signal: new AbortController().signal, timeoutMs: 50 })
    const assertion = expect(result).rejects.toThrow(/has not reloaded/)
    jest.advanceTimersByTime(51)
    await assertion
    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each(['redundant', 'abort', 'message failure'])('rejects %s without leaving background timers', async reason => {
    jest.useFakeTimers()
    const f = fixture()
    const controller = new AbortController()
    if (reason === 'message failure') f.worker.postMessage.mockImplementation(() => { throw new Error('Worker unavailable') })
    const result = requestServiceWorkerActivation(f.api, f.sw, { signal: controller.signal })
    const assertion = expect(result).rejects.toThrow()
    if (reason === 'abort') controller.abort()
    if (reason === 'redundant') { f.worker.state = 'redundant'; f.worker.dispatchEvent(new Event('statechange')) }
    await assertion
    expect(jest.getTimerCount()).toBe(0)
  })
})
