interface AutoDeliverySession {
  getSnapshot(): { pendingSyncCount: number; isSyncing: boolean }
  syncNow(options: { automatic: true }): Promise<unknown>
}

/** A stable cadence independent of pending-count and syncing state changes. */
export function startFieldAutoDelivery(session: AutoDeliverySession): () => void {
  const sync = () => {
    const current = session.getSnapshot()
    if (current.pendingSyncCount > 0 && !current.isSyncing) void session.syncNow({ automatic: true })
  }
  const initial = setTimeout(sync, 2000)
  const interval = setInterval(sync, 30000)
  return () => { clearTimeout(initial); clearInterval(interval) }
}
