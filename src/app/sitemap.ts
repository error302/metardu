import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.duckdns.org'

  const routes = [
    '',
    '/login',
    '/register',
    '/pricing',
    '/community',
    '/help',
    '/map',
    '/fieldbook',
    '/tools/all',
    '/tools/cogo',
    '/tools/traverse',
    '/tools/leveling',
    '/tools/coordinates',
    '/tools/area',
    '/tools/distance',
    '/tools/bearing',
    '/tools/curves',
    '/tools/cut-fill',
    '/tools/deformation',
    '/tools/gcp-optimizer',
    '/tools/lsa',
    '/field-records',
    '/report-templates',
    '/sectional',
    '/marketplace',
    '/beacons',
    '/analytics',
    '/docs',
    '/docs/quick-start',
    '/docs/first-plan',
  ]

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : route.startsWith('/tools') ? 0.7 : 0.8,
  }))
}
