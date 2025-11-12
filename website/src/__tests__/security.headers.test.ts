import http from 'http'

/**
 * This test assumes the website is running locally on port 3000.
 * CI job `website-security-headers` starts the server before running tests.
 */
describe('Website Security Headers', () => {
  const baseUrl = process.env.WEBSITE_BASE_URL || 'http://localhost:3000'

  const paths = ['/', '/about', '/contact']

  it('sets strict security headers on key routes', async () => {
    for (const p of paths) {
      const res = await request(`${baseUrl}${p}`)
      expect([200, 304]).toContain(res.statusCode)
      const headers = lowerCaseHeaders(res.headers)
      expect(headers['strict-transport-security']).toContain('max-age=')
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['x-frame-options']).toBe('DENY')
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(headers['permissions-policy']).toContain('camera=()')
      expect(headers['content-security-policy']).toContain("default-src 'self'")
    }
  })
})

function request(url: string): Promise<http.IncomingMessage & { body?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(Buffer.from(c)))
      res.on('end', () => {
        ;(res as any).body = Buffer.concat(chunks).toString('utf8')
        resolve(res as any)
      })
    })
    req.on('error', reject)
  })
}

function lowerCaseHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    if (Array.isArray(v)) out[k.toLowerCase()] = v.join(', ')
    else if (typeof v === 'string') out[k.toLowerCase()] = v
  }
  return out
}
