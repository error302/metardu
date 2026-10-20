/** Same-origin, empty landing document populated by the authorized plan viewer. */
export function GET() {
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Preparing survey print sheet</title></head><body><p>Preparing the A3 survey sheet… If this tab stays empty, return to the saved plan and reopen Print A3 sheet.</p></body></html>', {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
