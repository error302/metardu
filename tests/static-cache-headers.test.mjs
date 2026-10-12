import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

test('development chunks cannot remain immutable under their unversioned URLs', async () => {
  const previous = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'development'
    const config = require('../next.config.js')
    const rules = await config.headers()
    const cache = rules.find(rule => rule.source === '/_next/static/:path*').headers.find(header => header.key === 'Cache-Control').value
    assert.match(cache, /no-store/)
    assert.doesNotMatch(cache, /immutable/)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
})

test('production retains long-lived caching for versioned Next assets', async () => {
  const previous = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = 'production'
    const rules = await require('../next.config.js').headers()
    const cache = rules.find(rule => rule.source === '/_next/static/:path*').headers.find(header => header.key === 'Cache-Control').value
    assert.equal(cache, 'public, max-age=31536000, immutable')
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
})
