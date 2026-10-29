/* METARDU survey reminders. Imported by the root Workbox service worker. */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'METARDU_PUSH_CAPABILITY' && event.ports[0]) {
    event.ports[0].postMessage({ version: 1, reminderPush: true })
  }
})
function reminderUrl(value) {
  try {
    const url = new URL(value, self.location.origin)
    if (url.origin === self.location.origin && url.pathname === '/schedule') return url.href
  } catch { /* Invalid input opens the schedule safely. */ }
  return self.location.origin + '/schedule'
}
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let id = null
    try {
      const payload = event.data && event.data.json()
      if (payload && typeof payload.outboxId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.outboxId)) id = payload.outboxId
    } catch { /* Always provide a visible, non-sensitive fallback. */ }
    let message = { title: 'METARDU survey reminder', body: 'Open METARDU and sign in to view your scheduled survey.', url: '/schedule' }
    if (id) {
      try {
        const response = await fetch('/api/push/messages/' + id, { credentials: 'include', cache: 'no-store', redirect: 'error' })
        if (response.ok) {
          const value = await response.json()
          if (value && typeof value.title === 'string' && typeof value.body === 'string' && typeof value.url === 'string') {
            message = { title: value.title.slice(0, 240), body: value.body.slice(0, 600), url: value.url }
          }
        }
      } catch { /* Network/session failure must not expose another account's details. */ }
    }
    await self.registration.showNotification(message.title, {
      body: message.body, icon: '/icons/icon-192.png', badge: '/icons/icon-96.png',
      tag: id ? 'survey-' + id : 'metardu-survey-reminder',
      data: { url: reminderUrl(message.url) }, renotify: false,
    })
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = reminderUrl(event.notification.data && event.notification.data.url)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const exact = windows.find(client => client.url === url)
    if (exact) return exact.focus()
    // Do not navigate an existing working tab and discard unsaved survey work.
    return self.clients.openWindow(url)
  })())
})
