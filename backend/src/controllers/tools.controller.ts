import { Request, Response } from 'express'
import { inspectAppAds } from '../services/appAdsInspectorService'

/**
 * GET /api/v1/tools/app-ads-inspector?domain=example.com
 * Optionally supports `domainOverride` in future; for now accepts explicit domain.
 */
export async function appAdsInspector(req: Request, res: Response) {
  try {
    const { domain } = req.query as { domain?: string }
    if (!domain || !domain.trim()) {
      return res.status(400).json({ error: 'missing_domain', message: 'Query parameter "domain" is required' })
    }
    const result = await inspectAppAds(domain.trim())
    return res.json(result)
  } catch (e: any) {
    return res.status(500).json({ error: 'inspector_error', message: e?.message || 'Unknown error' })
  }
}
