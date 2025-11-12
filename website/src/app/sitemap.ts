import type { MetadataRoute } from 'next'

/**
 * Next.js app router sitemap generator.
 * Ensures About and Contact are included alongside core marketing routes.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'http://localhost:3000'
  const now = new Date().toISOString()

  const routes = ['/', '/pricing', '/documentation', '/about', '/contact']

  return routes.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '/' ? 1 : 0.7,
  }))
}
