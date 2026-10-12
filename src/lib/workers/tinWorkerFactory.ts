/** Keep the constructor and literal URL together so Webpack emits executable worker JavaScript. */
export function createTinWorker(): Worker {
  return new Worker(new URL('./tinWorker.ts', import.meta.url), { type: 'module' })
}
