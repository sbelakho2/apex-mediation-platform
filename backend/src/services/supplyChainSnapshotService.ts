import path from 'node:path'
import fs from 'node:fs/promises'
import { getSupplyChainStatus } from './supplyChainStatusService'
import type { PlacementRow } from '../repositories/placementRepository'
import * as snapshotRepo from '../repositories/supplyChainSnapshotRepository'

type PlacementSupplyChainStatus = {
  placementId: string
  placementName: string
  domain?: string
  sellerId?: string
  appStoreId?: string
  siteId?: string
  authorized: boolean
  reason?: string
}

type AppSupplyChainSummary = {
  appId: string
  ok: number
  issues: number
  missingDomain: number
  placements: PlacementSupplyChainStatus[]
}

type SummaryResult = {
  publisherId: string
  generatedAt: string
  apps: AppSupplyChainSummary[]
}

const DEFAULT_SNAPSHOT_DIR = path.resolve(process.cwd(), 'data', 'weak-supervision', 'supply-chain', 'snapshots')

export async function buildSupplyChainSummary(publisherId: string, placements: PlacementRow[]): Promise<SummaryResult> {
  const byApp = new Map<string, AppSupplyChainSummary>()

  for (const placement of placements) {
    const supplyChain = (placement.config as any)?.supplyChain
    const appId = placement.app_id
    if (!byApp.has(appId)) {
      byApp.set(appId, { appId, ok: 0, issues: 0, missingDomain: 0, placements: [] })
    }
    const summary = byApp.get(appId)!

    if (!supplyChain?.domain) {
      summary.missingDomain += 1
      summary.placements.push({
        placementId: placement.id,
        placementName: placement.name,
        authorized: false,
        reason: 'No supplyChain domain configured for placement',
      })
      continue
    }

    try {
      const status = await getSupplyChainStatus({
        domain: supplyChain.domain,
        sellerId: supplyChain.sellerId,
        appStoreId: supplyChain.appStoreId,
        siteId: supplyChain.siteId,
      })
      const record: PlacementSupplyChainStatus = {
        placementId: placement.id,
        placementName: placement.name,
        domain: supplyChain.domain,
        sellerId: supplyChain.sellerId,
        appStoreId: supplyChain.appStoreId,
        siteId: supplyChain.siteId,
        authorized: status.authorized,
        reason: status.authorized ? undefined : status.reason,
      }
      if (status.authorized) summary.ok += 1
      else summary.issues += 1
      summary.placements.push(record)
    } catch (error) {
      summary.issues += 1
      summary.placements.push({
        placementId: placement.id,
        placementName: placement.name,
        domain: supplyChain.domain,
        sellerId: supplyChain.sellerId,
        appStoreId: supplyChain.appStoreId,
        siteId: supplyChain.siteId,
        authorized: false,
        reason: 'Supply chain status lookup failed',
      })
    }
  }

  return {
    publisherId,
    generatedAt: new Date().toISOString(),
    apps: Array.from(byApp.values()),
  }
}

export async function persistSupplyChainSummary(summary: SummaryResult, snapshotDir: string = DEFAULT_SNAPSHOT_DIR) {
  await fs.mkdir(snapshotDir, { recursive: true })
  const outPath = path.join(snapshotDir, `${summary.publisherId}.json`)
  await fs.writeFile(outPath, JSON.stringify(summary, null, 2), 'utf8')

  const persisted = await snapshotRepo.insertSnapshot(summary.publisherId, summary, summary.generatedAt)

  return {
    snapshotId: persisted.id,
    snapshotPath: outPath,
    generatedAt: persisted.generated_at,
    summary: (persisted.summary as SummaryResult) ?? summary,
  }
}

export async function getLatestSupplyChainSummary(
  publisherId: string
): Promise<{ summary: SummaryResult; snapshotId: string; persistedAt: string } | null> {
  const latest = await snapshotRepo.getLatestSnapshot(publisherId)
  if (!latest) return null

  const summary = latest.summary as SummaryResult
  if (!summary.generatedAt) {
    summary.generatedAt = latest.generated_at
  }

  return { summary, snapshotId: latest.id, persistedAt: latest.generated_at }
}
