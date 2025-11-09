/**
 * GDPR/CCPA Consent Management Service
 * 
 * Implements:
 * - TCF 2.2 (Transparency & Consent Framework) string parsing
 * - GPP (Global Privacy Platform) string parsing
 * - Consent validation for bid requests
 * - OpenRTB regs.ext integration
 */

import logger from '../utils/logger';
import { query } from '../utils/postgres';

// ========================================
// TCF 2.2 Types
// ========================================

export interface TCFv2ConsentString {
  version: number;
  created: Date;
  lastUpdated: Date;
  cmpId: number;
  cmpVersion: number;
  consentScreen: number;
  consentLanguage: string;
  vendorListVersion: number;
  tcfPolicyVersion: number;
  isServiceSpecific: boolean;
  useNonStandardStacks: boolean;
  specialFeatureOptIns: Set<number>;
  purposeConsents: Set<number>;
  purposeLegitimateInterests: Set<number>;
  purposeOneTreatment: boolean;
  publisherCC: string;
  vendorConsents: Set<number>;
  vendorLegitimateInterests: Set<number>;
  publisherRestrictions: Map<number, Map<number, number>>;
}

// ========================================
// GPP Types
// ========================================

export interface GPPString {
  version: number;
  sections: GPPSection[];
}

export interface GPPSection {
  sectionId: number;
  sectionName: string;
  data: Record<string, unknown>;
}

export const GPP_SECTION_IDS = {
  TCFv2_EU: 2,
  GPP_US_NATIONAL: 7,
  GPP_US_CA: 8,
  GPP_US_VA: 9,
  GPP_US_CO: 10,
  GPP_US_UT: 11,
  GPP_US_CT: 12,
} as const;

// ========================================
// Consent Types
// ========================================

export interface UserConsent {
  userId: string;
  consentString?: string; // TCF 2.2 consent string
  gppString?: string; // GPP consent string
  gppSid?: number[]; // GPP Section IDs
  gdprApplies?: boolean;
  ccpaApplies?: boolean;
  consentGiven: boolean;
  purposes: Set<number>;
  vendors: Set<number>;
  restrictions: Map<number, Map<number, number>>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsentValidationResult {
  valid: boolean;
  gdprApplies: boolean;
  ccpaApplies: boolean;
  canServeAds: boolean;
  canCollectData: boolean;
  canPersonalizeAds: boolean;
  purposes: number[];
  vendors: number[];
  errors: string[];
}

// ========================================
// OpenRTB Integration
// ========================================

export interface OpenRTBRegs {
  coppa?: 0 | 1;
  gdpr?: 0 | 1;
  us_privacy?: string; // IAB US Privacy String (CCPA)
  gpp?: string; // GPP String
  gpp_sid?: number[]; // GPP Section IDs
  ext?: {
    gdpr?: 0 | 1;
    us_privacy?: string;
    gpp?: string;
    gpp_sid?: number[];
  };
}

export interface OpenRTBUser {
  id?: string;
  consent?: string; // TCF 2.2 consent string
  ext?: {
    consent?: string;
    ConsentedProvidersSettings?: {
      consented_providers?: string;
    };
  };
}

// ========================================
// TCF 2.2 Parser
// ========================================

export class TCFv2Parser {
  /**
   * Parse TCF 2.2 consent string
   */
  static parse(consentString: string): TCFv2ConsentString | null {
    try {
      // Remove URL-safe base64 encoding
      const cleaned = consentString.replace(/-/g, '+').replace(/_/g, '/');
      
      // Decode base64
      const decoded = Buffer.from(cleaned, 'base64');
      
      // Parse binary data
      const bits = this.bytesToBits(decoded);
      
      let offset = 0;

      // Core segment
      const version = this.readInt(bits, offset, 6);
      offset += 6;

      if (version !== 2) {
        logger.warn('Unsupported TCF version', { version });
        return null;
      }

      const created = this.readDate(bits, offset);
      offset += 36;

      const lastUpdated = this.readDate(bits, offset);
      offset += 36;

      const cmpId = this.readInt(bits, offset, 12);
      offset += 12;

      const cmpVersion = this.readInt(bits, offset, 12);
      offset += 12;

      const consentScreen = this.readInt(bits, offset, 6);
      offset += 6;

      const consentLanguage = this.readString(bits, offset, 2);
      offset += 12;

      const vendorListVersion = this.readInt(bits, offset, 12);
      offset += 12;

      const tcfPolicyVersion = this.readInt(bits, offset, 6);
      offset += 6;

      const isServiceSpecific = this.readBool(bits, offset);
      offset += 1;

      const useNonStandardStacks = this.readBool(bits, offset);
      offset += 1;

      const specialFeatureOptIns = this.readBitField(bits, offset, 12);
      offset += 12;

      const purposeConsents = this.readBitField(bits, offset, 24);
      offset += 24;

      const purposeLegitimateInterests = this.readBitField(bits, offset, 24);
      offset += 24;

      const purposeOneTreatment = this.readBool(bits, offset);
      offset += 1;

      const publisherCC = this.readString(bits, offset, 2);
      offset += 12;

      // Vendor consents (max vendor ID range encoding)
      const { vendors: vendorConsents, offset: newOffset1 } = this.readVendorSection(bits, offset);
      offset = newOffset1;

      // Vendor legitimate interests
      const { vendors: vendorLegitimateInterests, offset: newOffset2 } = this.readVendorSection(bits, offset);
      offset = newOffset2;

      // Publisher restrictions (if present)
      const publisherRestrictions = new Map<number, Map<number, number>>();

      return {
        version,
        created,
        lastUpdated,
        cmpId,
        cmpVersion,
        consentScreen,
        consentLanguage,
        vendorListVersion,
        tcfPolicyVersion,
        isServiceSpecific,
        useNonStandardStacks,
        specialFeatureOptIns,
        purposeConsents,
        purposeLegitimateInterests,
        purposeOneTreatment,
        publisherCC,
        vendorConsents,
        vendorLegitimateInterests,
        publisherRestrictions,
      };
    } catch (error) {
      logger.error('Failed to parse TCF 2.2 consent string', { error });
      return null;
    }
  }

  private static bytesToBits(bytes: Buffer): string {
    return Array.from(bytes)
      .map((byte) => byte.toString(2).padStart(8, '0'))
      .join('');
  }

  private static readInt(bits: string, offset: number, length: number): number {
    return parseInt(bits.substr(offset, length), 2);
  }

  private static readBool(bits: string, offset: number): boolean {
    return bits[offset] === '1';
  }

  private static readString(bits: string, offset: number, length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      const charCode = this.readInt(bits, offset + i * 6, 6) + 65; // A=65
      result += String.fromCharCode(charCode);
    }
    return result;
  }

  private static readDate(bits: string, offset: number): Date {
    const deciseconds = this.readInt(bits, offset, 36);
    return new Date(deciseconds * 100);
  }

  private static readBitField(bits: string, offset: number, length: number): Set<number> {
    const result = new Set<number>();
    for (let i = 0; i < length; i++) {
      if (bits[offset + i] === '1') {
        result.add(i + 1);
      }
    }
    return result;
  }

  private static readVendorSection(
    bits: string,
    offset: number
  ): { vendors: Set<number>; offset: number } {
    const vendors = new Set<number>();
    
    const maxVendorId = this.readInt(bits, offset, 16);
    offset += 16;

    const isRangeEncoding = this.readBool(bits, offset);
    offset += 1;

    if (isRangeEncoding) {
      // Range encoding
      const numEntries = this.readInt(bits, offset, 12);
      offset += 12;

      for (let i = 0; i < numEntries; i++) {
        const isRange = this.readBool(bits, offset);
        offset += 1;

        if (isRange) {
          const startVendorId = this.readInt(bits, offset, 16);
          offset += 16;
          const endVendorId = this.readInt(bits, offset, 16);
          offset += 16;

          for (let id = startVendorId; id <= endVendorId; id++) {
            vendors.add(id);
          }
        } else {
          const vendorId = this.readInt(bits, offset, 16);
          offset += 16;
          vendors.add(vendorId);
        }
      }
    } else {
      // Bit field encoding
      for (let i = 0; i < maxVendorId; i++) {
        if (bits[offset + i] === '1') {
          vendors.add(i + 1);
        }
      }
      offset += maxVendorId;
    }

    return { vendors, offset };
  }
}

// ========================================
// GPP Parser
// ========================================

export class GPPParser {
  /**
   * Parse GPP string
   */
  static parse(gppString: string): GPPString | null {
    try {
      // GPP format: version~section1~section2~...
      const parts = gppString.split('~');
      
      if (parts.length < 2) {
        logger.warn('Invalid GPP string format');
        return null;
      }

      const version = parseInt(parts[0], 10);
      const sections: GPPSection[] = [];

      // Parse each section
      for (let i = 1; i < parts.length; i++) {
        const sectionData = parts[i];
        const section = this.parseSection(sectionData);
        if (section) {
          sections.push(section);
        }
      }

      return {
        version,
        sections,
      };
    } catch (error) {
      logger.error('Failed to parse GPP string', { error });
      return null;
    }
  }

  private static parseSection(sectionData: string): GPPSection | null {
    try {
      // Simplified parsing - in production, implement full GPP spec
      // For now, just store the raw section data
      
      // First character encodes section ID
      const sectionId = this.decodeSectionId(sectionData[0]);
      
      return {
        sectionId,
        sectionName: this.getSectionName(sectionId),
        data: { raw: sectionData },
      };
    } catch (error) {
      logger.error('Failed to parse GPP section', { error });
      return null;
    }
  }

  private static decodeSectionId(char: string): number {
    // Base64-like encoding for section IDs
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) return code - 65; // A-Z = 0-25
    if (code >= 97 && code <= 122) return code - 71; // a-z = 26-51
    if (code >= 48 && code <= 57) return code + 4; // 0-9 = 52-61
    return 0;
  }

  private static getSectionName(sectionId: number): string {
    const names: Record<number, string> = {
      2: 'TCFv2 (EU)',
      7: 'US National',
      8: 'US California',
      9: 'US Virginia',
      10: 'US Colorado',
      11: 'US Utah',
      12: 'US Connecticut',
    };
    return names[sectionId] || `Section ${sectionId}`;
  }
}

// ========================================
// Consent Management Service
// ========================================

export class ConsentManagementService {
  /**
   * Store user consent
   */
  async storeConsent(userId: string, consent: Partial<UserConsent>): Promise<void> {
    try {
      // Parse consent strings
  let tcfData: TCFv2ConsentString | null = null;

      if (consent.consentString) {
        tcfData = TCFv2Parser.parse(consent.consentString);
      }

      if (consent.gppString) {
        GPPParser.parse(consent.gppString);
      }

      // Extract purposes and vendors from TCF
      const purposes = tcfData?.purposeConsents || new Set<number>();
      const vendors = tcfData?.vendorConsents || new Set<number>();

      await query(
        `INSERT INTO user_consents 
          (user_id, consent_string, gpp_string, gpp_sid, gdpr_applies, ccpa_applies, 
           consent_given, purposes, vendors, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           consent_string = EXCLUDED.consent_string,
           gpp_string = EXCLUDED.gpp_string,
           gpp_sid = EXCLUDED.gpp_sid,
           gdpr_applies = EXCLUDED.gdpr_applies,
           ccpa_applies = EXCLUDED.ccpa_applies,
           consent_given = EXCLUDED.consent_given,
           purposes = EXCLUDED.purposes,
           vendors = EXCLUDED.vendors,
           updated_at = NOW()`,
        [
          userId,
          consent.consentString || null,
          consent.gppString || null,
          consent.gppSid ? JSON.stringify(consent.gppSid) : null,
          consent.gdprApplies ?? false,
          consent.ccpaApplies ?? false,
          consent.consentGiven ?? true,
          JSON.stringify(Array.from(purposes)),
          JSON.stringify(Array.from(vendors)),
        ]
      );

      logger.info('User consent stored', { userId, gdprApplies: consent.gdprApplies });
    } catch (error) {
      logger.error('Failed to store consent', { error, userId });
      throw new Error('Consent storage failed');
    }
  }

  /**
   * Get user consent
   */
  async getConsent(userId: string): Promise<UserConsent | null> {
    try {
      const result = await query<{
        user_id: string;
        consent_string: string | null;
        gpp_string: string | null;
        gpp_sid: string | null;
        gdpr_applies: boolean;
        ccpa_applies: boolean;
        consent_given: boolean;
        purposes: string;
        vendors: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT user_id, consent_string, gpp_string, gpp_sid, gdpr_applies, ccpa_applies,
                consent_given, purposes, vendors, created_at, updated_at
         FROM user_consents
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        userId: row.user_id,
        consentString: row.consent_string || undefined,
        gppString: row.gpp_string || undefined,
        gppSid: row.gpp_sid ? JSON.parse(row.gpp_sid) : undefined,
        gdprApplies: row.gdpr_applies,
        ccpaApplies: row.ccpa_applies,
        consentGiven: row.consent_given,
        purposes: new Set(JSON.parse(row.purposes)),
        vendors: new Set(JSON.parse(row.vendors)),
        restrictions: new Map(),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('Failed to get consent', { error, userId });
      return null;
    }
  }

  /**
   * Validate consent for bid request
   */
  async validateConsent(
    userId: string,
    vendorId: number,
    purposes: number[]
  ): Promise<ConsentValidationResult> {
    const errors: string[] = [];
    let valid = true;

    try {
      const consent = await this.getConsent(userId);

      if (!consent) {
        return {
          valid: false,
          gdprApplies: false,
          ccpaApplies: false,
          canServeAds: false,
          canCollectData: false,
          canPersonalizeAds: false,
          purposes: [],
          vendors: [],
          errors: ['No consent found for user'],
        };
      }

      // Check GDPR compliance
      let canServeAds = true;
      let canCollectData = true;
      let canPersonalizeAds = true;

      if (consent.gdprApplies) {
        // Verify vendor consent
        if (!consent.vendors.has(vendorId)) {
          valid = false;
          canServeAds = false;
          errors.push(`Vendor ${vendorId} does not have user consent`);
        }

        // Verify purpose consents
        for (const purpose of purposes) {
          if (!consent.purposes.has(purpose)) {
            valid = false;
            errors.push(`Purpose ${purpose} not consented`);
            
            // Map purposes to capabilities
            if (purpose === 1) canServeAds = false; // Store/access info
            if (purpose === 2) canPersonalizeAds = false; // Basic ads
            if (purpose === 3) canPersonalizeAds = false; // Personalized ads
            if (purpose === 4) canPersonalizeAds = false; // Personalized content
            if (purpose === 7) canCollectData = false; // Measurement
          }
        }
      }

      // Check CCPA compliance (opt-out)
      if (consent.ccpaApplies && !consent.consentGiven) {
        valid = false;
        canServeAds = false;
        canPersonalizeAds = false;
        errors.push('User has opted out under CCPA');
      }

      return {
        valid,
        gdprApplies: consent.gdprApplies ?? false,
        ccpaApplies: consent.ccpaApplies ?? false,
        canServeAds,
        canCollectData,
        canPersonalizeAds,
        purposes: Array.from(consent.purposes),
        vendors: Array.from(consent.vendors),
        errors,
      };
    } catch (error) {
      logger.error('Failed to validate consent', { error, userId });
      return {
        valid: false,
        gdprApplies: false,
        ccpaApplies: false,
        canServeAds: false,
        canCollectData: false,
        canPersonalizeAds: false,
        purposes: [],
        vendors: [],
        errors: ['Consent validation error'],
      };
    }
  }

  /**
   * Build OpenRTB regs object from consent
   */
  buildOpenRTBRegs(consent: UserConsent | null): OpenRTBRegs {
    const regs: OpenRTBRegs = {};

    if (consent?.gdprApplies) {
      regs.gdpr = 1;
      regs.ext = regs.ext || {};
      regs.ext.gdpr = 1;
    }

    if (consent?.ccpaApplies) {
      // IAB US Privacy String format: 1YNN
      // 1 = version, Y = explicit notice, N = opt-out, N = LSPA
      const usPrivacy = consent.consentGiven ? '1YNN' : '1YYN';
      regs.us_privacy = usPrivacy;
      regs.ext = regs.ext || {};
      regs.ext.us_privacy = usPrivacy;
    }

    if (consent?.gppString) {
      regs.gpp = consent.gppString;
      regs.gpp_sid = consent.gppSid;
      regs.ext = regs.ext || {};
      regs.ext.gpp = consent.gppString;
      regs.ext.gpp_sid = consent.gppSid;
    }

    return regs;
  }

  /**
   * Build OpenRTB user object with consent
   */
  buildOpenRTBUser(userId: string, consent: UserConsent | null): OpenRTBUser {
    const user: OpenRTBUser = {
      id: userId,
    };

    if (consent?.consentString) {
      user.consent = consent.consentString;
      user.ext = {
        consent: consent.consentString,
      };
    }

    return user;
  }

  /**
   * Delete user consent (GDPR right to be forgotten)
   */
  async deleteConsent(userId: string): Promise<void> {
    try {
      await query('DELETE FROM user_consents WHERE user_id = $1', [userId]);
      logger.info('User consent deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete consent', { error, userId });
      throw new Error('Consent deletion failed');
    }
  }
}

// Export singleton instance
export const consentManagementService = new ConsentManagementService();
