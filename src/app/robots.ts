import { MetadataRoute } from 'next'
import { getPublicAppUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const base = getPublicAppUrl()
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${base}/sitemap.xml`,
  }
}
