import { promises as fs } from 'node:fs';
import path from 'node:path';
import { EnrichmentService } from '../enrichment/enrichmentService';

const DATA_ROOT = path.resolve(__dirname, '../../../../data/enrichment');

describe('EnrichmentService', () => {
  let service: EnrichmentService;

  beforeAll(async () => {
    service = new EnrichmentService(DATA_ROOT);
    await service.initialize('v1');
  });

  it('enriches IP addresses with intelligence signals', () => {
    const result = service.lookupIp('203.0.113.1');

    expect(result.abuseMatches).toHaveLength(1);
    expect(result.abuseMatches[0]?.category).toBe('ssh_brute_force');
    expect(result.isTorExitNode).toBe(false);
  expect(result.cloudProviders).toHaveLength(0);
  expect(result.vpnMatches).toHaveLength(0);
    expect(result.asn?.asn).toBe(64500);
    expect(result.asn?.organization).toBe('Example Telecom');
  });

  it('detects Tor exit nodes and cloud providers', () => {
    const torResult = service.lookupIp('185.220.101.1');
    expect(torResult.isTorExitNode).toBe(true);
    expect(torResult.abuseMatches).toHaveLength(0);

    const cloudResult = service.lookupIp('3.5.140.12');
    expect(cloudResult.cloudProviders).toContain('aws');
    expect(cloudResult.isTorExitNode).toBe(false);
    expect(cloudResult.abuseMatches).toHaveLength(0);
  });

  it('identifies VPN and data-center ranges', () => {
    const vpnResult = service.lookupIp('198.51.100.200');
    expect(vpnResult.vpnMatches).toContain('x4bnet');
    expect(vpnResult.asn?.asn).toBe(64501);
  });

  it('parses user-agent strings using cached patterns', () => {
    const iosResult = service.parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    expect(iosResult).not.toBeNull();
    expect(iosResult?.family).toBe('Mobile Safari');
    expect(iosResult?.category).toBe('mobile');

    const botResult = service.parseUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    expect(botResult).not.toBeNull();
    expect(botResult?.isBot).toBe(true);
  });

  it('persists enrichment snapshot metadata', async () => {
    const snapshotPath = service.getSnapshotPath();
    await expect(fs.access(snapshotPath)).resolves.toBeUndefined();

    const content = await fs.readFile(snapshotPath, 'utf8');
    const payload = JSON.parse(content) as { counts: { abuse: number; userAgentPatterns: number } };
    expect(payload.counts.abuse).toBeGreaterThan(0);
    expect(payload.counts.userAgentPatterns).toBeGreaterThan(0);
  });
});
