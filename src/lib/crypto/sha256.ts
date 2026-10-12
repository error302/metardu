/**
 * sha256Hex — universal SHA-256 hex digest (browser + Node 18+).
 *
 * Uses the platform SubtleCrypto (globalThis.crypto.subtle), which exists in
 * every environment METARDU targets (HTTPS browsers, Node >= 18, workers).
 * Importing node:crypto instead forces webpack to bundle crypto-browserify
 * (~390 KB of polyfills) into any client-reachable chunk graph.
 *
 * FAIL CLOSED, mirroring hashComputationData in engine/auditTrail.ts: if no
 * SubtleCrypto is available we throw rather than emit a weak hash — these
 * digests anchor court-grade verification codes (Survey Act Cap. 299).
 */
export async function sha256Hex(input: string): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (!subtle) {
    throw new Error(
      'SubtleCrypto (SHA-256) is unavailable in this environment. ' +
      'Refusing to emit a non-cryptographic hash — verification codes ' +
      'require a collision-resistant digest (Survey Act Cap. 299).'
    )
  }
  const data = new TextEncoder().encode(input)
  const digest = await subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
