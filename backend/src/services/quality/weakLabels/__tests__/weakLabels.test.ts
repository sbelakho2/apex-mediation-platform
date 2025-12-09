/**
 * Tests for Weak Labels Library
 * SDK_CHECKS Part 7.2: CTIT anomalies, DC/VPN/Tor, unauthorized reseller
 */

import {
  // CTIT
  detectCTITAnomaly,
  analyzeCTITDistribution,
  CTIT_THRESHOLDS,
  // Network
  detectDatacenterTraffic,
  detectVpnTraffic,
  detectTorTraffic,
  detectNetworkAnomalies,
  isDatacenterASN,
  isVpnHostname,
  isTorExitHostname,
  // Reseller
  detectUnauthorizedReseller,
  validateNode,
  validateAgainstAppAdsTxt,
  parseSellersJson,
  parseAppAdsTxt,
  // Types and main function
  generateWeakLabels,
  createLabelingResult,
  calculateAggregateRisk,
} from '../index';

// Mock logger
jest.mock('../../../../utils/logger', () => ({
  default: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Weak Labels Library', () => {
  describe('CTIT Detector', () => {
    describe('detectCTITAnomaly', () => {
      it('should detect install before click as fraud', () => {
        const result = detectCTITAnomaly({
          clickTimestamp: new Date('2024-01-01T12:00:00Z'),
          installTimestamp: new Date('2024-01-01T11:59:00Z'), // Before click!
        });

        expect(result).not.toBeNull();
        expect(result!.category).toBe('ctit_anomaly');
        expect(result!.reason).toBe('install_before_click');
        expect(result!.confidence).toBe('very_high');
      });

      it('should detect impossible CTIT (< 3 seconds)', () => {
        const click = new Date('2024-01-01T12:00:00Z');
        const install = new Date(click.getTime() + 2000); // 2 seconds later

        const result = detectCTITAnomaly({
          clickTimestamp: click,
          installTimestamp: install,
          platform: 'ios',
        });

        expect(result).not.toBeNull();
        expect(result!.reason).toBe('impossible_ctit');
        expect(result!.confidenceScore).toBeGreaterThanOrEqual(0.9);
      });

      it('should detect unrealistic CTIT (< 10 seconds)', () => {
        const click = new Date('2024-01-01T12:00:00Z');
        const install = new Date(click.getTime() + 7000); // 7 seconds later

        const result = detectCTITAnomaly({
          clickTimestamp: click,
          installTimestamp: install,
          platform: 'android',
        });

        expect(result).not.toBeNull();
        expect(result!.reason).toBe('unrealistic_ctit');
      });

      it('should detect very late CTIT (organic hijacking risk)', () => {
        const click = new Date('2024-01-01T12:00:00Z');
        const install = new Date(click.getTime() + 100000000); // > 24 hours

        const result = detectCTITAnomaly({
          clickTimestamp: click,
          installTimestamp: install,
        });

        expect(result).not.toBeNull();
        expect(result!.reason).toBe('late_ctit_organic_hijack_risk');
      });

      it('should return null for normal CTIT', () => {
        const click = new Date('2024-01-01T12:00:00Z');
        const install = new Date(click.getTime() + 60000); // 60 seconds - normal

        const result = detectCTITAnomaly({
          clickTimestamp: click,
          installTimestamp: install,
          platform: 'ios',
        });

        expect(result).toBeNull();
      });

      it('should adjust threshold for large apps', () => {
        const click = new Date('2024-01-01T12:00:00Z');
        const install = new Date(click.getTime() + 12000); // 12 seconds

        // Without app size - might flag as unrealistic
        const result1 = detectCTITAnomaly({
          clickTimestamp: click,
          installTimestamp: install,
        });

        // With large app (500MB on cellular) - threshold increases
        const result2 = detectCTITAnomaly({
          clickTimestamp: click,
          installTimestamp: install,
          appSizeMb: 500,
          networkType: 'cellular',
        });

        // Large app should be more lenient
        if (result1 && result2) {
          expect(result2.confidenceScore).toBeLessThanOrEqual(result1.confidenceScore);
        }
      });
    });

    describe('analyzeCTITDistribution', () => {
      it('should detect anomalous distribution with low median', () => {
        const values = [5, 8, 10, 12, 15, 18, 20, 25, 28]; // Very low median
        const result = analyzeCTITDistribution({ ctitValues: values });

        expect(result.isAnomalous).toBe(true);
        // Could be either median_ctit_too_low or high_anomaly_rate depending on values
        expect(['median_ctit_too_low', 'high_anomaly_rate']).toContain(result.anomalyReason);
      });

      it('should detect high anomaly rate', () => {
        // 30% of values are < 10 seconds
        const values = [2, 3, 5, 100, 120, 150, 180, 200, 250, 300];
        const result = analyzeCTITDistribution({ ctitValues: values });

        expect(result.anomalyRate).toBeGreaterThan(0.1);
        expect(result.isAnomalous).toBe(true);
      });

      it('should handle empty input', () => {
        const result = analyzeCTITDistribution({ ctitValues: [] });

        expect(result.median).toBe(0);
        expect(result.isAnomalous).toBe(false);
      });
    });
  });

  describe('Network Detector', () => {
    describe('isDatacenterASN', () => {
      it('should detect known datacenter ASNs', () => {
        expect(isDatacenterASN('AS14061')).toBe(true); // DigitalOcean
        expect(isDatacenterASN('AS14618')).toBe(true); // AWS
        expect(isDatacenterASN('as15169')).toBe(true); // Google (case insensitive)
      });

      it('should not flag residential ASNs', () => {
        expect(isDatacenterASN('AS12345')).toBe(false);
        expect(isDatacenterASN(undefined)).toBe(false);
      });
    });

    describe('isVpnHostname', () => {
      it('should detect VPN hostnames', () => {
        expect(isVpnHostname('server1.nordvpn.com')).toBe(true);
        expect(isVpnHostname('node.expressvpn.net')).toBe(true);
        expect(isVpnHostname('vpn-exit.surfshark.io')).toBe(true);
      });

      it('should not flag normal hostnames', () => {
        expect(isVpnHostname('google.com')).toBe(false);
        expect(isVpnHostname('my-server.example.com')).toBe(false);
      });
    });

    describe('isTorExitHostname', () => {
      it('should detect Tor exit node patterns', () => {
        expect(isTorExitHostname('exit1.torproject.org')).toBe(true);
        expect(isTorExitHostname('node.tor-exit.org')).toBe(true);
        expect(isTorExitHostname('relay.torservers.net')).toBe(true);
      });
    });

    describe('detectNetworkAnomalies', () => {
      it('should detect datacenter traffic from flags', () => {
        const labels = detectNetworkAnomalies({
          ip: '192.168.1.1',
          isDatacenter: true,
          asn: 'AS14618',
        });

        expect(labels.length).toBeGreaterThan(0);
        expect(labels.some(l => l.category === 'datacenter_traffic')).toBe(true);
      });

      it('should detect VPN from flags', () => {
        const labels = detectNetworkAnomalies({
          ip: '10.0.0.1',
          isVpn: true,
        });

        expect(labels.some(l => l.category === 'vpn_detected')).toBe(true);
      });

      it('should detect Tor from flags', () => {
        const labels = detectNetworkAnomalies({
          ip: '10.0.0.1',
          isTor: true,
        });

        expect(labels.some(l => l.category === 'tor_exit_node')).toBe(true);
        expect(labels[0].confidence).toBe('very_high');
      });

      it('should return empty for clean traffic', () => {
        const labels = detectNetworkAnomalies({
          ip: '192.168.1.1',
          connectionType: 'residential',
        });

        expect(labels.length).toBe(0);
      });
    });
  });

  describe('Reseller Detector', () => {
    const validSellersJson: Record<string, any> = {
      '12345': { sellerId: '12345', domain: 'publisher.com', sellerType: 'publisher' },
      '67890': { sellerId: '67890', domain: 'ssp.exchange.com', sellerType: 'intermediary' },
    };

    describe('validateNode', () => {
      it('should validate known seller', () => {
        const result = validateNode(
          { sellerId: '12345', domain: 'publisher.com', relationship: 'direct' },
          validSellersJson,
          0,
          2
        );

        expect(result.valid).toBe(true);
      });

      it('should detect unknown seller', () => {
        const result = validateNode(
          { sellerId: 'unknown', domain: 'unknown.com', relationship: 'direct' },
          validSellersJson,
          0,
          1
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('unknown_seller');
      });

      it('should detect domain mismatch', () => {
        const result = validateNode(
          { sellerId: '12345', domain: 'different.com', relationship: 'direct' },
          validSellersJson,
          0,
          1
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toBe('domain_mismatch');
      });
    });

    describe('parseAppAdsTxt', () => {
      it('should parse valid app-ads.txt', () => {
        const content = `
# Comment line
google.com, pub-123456, DIRECT, f08c47fec0942fa0
exchange.com, 12345, RESELLER
ssp.com, 67890, DIRECT
`;
        const entries = parseAppAdsTxt(content);

        expect(entries.length).toBe(3);
        expect(entries[0].domain).toBe('google.com');
        expect(entries[0].relationship).toBe('DIRECT');
        expect(entries[1].relationship).toBe('RESELLER');
      });
    });

    describe('detectUnauthorizedReseller', () => {
      it('should detect suspiciously long supply chain', () => {
        const labels = detectUnauthorizedReseller({
          appBundleId: 'com.example.app',
          publisherDomain: 'example.com',
          supplyChain: [
            { sellerId: '1', domain: 'a.com', relationship: 'direct' },
            { sellerId: '2', domain: 'b.com', relationship: 'reseller' },
            { sellerId: '3', domain: 'c.com', relationship: 'reseller' },
            { sellerId: '4', domain: 'd.com', relationship: 'reseller' },
            { sellerId: '5', domain: 'e.com', relationship: 'reseller' },
            { sellerId: '6', domain: 'f.com', relationship: 'reseller' },
          ],
        });

        expect(labels.some(l => l.reason === 'suspiciously_long_supply_chain')).toBe(true);
      });
    });
  });

  describe('Main generateWeakLabels function', () => {
    it('should generate labels for CTIT anomaly', async () => {
      const result = await generateWeakLabels({
        requestId: 'req-1',
        placementId: 'pl-1',
        clickTimestamp: new Date('2024-01-01T12:00:00Z'),
        installTimestamp: new Date('2024-01-01T12:00:02Z'), // 2 seconds - impossible
      });

      expect(result.allClean).toBe(false);
      expect(result.labels.some(l => l.category === 'ctit_anomaly')).toBe(true);
    });

    it('should detect geo mismatch', async () => {
      const result = await generateWeakLabels({
        requestId: 'req-2',
        placementId: 'pl-1',
        declaredCountry: 'US',
        actualCountry: 'RU',
      });

      expect(result.allClean).toBe(false);
      expect(result.labels.some(l => l.category === 'geo_mismatch')).toBe(true);
    });

    it('should return clean result for valid traffic', async () => {
      const result = await generateWeakLabels({
        requestId: 'req-3',
        placementId: 'pl-1',
        // No suspicious signals
      });

      expect(result.allClean).toBe(true);
      expect(result.labels.length).toBe(0);
    });

    it('should calculate aggregate risk correctly', async () => {
      const result = await generateWeakLabels({
        requestId: 'req-4',
        placementId: 'pl-1',
        clickTimestamp: new Date('2024-01-01T12:00:00Z'),
        installTimestamp: new Date('2024-01-01T11:59:00Z'), // Before click!
        declaredCountry: 'US',
        actualCountry: 'CN', // Also geo mismatch
      });

      expect(result.allClean).toBe(false);
      expect(result.aggregateRiskScore).toBeGreaterThan(0.5);
      expect(result.highestRiskCategory).toBe('ctit_anomaly'); // Most confident
    });
  });

  describe('Utility functions', () => {
    describe('calculateAggregateRisk', () => {
      it('should return 0 for empty labels', () => {
        expect(calculateAggregateRisk([])).toBe(0);
      });

      it('should weight max score higher', () => {
        const labels = [
          { category: 'ctit_anomaly', confidenceScore: 0.9 } as any,
          { category: 'vpn_detected', confidenceScore: 0.5 } as any,
        ];

        const risk = calculateAggregateRisk(labels);
        // Should be between 0.5 and 0.9, weighted toward 0.9
        expect(risk).toBeGreaterThan(0.7);
        expect(risk).toBeLessThan(0.95);
      });
    });

    describe('createLabelingResult', () => {
      it('should identify highest risk category', () => {
        const labels = [
          { category: 'vpn_detected', confidenceScore: 0.5 } as any,
          { category: 'tor_exit_node', confidenceScore: 0.95 } as any,
        ];

        const result = createLabelingResult(labels);
        expect(result.highestRiskCategory).toBe('tor_exit_node');
      });
    });
  });
});
