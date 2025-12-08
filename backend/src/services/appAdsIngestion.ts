import axios from 'axios'
import fs from 'node:fs/promises'
import path from 'node:path'
import logger from '../utils/logger'
import { fetchAppAdsTxt, parseLines } from './appAdsInspectorService'

export type InventoryDomain = {
  domain: string
  appStoreId?: string
  siteId?: string
}

export type AppAdsEntry = {
  sellerId: string
  relationship?: string
  appStoreId?: string
  siteId?: string
}

export type SupplyChainCorpusData = Record<string, AppAdsEntry[]>

export type SellersDirectoryEntry = {
  sellerId: string
  domain?: string
  name?: string
  status?: 'active' | 'inactive'
}

export type SellersDirectory = Record<string, SellersDirectoryEntry>

type AppAdsFetcher = (domain: string) => Promise<{ status: number; text: string }>
type UrlFetcher = (url: string) => Promise<{ status: number; text: string }>

export function parseAppAdsRecords(lines: string[], meta?: { appStoreId?: string; siteId?: string }): AppAdsEntry[] {
  const entries: AppAdsEntry[] = []
  const seen = new Set<string>()

  lines.forEach((line) => {
    const tokens = line.split(',').map((t) => t.trim()).filter(Boolean)
    if (tokens.length < 3) {
      return
    }

    const sellerId = tokens[1]
    const relationship = tokens[2]?.toUpperCase()
    if (!sellerId || sellerId.length === 0) {
      return
    }

    const key = `${sellerId}:${relationship}`
    if (seen.has(key)) {
      return
    }
    seen.add(key)

    entries.push({
      sellerId,
      relationship,
      appStoreId: meta?.appStoreId,
      siteId: meta?.siteId,
    })
  })

  return entries
}

export async function ingestAppAdsCorpus(
  inventory: InventoryDomain[],
  fetcher: AppAdsFetcher = fetchAppAdsTxt
): Promise<SupplyChainCorpusData> {
  const corpus: SupplyChainCorpusData = {}

  for (const item of inventory) {
    const domain = item.domain.trim()
    if (!domain) continue

    try {
      const res = await fetcher(domain)
      if (res.status >= 400) {
        logger.warn('[AppAdsIngestion] Skipping domain due to HTTP status', { domain, status: res.status })
        continue
      }

      const lines = parseLines(res.text)
      const entries = parseAppAdsRecords(lines, { appStoreId: item.appStoreId, siteId: item.siteId })
      if (entries.length > 0) {
        corpus[domain.toLowerCase()] = entries
      }
    } catch (error) {
      logger.warn('[AppAdsIngestion] Failed to ingest domain', { domain, error })
    }
  }

  return corpus
}

type SellersJson = {
  sellers?: Array<{
    seller_id: string
    name?: string
    domain?: string
    status?: string
  }>
}

export function parseSellersDirectory(data: unknown): SellersDirectory {
  const directory: SellersDirectory = {}
  const json = data as SellersJson
  if (!Array.isArray(json?.sellers)) return directory

  for (const seller of json.sellers) {
    if (!seller?.seller_id) continue
    const entry: SellersDirectoryEntry = {
      sellerId: seller.seller_id,
      name: seller.name,
      domain: seller.domain,
    }
    if (seller.status === 'inactive') entry.status = 'inactive'
    directory[seller.seller_id] = entry
  }
  return directory
}

const defaultUrlFetcher: UrlFetcher = async (url: string) => {
  const resp = await axios.get(url, { validateStatus: () => true, responseType: 'text' })
  return { status: resp.status, text: resp.data?.toString?.() ?? '' }
}

export async function ingestSellersFromUrls(urls: string[], fetcher: UrlFetcher = defaultUrlFetcher): Promise<SellersDirectory> {
  const directory: SellersDirectory = {}

  for (const url of urls) {
    if (!url) continue
    try {
      const res = await fetcher(url)
      if (res.status >= 400) {
        logger.warn('[AppAdsIngestion] Skipping sellers.json due to HTTP status', { url, status: res.status })
        continue
      }
      const parsed = parseSellersDirectory(JSON.parse(res.text))
      Object.assign(directory, parsed)
    } catch (error) {
      logger.warn('[AppAdsIngestion] Failed to ingest sellers.json', { url, error })
    }
  }

  return directory
}

export async function writeJsonFile(targetPath: string, data: unknown): Promise<void> {
  const dir = path.dirname(targetPath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(targetPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}
