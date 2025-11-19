import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Project structure: console/ is a workspace alongside the repo root.
    // The user-provided logo lives at repo root as `logo.jpg`.
    const filePath = path.join(process.cwd(), '..', 'logo.jpg')
    const data = await fs.readFile(filePath)
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        // Cache aggressively; bust by redeploy or by changing the file content
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Logo not found' }, { status: 404 })
  }
}
