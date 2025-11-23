/**
 * SKAdNetwork Service Tests
 */

import {
  SKAdNetworkService,
  SKAdNetworkPostback,
} from '../skadnetworkService';

const repoCreate = jest.fn((entity) => entity);
const repoSave = jest.fn(async () => undefined);
const mockRepo = {
  create: repoCreate,
  save: repoSave,
};

jest.mock('../../database', () => ({
  AppDataSource: {
    getRepository: jest.fn(() => mockRepo),
  },
}));
const { AppDataSource } = jest.requireMock('../../database');

describe('SKAdNetworkService', () => {
  let service: SKAdNetworkService;

  beforeEach(() => {
    jest.clearAllMocks();
    (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
    service = new SKAdNetworkService();
  });

  describe('getSupportedVersions', () => {
    it('should return supported SKAdNetwork versions', () => {
      const versions = service.getSupportedVersions();

      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe('4.0');
      expect(versions[0].supported).toBe(true);
      expect(versions[0].features).toContain('coarse_conversion_values');
    });
  });

  describe('generateSignatureParams', () => {
    it('should generate valid signature parameters', () => {
      const params = {
        version: '4.0',
        networkId: 'test-network.skadnetwork',
        campaignId: '12345',
        appId: '123456789',
        nonce: service.generateNonce(),
        sourceAppId: '987654321',
      };

      const signature = service.generateSignatureParams(params);

      expect(signature.version).toBe('4.0');
      expect(signature.network).toBe('test-network.skadnetwork');
      expect(signature.campaign).toBe('12345');
      expect(signature.itunesitem).toBe('123456789');
      expect(signature.nonce).toBeTruthy();
      expect(signature.signature).toBeTruthy();
      expect(signature.timestamp).toBeTruthy();
    });

    it('should generate unique nonces', () => {
      const nonce1 = service.generateNonce();
      const nonce2 = service.generateNonce();

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('createCampaign', () => {
    it('should create campaign with default conversion schema', () => {
      const campaign = service.createCampaign({
        campaignId: 'test-campaign',
        networkId: 'test-network.skadnetwork',
      });

      expect(campaign.campaignId).toBe('test-campaign');
      expect(campaign.networkId).toBe('test-network.skadnetwork');
      expect(campaign.conversionValueSchema).toHaveLength(7);
      expect(campaign.createdAt).toBeInstanceOf(Date);
    });

    it('should create campaign with custom conversion schema', () => {
      const customSchema = [
        { min: 0, max: 5, events: ['app_open'], value: 10, coarseValue: 'low' as const },
        { min: 6, max: 10, events: ['purchase'], value: 50, coarseValue: 'high' as const },
      ];

      const campaign = service.createCampaign({
        campaignId: 'custom-campaign',
        networkId: 'test-network.skadnetwork',
        conversionSchema: customSchema,
      });

      expect(campaign.conversionValueSchema).toHaveLength(2);
      expect(campaign.conversionValueSchema[0].value).toBe(10);
      expect(campaign.conversionValueSchema[1].value).toBe(50);
    });
  });

  describe('processPostback', () => {
    it('should process valid postback', async () => {
      const postback: SKAdNetworkPostback = {
        version: '4.0',
        'ad-network-id': 'test-network.skadnetwork',
        'campaign-id': '12345',
        'app-id': '123456789',
        'attribution-signature': 'valid-signature',
        'conversion-value': 42,
        'coarse-conversion-value': 'high',
        'did-win': true,
      };

      const result = await service.processPostback(postback);

      expect(result.success).toBe(true);
      expect(result.attribution).toBeDefined();
      expect(result.attribution?.campaignId).toBe('12345');
      expect(result.attribution?.conversionValue).toBe(42);
      expect(result.attribution?.coarseValue).toBe('high');
      expect(result.attribution?.didWin).toBe(true);
    });

    it('should reject postback without signature', async () => {
      const postback: SKAdNetworkPostback = {
        version: '4.0',
        'ad-network-id': 'test-network.skadnetwork',
        'campaign-id': '12345',
        'app-id': '123456789',
        'attribution-signature': '',
      };

      const result = await service.processPostback(postback);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });

  describe('calculateConversionValue', () => {
    beforeEach(() => {
      service.createCampaign({
        campaignId: 'test-campaign',
        networkId: 'test-network.skadnetwork',
      });
    });

    it('should calculate value for low engagement', () => {
      const result = service.calculateConversionValue({
        campaignId: 'test-campaign',
        eventCount: 1,
        eventTypes: ['app_open'],
      });

      expect(result.value).toBe(1);
      expect(result.coarseValue).toBe('low');
      expect(result.lockWindow).toBeGreaterThan(0);
    });

    it('should calculate value for medium engagement', () => {
      const result = service.calculateConversionValue({
        campaignId: 'test-campaign',
        eventCount: 8,
        eventTypes: ['level_complete'],
      });

      expect(result.value).toBe(20);
      expect(result.coarseValue).toBe('medium');
    });

    it('should calculate value for high engagement with revenue', () => {
      const result = service.calculateConversionValue({
        campaignId: 'test-campaign',
        eventCount: 25,
        eventTypes: ['purchase'],
        revenue: 75,
      });

      expect(result.value).toBe(50);
      expect(result.coarseValue).toBe('high');
    });

    it('should use revenue to determine coarse value', () => {
      const lowRevenue = service.calculateConversionValue({
        campaignId: 'test-campaign',
        eventCount: 5,
        eventTypes: ['session_start'],
        revenue: 5,
      });

      expect(lowRevenue.coarseValue).toBe('low');

      const mediumRevenue = service.calculateConversionValue({
        campaignId: 'test-campaign',
        eventCount: 5,
        eventTypes: ['session_start'],
        revenue: 25,
      });

      expect(mediumRevenue.coarseValue).toBe('medium');

      const highRevenue = service.calculateConversionValue({
        campaignId: 'test-campaign',
        eventCount: 5,
        eventTypes: ['session_start'],
        revenue: 100,
      });

      expect(highRevenue.coarseValue).toBe('high');
    });
  });

  describe('updateConversionValue', () => {
    it('should update valid conversion value', () => {
      const result = service.updateConversionValue({
        transactionId: 'txn-123',
        campaignId: 'test-campaign',
        newValue: 30,
        coarseValue: 'medium',
      });

      expect(result.success).toBe(true);
    });

    it('should reject value below 0', () => {
      const result = service.updateConversionValue({
        transactionId: 'txn-123',
        campaignId: 'test-campaign',
        newValue: -1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 63');
    });

    it('should reject value above 63', () => {
      const result = service.updateConversionValue({
        transactionId: 'txn-123',
        campaignId: 'test-campaign',
        newValue: 64,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 63');
    });
  });

  describe('getCampaignStats', () => {
    it('should return stats for campaign with no postbacks', () => {
      const stats = service.getCampaignStats('non-existent-campaign');

      expect(stats.totalPostbacks).toBe(0);
      expect(stats.installs).toBe(0);
      expect(stats.redownloads).toBe(0);
      expect(stats.averageConversionValue).toBe(0);
    });

    it('should calculate stats from postbacks', async () => {
      // Process some postbacks
      await service.processPostback({
        version: '4.0',
        'ad-network-id': 'test-network.skadnetwork',
        'campaign-id': 'stat-campaign',
        'app-id': '123456789',
        'attribution-signature': 'sig1',
        'conversion-value': 20,
        'coarse-conversion-value': 'low',
        redownload: false,
      });

      await service.processPostback({
        version: '4.0',
        'ad-network-id': 'test-network.skadnetwork',
        'campaign-id': 'stat-campaign',
        'app-id': '123456789',
        'attribution-signature': 'sig2',
        'conversion-value': 40,
        'coarse-conversion-value': 'high',
        redownload: false,
      });

      await service.processPostback({
        version: '4.0',
        'ad-network-id': 'test-network.skadnetwork',
        'campaign-id': 'stat-campaign',
        'app-id': '123456789',
        'attribution-signature': 'sig3',
        'conversion-value': 30,
        'coarse-conversion-value': 'medium',
        redownload: true,
      });

      const stats = service.getCampaignStats('stat-campaign');

      expect(stats.totalPostbacks).toBe(3);
      expect(stats.installs).toBe(2);
      expect(stats.redownloads).toBe(1);
      expect(stats.averageConversionValue).toBe(30); // (20 + 40 + 30) / 3
      expect(stats.conversionDistribution.low).toBe(1);
      expect(stats.conversionDistribution.medium).toBe(1);
      expect(stats.conversionDistribution.high).toBe(1);
    });
  });
});
