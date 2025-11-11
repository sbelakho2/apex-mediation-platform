// CSRF helpers for cookie-based sessions

export const XSRF_COOKIE_NAME = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME || 'XSRF-TOKEN'

export function readXsrfCookie(): string | null {
  if (typeof document === 'undefined') return null
  const name = XSRF_COOKIE_NAME + '='
  const parts = document.cookie.split(';')
  for (let c of parts) {
    c = c.trim()
    if (c.startsWith(name)) return decodeURIComponent(c.substring(name.length))
  }
  return null
}

export async function getCsrfToken(baseUrl?: string): Promise<string | null> {
  try {
    const url = (baseUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1') + '/auth/csrf'
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data?.token || readXsrfCookie()
  } catch {
    return null
  }
}
