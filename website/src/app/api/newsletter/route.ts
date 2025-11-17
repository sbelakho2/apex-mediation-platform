import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

function isValidEmail(email: string) {
  // RFC 5322-lite, pragmatic validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let email = ''
    let honeypot = ''

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({} as any))
      email = (body.email || '').toString()
      honeypot = (body.company || body.hp || '').toString()
    } else {
      const form = await req.formData()
      email = (form.get('email') || '').toString()
      honeypot = (form.get('company') || form.get('hp') || '').toString()
    }

    if (honeypot) {
      // Likely a bot; pretend success
      return new NextResponse(null, { status: 204 })
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    // Safe production defaults: do not leak addresses; in dev write to local ndjson
    if (process.env.NODE_ENV !== 'production') {
      const websiteRoot = path.join(process.cwd())
      const logDir = path.join(websiteRoot, 'logs')
      fs.mkdirSync(logDir, { recursive: true })
      const line = JSON.stringify({ ts: new Date().toISOString(), email }) + '\n'
      fs.appendFileSync(path.join(logDir, 'newsletter-signups.ndjson'), line)
    }

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
