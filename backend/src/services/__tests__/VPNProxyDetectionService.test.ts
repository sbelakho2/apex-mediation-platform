import path from 'node:path';
import type { Pool } from 'pg';
import { EnrichmentService } from '../enrichment/enrichmentService';
import { VPNProxyDetectionService } from '../VPNProxyDetectionService';

const DATA_ROOT = path.resolve(__dirname, '../../../../data/enrichment');

describe('VPNProxyDetectionService enrichment integration', () => {
  let service: VPNProxyDetectionService;

  beforeAll(async () => {
    const enrichment = new EnrichmentService(DATA_ROOT);
    await enrichment.initialize('v1');

    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
    } as unknown as Pool;

    service = new VPNProxyDetectionService(pool, {
      geoipReader: {
        city: async () => ({}),
        asn: async () => ({})
      },
      enrichmentService: enrichment,
      dnsReverseLookup: async () => [],
    });
  });

  it('flags VPN IPs using enrichment datasets', async () => {
    const result = await (service as unknown as {
      checkVPNIndicators(ip: string): Promise<{ is_vpn: boolean; reason: string }>;
    }).checkVPNIndicators('198.51.100.200');

    expect(result.is_vpn).toBe(true);
    expect(result.reason).toContain('x4bnet');
  });
});
