/**
 * Content Security Policy — nonce-based CSP headers
 *
 * Generates per-request CSP with a cryptographic nonce.
 * The nonce is generated in middleware and passed to pages via
 * the <meta> tag / script tag so inline scripts can be allowed
 * selectively rather than blanket 'unsafe-inline'.
 */

import crypto from 'crypto'

/**
 * Generate a cryptographically random nonce string.
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64')
}

/**
 * Build CSP header value for a given nonce.
 * In development, 'unsafe-eval' is added for HMR / hot reload.
 */
export function getCspHeaders(nonce: string) {
  const isDev = process.env.NODE_ENV === 'development'

  return {
    'Content-Security-Policy': [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' https://fonts.gstatic.com`,
      `img-src 'self' data: blob: https:`,
      `connect-src 'self' ${isDev ? 'ws://localhost:* http://localhost:*' : ''} wss: https:`,
      `frame-src 'none'`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      `frame-ancestors 'none'`,
      `upgrade-insecure-requests`,
    ].join('; '),
  }
}
