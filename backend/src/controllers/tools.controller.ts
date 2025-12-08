import { Request, Response } from 'express'
import { inspectAppAds } from '../services/appAdsInspectorService'
import { getSupplyChainStatus } from '../services/supplyChainStatusService'

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

/**
 * GET /api/v1/tools/supply-chain-status?domain=example.com&sellerId=123&appStoreId=com.app
 * Returns authorization status, declared entries, and seller directory context.
 */
export async function supplyChainStatus(req: Request, res: Response) {
  try {
    const { domain, sellerId, appStoreId, siteId } = req.query as {
      domain?: string
      sellerId?: string
      appStoreId?: string
      siteId?: string
    }

    if (!domain || !domain.trim()) {
      return res.status(400).json({ error: 'missing_domain', message: 'Query parameter "domain" is required' })
    }

    const status = await getSupplyChainStatus({
      domain: domain.trim(),
      sellerId: sellerId?.trim(),
      appStoreId: appStoreId?.trim(),
      siteId: siteId?.trim(),
    })

    return res.json({ success: true, data: status })
  } catch (e: any) {
    return res.status(500).json({ error: 'supply_chain_status_error', message: e?.message || 'Unknown error' })
  }
}
