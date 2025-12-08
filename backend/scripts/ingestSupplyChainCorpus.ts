import fs from 'node:fs/promises'
import path from 'node:path'
import { ingestAppAdsCorpus, ingestSellersFromUrls, InventoryDomain, writeJsonFile } from '../src/services/appAdsIngestion'

async function main() {
  const inventoryPath = process.env.INVENTORY_FILE || path.resolve(process.cwd(), '..', 'data', 'weak-supervision', 'supply-chain', 'inventory.json')
  const outputAppAds = process.env.OUTPUT_APP_ADS || path.resolve(process.cwd(), '..', 'data', 'weak-supervision', 'supply-chain', 'app-ads.json')
  const sellersUrlsEnv = process.env.SELLERS_URLS || ''
  const outputSellers = process.env.SELLERS_OUTPUT || path.resolve(process.cwd(), '..', 'data', 'weak-supervision', 'supply-chain', 'sellers.json')

  const inventoryRaw = await fs.readFile(inventoryPath, 'utf8')
  const inventory = JSON.parse(inventoryRaw) as InventoryDomain[]

  const corpus = await ingestAppAdsCorpus(inventory)
  await writeJsonFile(outputAppAds, corpus)
  console.log(`[ingest] wrote app-ads corpus for ${Object.keys(corpus).length} domains -> ${outputAppAds}`)

  if (sellersUrlsEnv.trim().length > 0) {
    const urls = sellersUrlsEnv.split(',').map((u) => u.trim()).filter(Boolean)
    const sellers = await ingestSellersFromUrls(urls)
    await writeJsonFile(outputSellers, sellers)
    console.log(`[ingest] wrote sellers directory with ${Object.keys(sellers).length} entries -> ${outputSellers}`)
  }
}

main().catch((err) => {
  console.error('[ingest] failed', err)
  process.exit(1)
})
