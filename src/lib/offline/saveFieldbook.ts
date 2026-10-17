import type { BrowserClient, QueryResult } from '@/lib/api-client/client'
import { stageFieldbookSave } from './fieldbooks'
import { removeSyncedOperation } from './syncQueue'

/** A device save is durable before any network attempt. Only a returned ID is an acknowledgement. */
export async function persistFieldbook(client: BrowserClient, record: Record<string, unknown>, online: boolean) {
  const operationId = await stageFieldbookSave(record)
  if (!online) return { pending: true, message: 'Saved on this device. Waiting for a connection.' }
  try {
    const session = await client.auth.getSession()
    if (!session.data.session?.user?.id || session.data.session.user.id !== record.user_id) {
      return { pending: true, message: 'Saved on this device. Sign in as this book’s owner before syncing.' }
    }
    const { data, error } = await client.from('fieldbooks').upsert(record).select('id').single() as QueryResult<unknown>
    if (error || !data || typeof data !== 'object' || !('id' in data) || data.id !== record.id) {
      return { pending: true, message: 'Saved on this device. Server confirmation is pending; use Sync to retry.' }
    }
    await removeSyncedOperation(operationId)
    return { pending: false, message: 'Saved to your project.' }
  } catch {
    return { pending: true, message: 'Saved on this device. Server confirmation is pending; use Sync to retry.' }
  }
}
