/**
 * Self-contained security headers test (no running server required).
 * We import next.config.js and assert the configured headers and values.
 */
// @ts-expect-error — CJS export from next.config.js
const nextConfig = require('../../next.config.js')

type Header = { key: string; value: string }

function toMap(headers: Header[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const h of headers) {
    map[h.key.toLowerCase()] = h.value
  }
  return map
}

describe('Website Security Headers (config)', () => {
  it('defines strict security headers on all routes', async () => {
    const rules = await nextConfig.headers()
    const all = rules.find((r: any) => r.source === '/:path*')
    expect(all).toBeTruthy()
    const map = toMap(all.headers as Header[])

    expect(map['x-dns-prefetch-control']).toBe('on')
    expect(map['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload')
    expect(map['x-content-type-options']).toBe('nosniff')
    expect(map['x-frame-options']).toBe('DENY')
    expect(map['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(map['permissions-policy']).toContain('camera=()')

    // Content-Security-Policy exact directives
    const csp = map['content-security-policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("img-src 'self' data: https:")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("connect-src 'self' https:")
    expect(csp).toContain("font-src 'self' data:")

    // In non-production test env we do not require 'upgrade-insecure-requests'
    // but if present it should not fail the test.
    // Optionally verify it appears only when NODE_ENV=production in separate env test.
  })
})
