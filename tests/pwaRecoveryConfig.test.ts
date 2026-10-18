/** @jest-environment node */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

it('keeps updates and navigation under operator control without caching private documents', () => {
  let options: Record<string, any> = {}
  const identity = (config: unknown) => config
  vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), 'next.config.js'), 'utf8'), {
    module: { exports: {} },
    process: { env: { NODE_ENV: 'production' }, platform: 'linux', cwd: () => process.cwd() },
    console,
    require: (name: string) => {
      if (name === '@next/bundle-analyzer') return () => identity
      if (name === '@ducanh2912/next-pwa') return { default: (config: typeof options) => { options = config; return identity } }
      if (name === '@sentry/nextjs') return { withSentryConfig: identity }
      throw new Error(`Unexpected config import: ${name}`)
    },
  })
  expect(options.reloadOnOnline).toBe(false)
  expect(options.cacheStartUrl).toBe(false)
  expect(options.dynamicStartUrl).toBe(false)
  expect(options.workboxOptions.skipWaiting).toBe(false)
  expect(options.workboxOptions.clientsClaim).toBe(false)
  expect(options.fallbacks.document).toBe('/offline')
  expect(options.workboxOptions.runtimeCaching).toHaveLength(1)
  const navigation = options.workboxOptions.runtimeCaching[0]
  expect(navigation.handler).toBe('NetworkOnly')
  // next-pwa attaches handlerDidError only to entries with an options object.
  expect(navigation.options).toEqual({})
  expect(navigation.urlPattern({ request: { mode: 'navigate' } })).toBe(true)
  expect(navigation.urlPattern({ request: { mode: 'cors' } })).toBe(false)
})
