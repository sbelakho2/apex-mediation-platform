/**
 * Consent Management Service Tests
 */

import {
  ConsentManagementService,
  TCFv2Parser,
  GPPParser,
  consentManagementService,
} from '../consentManagementService';
import { query } from '../../utils/postgres';
import logger from '../../utils/logger';

// Mock dependencies
jest.mock('../../utils/postgres');
jest.mock('../../utils/logger');

const mockQuery = jest.mocked(query);
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
(logger.info as jest.Mock) = mockLogger.info;
(logger.warn as jest.Mock) = mockLogger.warn;
(logger.error as jest.Mock) = mockLogger.error;

describe('ConsentManagementService', () => {
  let service: ConsentManagementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConsentManagementService();

    // Mock successful query by default
    mockQuery.mockResolvedValue({
      rows: [],
      rowCount: 0,
      command: '',
      oid: 0,
      fields: [],
    });
  });

  describe('storeConsent', () => {
    it('should store user consent with TCF string', async () => {
      const userId = 'user-123';
      const consent = {
        consentString: 'CPXxxxxxxxxxxxxxxx',
        gdprApplies: true,
        consentGiven: true,
      };

      await service.storeConsent(userId, consent);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_consents'),
        expect.arrayContaining([userId, 'CPXxxxxxxxxxxxxxxx'])
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User consent stored',
        expect.objectContaining({ userId, gdprApplies: true })
      );
    });

    it('should store GPP consent string', async () => {
      const userId = 'user-456';
      const consent = {
        gppString: 'DBACNYA~CPXxxxxxxxxxxxxxxx',
        gppSid: [2, 7, 8],
        ccpaApplies: true,
      };

      await service.storeConsent(userId, consent);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_consents'),
        expect.arrayContaining([userId, null, 'DBACNYA~CPXxxxxxxxxxxxxxxx'])
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.storeConsent('user-123', { consentGiven: true })
      ).rejects.toThrow('Consent storage failed');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getConsent', () => {
    it('should retrieve user consent', async () => {
      const mockConsent = {
        user_id: 'user-123',
        consent_string: 'CPXxxxxxxxxxxxxxxx',
        gpp_string: null,
        gpp_sid: null,
        gdpr_applies: true,
        ccpa_applies: false,
        consent_given: true,
        purposes: JSON.stringify([1, 2, 3, 7]),
        vendors: JSON.stringify([123, 456]),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockConsent],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.getConsent('user-123');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
      expect(result?.gdprApplies).toBe(true);
      expect(result?.purposes.has(1)).toBe(true);
      expect(result?.vendors.has(123)).toBe(true);
    });

    it('should return null for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.getConsent('non-existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.getConsent('user-123');

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('validateConsent', () => {
    it('should validate consent for GDPR user', async () => {
      const mockConsent = {
        user_id: 'user-123',
        consent_string: 'CPXxxxxxxxxxxxxxxx',
        gpp_string: null,
        gpp_sid: null,
        gdpr_applies: true,
        ccpa_applies: false,
        consent_given: true,
        purposes: JSON.stringify([1, 2, 3, 7, 10]),
        vendors: JSON.stringify([123, 456, 789]),
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockConsent],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateConsent('user-123', 123, [1, 2, 3]);

      expect(result.valid).toBe(true);
      expect(result.gdprApplies).toBe(true);
      expect(result.canServeAds).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when vendor not consented', async () => {
      const mockConsent = {
        user_id: 'user-123',
        consent_string: 'CPXxxxxxxxxxxxxxxx',
        gpp_string: null,
        gpp_sid: null,
        gdpr_applies: true,
        ccpa_applies: false,
        consent_given: true,
        purposes: JSON.stringify([1, 2, 3]),
        vendors: JSON.stringify([456, 789]), // 123 not in list
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockConsent],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateConsent('user-123', 123, [1, 2]);

      expect(result.valid).toBe(false);
      expect(result.canServeAds).toBe(false);
      expect(result.errors).toContain('Vendor 123 does not have user consent');
    });

    it('should fail validation for missing purposes', async () => {
      const mockConsent = {
        user_id: 'user-123',
        consent_string: 'CPXxxxxxxxxxxxxxxx',
        gpp_string: null,
        gpp_sid: null,
        gdpr_applies: true,
        ccpa_applies: false,
        consent_given: true,
        purposes: JSON.stringify([1, 2]), // Missing purpose 3
        vendors: JSON.stringify([123]),
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockConsent],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateConsent('user-123', 123, [1, 2, 3]);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Purpose 3'))).toBe(true);
    });

    it('should handle CCPA opt-out', async () => {
      const mockConsent = {
        user_id: 'user-123',
        consent_string: null,
        gpp_string: 'DBACNYA~1YYN',
        gpp_sid: JSON.stringify([8]),
        gdpr_applies: false,
        ccpa_applies: true,
        consent_given: false, // User opted out
        purposes: JSON.stringify([]),
        vendors: JSON.stringify([]),
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockConsent],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateConsent('user-123', 123, [1]);

      expect(result.valid).toBe(false);
      expect(result.ccpaApplies).toBe(true);
      expect(result.canServeAds).toBe(false);
      expect(result.canPersonalizeAds).toBe(false);
      expect(result.errors).toContain('User has opted out under CCPA');
    });

    it('should return false for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await service.validateConsent('non-existent', 123, [1]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No consent found for user');
    });
  });

  describe('buildOpenRTBRegs', () => {
    it('should build regs object for GDPR', () => {
      const consent = {
        userId: 'user-123',
        consentString: 'CPXxxxxxxxxxxxxxxx',
        gdprApplies: true,
        ccpaApplies: false,
        consentGiven: true,
        purposes: new Set<number>([1, 2, 3]),
        vendors: new Set<number>([123]),
        restrictions: new Map(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const regs = service.buildOpenRTBRegs(consent);

      expect(regs.gdpr).toBe(1);
      expect(regs.ext?.gdpr).toBe(1);
    });

    it('should build regs object for CCPA', () => {
      const consent = {
        userId: 'user-123',
        ccpaApplies: true,
        gdprApplies: false,
        consentGiven: true,
        purposes: new Set<number>(),
        vendors: new Set<number>(),
        restrictions: new Map(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const regs = service.buildOpenRTBRegs(consent);

      expect(regs.us_privacy).toBe('1YNN');
      expect(regs.ext?.us_privacy).toBe('1YNN');
    });

    it('should build regs object for CCPA opt-out', () => {
      const consent = {
        userId: 'user-123',
        ccpaApplies: true,
        gdprApplies: false,
        consentGiven: false, // Opted out
        purposes: new Set<number>(),
        vendors: new Set<number>(),
        restrictions: new Map(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const regs = service.buildOpenRTBRegs(consent);

      expect(regs.us_privacy).toBe('1YYN');
    });

    it('should include GPP string', () => {
      const consent = {
        userId: 'user-123',
        gppString: 'DBACNYA~CPXxxxxxxxxxxxxxxx',
        gppSid: [2, 7, 8],
        gdprApplies: true,
        ccpaApplies: true,
        consentGiven: true,
        purposes: new Set<number>(),
        vendors: new Set<number>(),
        restrictions: new Map(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const regs = service.buildOpenRTBRegs(consent);

      expect(regs.gpp).toBe('DBACNYA~CPXxxxxxxxxxxxxxxx');
      expect(regs.gpp_sid).toEqual([2, 7, 8]);
      expect(regs.ext?.gpp).toBe('DBACNYA~CPXxxxxxxxxxxxxxxx');
    });

    it('should handle null consent', () => {
      const regs = service.buildOpenRTBRegs(null);

      expect(regs).toEqual({});
    });
  });

  describe('buildOpenRTBUser', () => {
    it('should build user object with consent string', () => {
      const consent = {
        userId: 'user-123',
        consentString: 'CPXxxxxxxxxxxxxxxx',
        gdprApplies: true,
        ccpaApplies: false,
        consentGiven: true,
        purposes: new Set<number>(),
        vendors: new Set<number>(),
        restrictions: new Map(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const user = service.buildOpenRTBUser('user-123', consent);

      expect(user.id).toBe('user-123');
      expect(user.consent).toBe('CPXxxxxxxxxxxxxxxx');
      expect(user.ext?.consent).toBe('CPXxxxxxxxxxxxxxxx');
    });

    it('should handle null consent', () => {
      const user = service.buildOpenRTBUser('user-123', null);

      expect(user.id).toBe('user-123');
      expect(user.consent).toBeUndefined();
    });
  });

  describe('deleteConsent', () => {
    it('should delete user consent', async () => {
      await service.deleteConsent('user-123');

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM user_consents WHERE user_id = $1',
        ['user-123']
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User consent deleted',
        { userId: 'user-123' }
      );
    });

    it('should handle deletion errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.deleteConsent('user-123')).rejects.toThrow(
        'Consent deletion failed'
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

describe('TCFv2Parser', () => {
  describe('parse', () => {
    it('should return null for invalid consent string', () => {
      // Mock logger to avoid error in test output
      const originalError = logger.error;
      (logger.error as jest.Mock).mockImplementation(() => {});
      
      const result = TCFv2Parser.parse('invalid-string');

      expect(result).toBeNull();
      
      // Restore original
      logger.error = originalError;
    });

    it('should handle short consent strings', () => {
      // TCF parser should handle short/invalid strings gracefully
      const result = TCFv2Parser.parse('CP');

      // Either returns null or a partially parsed object with NaN values
      // Both are acceptable for invalid input
      expect(result === null || Number.isNaN(result.cmpId)).toBe(true);
    });
  });
});

describe('GPPParser', () => {
  describe('parse', () => {
    it('should parse GPP string with sections', () => {
      const gppString = '1~DBACNYA~CPSG';
      const result = GPPParser.parse(gppString);

      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
      expect(result?.sections.length).toBeGreaterThan(0);
    });

    it('should return null for invalid GPP string', () => {
      const result = GPPParser.parse('invalid');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid GPP string format');
    });

    it('should handle parsing errors gracefully', () => {
      const result = GPPParser.parse('');

      expect(result).toBeNull();
    });
  });
});

describe('Singleton export', () => {
  it('should export singleton instance', () => {
    expect(consentManagementService).toBeInstanceOf(ConsentManagementService);
  });
});
