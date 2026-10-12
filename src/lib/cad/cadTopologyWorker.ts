/** Keep polygonization in its own worker chunk, outside page rendering and initial landing loads. */
export function createCadTopologyWorker(): Worker {
  return new Worker(new URL('./cadTopology.worker.ts', import.meta.url), { type: 'module' })
}
