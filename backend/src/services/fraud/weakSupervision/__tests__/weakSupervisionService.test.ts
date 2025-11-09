import path from 'node:path';
import { EnrichmentService } from '../../../enrichment/enrichmentService';
import { WeakSupervisionService } from '../WeakSupervisionService';
import type { WeakSupervisionContext } from '../types';

const ENRICHMENT_DATA = path.resolve(__dirname, '../../../../../../data/enrichment');
const WEAK_SUP_DATA = path.resolve(__dirname, '../../../../../../data/weak-supervision');

describe('WeakSupervisionService', () => {
  let service: WeakSupervisionService;

  beforeAll(async () => {
    const enrichment = new EnrichmentService(ENRICHMENT_DATA);
    await enrichment.initialize('v1');

    service = new WeakSupervisionService({
      baseDir: WEAK_SUP_DATA,
      enrichmentService: enrichment,
    });

    await service.initialize();
  });

  const nowIso = new Date('2025-11-09T00:00:00.000Z').toISOString();

  const unauthorizedContext: WeakSupervisionContext = {
    eventId: 'evt-unauthorized',
    timestamp: nowIso,
    partnerId: 'partnerA',
    placementId: 'placementA',
    groundTruthLabel: 'fraud',
    supplyChain: {
      domain: 'trustedpublisher.com',
      sellerId: '99999',
      appStoreId: 'com.trusted.app',
    },
    network: {
      ip: '198.51.100.200',
      deviceCountry: 'US',
      paymentCountry: 'DE',
      appStoreCountry: 'DE',
      timezone: 'UTC',
      expectedTimezone: 'America/New_York',
      carrier: 'Unknown',
      expectedCarrier: 'Verizon',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    ctit: {
      seconds: 2,
      partnerId: 'partnerA',
      placementId: 'placementA',
      history: {
        partnerMeanSeconds: 40,
        partnerP95Seconds: 120,
        globalMeanSeconds: 55,
        globalP95Seconds: 180,
      },
    },
    omsdk: {
      sessionStarted: false,
      impressionType: 'display',
      wasViewable: true,
      measurable: true,
      viewableTimeMs: 200,
      engagementEvents: [],
      geometry: {
        coveragePercent: 12,
        overlappingCreatives: 3,
      },
    },
    synthetic: {
      requestsPerMinute: 520,
      uniqueDevicesPerMinute: 4,
      creativeSwapRate: 4,
      bundlesPerRequest: 3,
    },
  };

  const benignContext: WeakSupervisionContext = {
    eventId: 'evt-benign',
    timestamp: nowIso,
    partnerId: 'partnerB',
    placementId: 'placementB',
    groundTruthLabel: 'legit',
    supplyChain: {
      domain: 'trustedpublisher.com',
      sellerId: '12345',
      appStoreId: 'com.trusted.app',
    },
    network: {
      ip: '203.0.113.1',
      deviceCountry: 'US',
      paymentCountry: 'US',
      appStoreCountry: 'US',
      timezone: 'America/New_York',
      expectedTimezone: 'America/New_York',
      carrier: 'Verizon',
      expectedCarrier: 'Verizon',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    },
    ctit: {
      seconds: 120,
      partnerId: 'partnerB',
      placementId: 'placementB',
      history: {
        partnerMeanSeconds: 110,
        partnerP95Seconds: 250,
        globalMeanSeconds: 130,
        globalP95Seconds: 320,
      },
    },
    omsdk: {
      sessionStarted: true,
      impressionType: 'video',
      wasViewable: true,
      measurable: true,
      viewableTimeMs: 4500,
      totalDurationMs: 15000,
      engagementEvents: ['mute', 'unmute', 'click_through'],
      geometry: {
        coveragePercent: 78,
        overlappingCreatives: 0,
      },
    },
    synthetic: {
      requestsPerMinute: 60,
      uniqueDevicesPerMinute: 45,
      creativeSwapRate: 1,
      bundlesPerRequest: 1,
    },
  };

  it('flags unauthorized sellers and high-risk network signals as fraud', async () => {
    const result = await service.evaluateEvent(unauthorizedContext);

    const supplyChainOutcome = result.outcomes.find(
      (outcome) => outcome.functionName === 'supply_chain_authorization'
    );
    expect(supplyChainOutcome).toBeDefined();
    expect(supplyChainOutcome?.label).toBe('fraud');
    expect(supplyChainOutcome?.reasons.join(' ')).toContain('Seller');

    const networkOutcome = result.outcomes.find(
      (outcome) => outcome.functionName === 'network_origin_anomaly'
    );
    expect(networkOutcome).toBeDefined();
    expect(networkOutcome?.label).toBe('fraud');
    expect(networkOutcome?.reasons.join(' ')).toContain('VPN');

    const ctitOutcome = result.outcomes.find(
      (outcome) => outcome.functionName === 'ctit_ultra_short'
    );
    expect(ctitOutcome).toBeDefined();
    expect(ctitOutcome?.label).toBe('fraud');

    const omsdkOutcome = result.outcomes.find(
      (outcome) => outcome.functionName === 'omsdk_viewability_consistency'
    );
    expect(omsdkOutcome).toBeDefined();
    expect(omsdkOutcome?.label).toBe('fraud');

    const syntheticOutcome = result.outcomes.find((outcome) =>
      outcome.functionName.startsWith('synthetic_scenario_vastflux_clone')
    );
    expect(syntheticOutcome).toBeDefined();
    expect(syntheticOutcome?.label).toBe('fraud');
  });

  it('reports benign traffic as legit across label functions', async () => {
    const result = await service.evaluateEvent(benignContext);

    const fraudOutcomes = result.outcomes.filter((outcome) => outcome.label === 'fraud');
    expect(fraudOutcomes).toHaveLength(0);

    const supplyChainOutcome = result.outcomes.find(
      (outcome) => outcome.functionName === 'supply_chain_authorization'
    );
    expect(supplyChainOutcome?.label).toBe('legit');

    const networkOutcome = result.outcomes.find(
      (outcome) => outcome.functionName === 'network_origin_anomaly'
    );
    expect(networkOutcome?.label).toBe('legit');
  });

  it('builds a label quality report with coverage, conflicts, and precision proxy', async () => {
    const { report } = await service.evaluateBatch([unauthorizedContext, benignContext]);

    expect(report.totalEvents).toBe(2);
    expect(report.coverage.supply_chain_authorization).toBeCloseTo(0.5, 1);
  expect(report.conflictRate).toBe(0);

    const precision = report.precisionProxy.supply_chain_authorization;
    expect(precision).toBeDefined();
    expect(precision?.truePositives).toBe(1);
    expect(precision?.falsePositives).toBe(0);
    expect(precision?.precision).toBe(1);
  });
});
