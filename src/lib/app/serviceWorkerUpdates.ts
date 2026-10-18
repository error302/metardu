/** Observe existing and late registrations without claiming or refreshing a workspace. */
export function watchServiceWorkerUpdates(
  container: ServiceWorkerContainer,
  onWaiting: (worker: ServiceWorker) => void,
): () => void {
  let disposed = false
  const registrations = new Set<ServiceWorkerRegistration>()
  const workers = new Set<ServiceWorker>()
  const announced = new Set<ServiceWorker>()
  const cleanups: Array<() => void> = []
  const inspect = (worker: ServiceWorker) => {
    if (!disposed && container.controller && worker.state === 'installed' && !announced.has(worker)) {
      announced.add(worker)
      onWaiting(worker)
    }
  }
  const observeWorker = (worker: ServiceWorker | null) => {
    if (!worker || workers.has(worker)) return
    workers.add(worker)
    const changed = () => inspect(worker)
    worker.addEventListener('statechange', changed)
    cleanups.push(() => worker.removeEventListener('statechange', changed))
    inspect(worker)
  }
  const observe = (registration: ServiceWorkerRegistration | undefined) => {
    if (disposed || !registration || registrations.has(registration)) return
    registrations.add(registration)
    const changed = () => {
      observeWorker(registration.waiting)
      observeWorker(registration.installing)
    }
    registration.addEventListener('updatefound', changed)
    cleanups.push(() => registration.removeEventListener('updatefound', changed))
    changed()
  }
  void container.getRegistration().then(observe).catch(() => { /* Registration unavailable. */ })
  void container.ready.then(observe).catch(() => { /* No background reload or retry loop. */ })
  return () => { disposed = true; cleanups.forEach(cleanup => cleanup()) }
}

/** Request activation only after consent. A timeout must never force a reload. */
export function requestServiceWorkerActivation(
  container: ServiceWorkerContainer,
  worker: ServiceWorker,
  { signal, timeoutMs = 15000 }: { signal: AbortSignal; timeoutMs?: number },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false
    const cleanup = () => {
      clearTimeout(timeout)
      container.removeEventListener('controllerchange', changed)
      worker.removeEventListener('statechange', changed)
      signal.removeEventListener('abort', aborted)
    }
    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const changed = () => {
      if (worker.state === 'activated' || container.controller === worker) finish()
      else if (worker.state === 'redundant') finish(new Error('This update is no longer available. Check again later.'))
    }
    const aborted = () => finish(new Error('Update cancelled. Your page has not reloaded.'))
    const timeout = setTimeout(() => finish(new Error('The update did not become ready. Your page has not reloaded; try again later.')), timeoutMs)
    if (signal.aborted) { aborted(); return }
    container.addEventListener('controllerchange', changed)
    worker.addEventListener('statechange', changed)
    signal.addEventListener('abort', aborted, { once: true })
    changed()
    if (finished) return
    try { worker.postMessage({ type: 'SKIP_WAITING' }) }
    catch { finish(new Error('The update could not start. Your page has not reloaded.')) }
  })
}
