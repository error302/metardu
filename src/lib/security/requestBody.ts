/** Read a streamed request body without buffering beyond its configured byte limit. */
export async function readBytesBounded(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const all = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    all.set(chunk, offset)
    offset += chunk.byteLength
  }
  return all
}

export async function readTextBounded(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> {
  const all = await readBytesBounded(body, maxBytes)
  if (all === null) return null
  try { return new TextDecoder('utf-8', { fatal: true }).decode(all) } catch { return null }
}
