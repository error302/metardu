import { createHash } from 'node:crypto'
import { createClient } from 'redis'
import { rateLimit } from '@/lib/security/rateLimit'

let client: ReturnType<typeof createClient> | undefined
let connecting: Promise<unknown> | undefined

const incrementWindow = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`

/** Share signup and verification counters across application processes. */
export async function limitAccountSetup(identifier: string, maxRequests: number, windowMs: number) {
  const url = process.env.REDIS_URL
  if (!url) return rateLimit(identifier, maxRequests, windowMs)

  if (!connecting && !client?.isReady) {
    client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 2_000, reconnectStrategy: false } })
    // The calling route handles a failed shared limiter as a temporary error.
    client.on('error', () => {})
    connecting = client.connect().finally(() => { connecting = undefined })
  }
  await connecting
  if (!client?.isReady) throw new Error('Account setup limiter unavailable')
  const key = 'metardu:account-setup:' + createHash('sha256').update(identifier).digest('hex')
  const count = await client.eval(incrementWindow, { keys: [key], arguments: [String(windowMs)] })
  if (typeof count !== 'number' || !Number.isSafeInteger(count)) throw new Error('Account setup limit was not confirmed')
  return { allowed: count <= maxRequests, remaining: Math.max(0, maxRequests - count) }
}
