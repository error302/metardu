import { sanitizeShareTelemetry } from '@/lib/monitoring/privateShareTelemetry'
it('omits events on recipient and owner capability screens', () => {
  for (const path of ['/p/uuid', '/project/uuid/scheme/shares']) {
    window.history.replaceState({}, '', `${path}#key=secret`)
    expect(
      sanitizeShareTelemetry({
        request: { url: 'http://localhost/api/anything' },
      }),
    ).toBeNull()
  }
})
it('omits server capability errors and transactions even without a browser sharing screen', () => {
  window.history.replaceState({}, '', '/dashboard')
  for (const path of [
    '/api/public/parcel/uuid',
    '/api/project/uuid/scheme/shares',
    '/api/v1/public/parcel/uuid',
  ])
    expect(
      sanitizeShareTelemetry({
        request: { url: `https://metardu.test${path}` },
      }),
    ).toBeNull()
})
it('strips query secrets and fragments from retained telemetry URLs and request headers', () => {
  window.history.replaceState({}, '', '/dashboard')
  const result = sanitizeShareTelemetry({
    request: {
      url: 'https://metardu.test/dashboard?token=private#key=secret',
      headers: {
        Authorization: 'Bearer secret',
        cookie: 'session=secret',
        Accept: 'json',
      },
    },
    breadcrumbs: [
      {
        category: 'navigation',
        data: { to: '/dashboard#key=secret', from: '/projects?key=private' },
      },
    ],
  })
  expect(JSON.stringify(result)).not.toMatch(/secret|private|session=/)
  expect(result?.request.headers.Accept).toBe('json')
})
