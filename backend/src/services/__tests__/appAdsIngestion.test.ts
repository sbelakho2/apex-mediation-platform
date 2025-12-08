import { ingestAppAdsCorpus, ingestSellersFromUrls, parseAppAdsRecords, parseSellersDirectory } from '../appAdsIngestion'

describe('appAdsIngestion', () => {
  test('parseAppAdsRecords normalizes lines and deduplicates', () => {
    const lines = [
      'google.com, pub-123, DIRECT, f08c47fec0942fa0',
      'google.com, pub-123, DIRECT, f08c47fec0942fa0',
      'unity.com, 999, RESELLER',
      'invalid line',
    ]

    const entries = parseAppAdsRecords(lines, { appStoreId: 'com.example.app' })

    expect(entries).toHaveLength(2)
    expect(entries[0]).toEqual({ sellerId: 'pub-123', relationship: 'DIRECT', appStoreId: 'com.example.app', siteId: undefined })
    expect(entries[1]).toEqual({ sellerId: '999', relationship: 'RESELLER', appStoreId: 'com.example.app', siteId: undefined })
  })

  test('ingestAppAdsCorpus builds corpus and skips failing domains', async () => {
    const fetcher = jest.fn()
    fetcher.mockResolvedValueOnce({ status: 200, text: 'google.com, pub-1, DIRECT' })
    fetcher.mockResolvedValueOnce({ status: 404, text: '' })

    const corpus = await ingestAppAdsCorpus(
      [
        { domain: 'ok.example', appStoreId: 'com.ok.app' },
        { domain: 'missing.example' },
      ],
      fetcher
    )

    expect(Object.keys(corpus)).toEqual(['ok.example'])
    expect(corpus['ok.example']).toEqual([
      { sellerId: 'pub-1', relationship: 'DIRECT', appStoreId: 'com.ok.app', siteId: undefined },
    ])
  })

  test('parseSellersDirectory extracts sellers array', () => {
    const directory = parseSellersDirectory({
      sellers: [
        { seller_id: '123', name: 'Test Seller', domain: 'seller.test', status: 'active' },
        { seller_id: '999', name: 'Inactive Seller', domain: 'inactive.test', status: 'inactive' },
      ],
    })

    expect(directory).toEqual({
      '123': { sellerId: '123', name: 'Test Seller', domain: 'seller.test' },
      '999': { sellerId: '999', name: 'Inactive Seller', domain: 'inactive.test', status: 'inactive' },
    })
  })

  test('ingestSellersFromUrls merges multiple sources and skips failures', async () => {
    const fetcher = jest.fn()
    fetcher
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify({ sellers: [{ seller_id: 'A', domain: 'a.com' }] }) })
      .mockResolvedValueOnce({ status: 500, text: '' })
      .mockResolvedValueOnce({ status: 200, text: JSON.stringify({ sellers: [{ seller_id: 'B', domain: 'b.com' }] }) })

    const directory = await ingestSellersFromUrls(['https://one', 'https://two', 'https://three'], fetcher)

    expect(directory).toEqual({
      A: { sellerId: 'A', domain: 'a.com' },
      B: { sellerId: 'B', domain: 'b.com' },
    })
  })
})
