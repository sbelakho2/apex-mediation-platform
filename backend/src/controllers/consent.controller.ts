/**
 * Consent Management Controller
 */

import { Request, Response } from 'express';
import { consentManagementService } from '../services/consentManagementService';
import logger from '../utils/logger';

/**
 * Store user consent
 */
export const storeConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const {
      consentString,
      gppString,
      gppSid,
      gdprApplies,
      ccpaApplies,
      consentGiven,
    }: {
      consentString?: string;
      gppString?: string;
      gppSid?: number[];
      gdprApplies?: boolean;
      ccpaApplies?: boolean;
      consentGiven?: boolean;
    } = req.body;

    await consentManagementService.storeConsent(userId, {
      consentString,
      gppString,
      gppSid,
      gdprApplies,
      ccpaApplies,
      consentGiven,
    });

    logger.info('Consent stored via API', { userId });

    res.status(200).json({
      success: true,
      message: 'Consent stored successfully',
    });
  } catch (error) {
    logger.error('Error storing consent', { error });
    res.status(500).json({ error: 'Failed to store consent' });
  }
};

/**
 * Get user consent
 */
export const getConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const consent = await consentManagementService.getConsent(userId);

    if (!consent) {
      res.status(404).json({ error: 'No consent found' });
      return;
    }

    // Convert Sets to Arrays for JSON response
    const response = {
      userId: consent.userId,
      consentString: consent.consentString,
      gppString: consent.gppString,
      gppSid: consent.gppSid,
      gdprApplies: consent.gdprApplies,
      ccpaApplies: consent.ccpaApplies,
      consentGiven: consent.consentGiven,
      purposes: Array.from(consent.purposes),
      vendors: Array.from(consent.vendors),
      createdAt: consent.createdAt,
      updatedAt: consent.updatedAt,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error getting consent', { error });
    res.status(500).json({ error: 'Failed to get consent' });
  }
};

/**
 * Validate consent for specific vendor and purposes
 */
export const validateConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { vendorId, purposes }: { vendorId: number; purposes: number[] } = req.body;

    if (!vendorId || !purposes || !Array.isArray(purposes)) {
      res.status(400).json({ error: 'Invalid request data' });
      return;
    }

    const validation = await consentManagementService.validateConsent(
      userId,
      vendorId,
      purposes
    );

    res.status(200).json(validation);
  } catch (error) {
    logger.error('Error validating consent', { error });
    res.status(500).json({ error: 'Failed to validate consent' });
  }
};

/**
 * Delete user consent (GDPR right to be forgotten)
 */
export const deleteConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    await consentManagementService.deleteConsent(userId);

    logger.info('Consent deleted via API', { userId });

    res.status(200).json({
      success: true,
      message: 'Consent deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting consent', { error });
    res.status(500).json({ error: 'Failed to delete consent' });
  }
};

/**
 * Parse TCF 2.2 consent string (utility endpoint)
 */
export const parseTCFString = async (req: Request, res: Response): Promise<void> => {
  try {
    const { consentString }: { consentString: string } = req.body;

    if (!consentString) {
      res.status(400).json({ error: 'Consent string required' });
      return;
    }

    // Import parser
    const { TCFv2Parser } = await import('../services/consentManagementService');
    const parsed = TCFv2Parser.parse(consentString);

    if (!parsed) {
      res.status(400).json({ error: 'Invalid TCF 2.2 consent string' });
      return;
    }

    // Convert Sets to Arrays for JSON response
    const response = {
      version: parsed.version,
      created: parsed.created,
      lastUpdated: parsed.lastUpdated,
      cmpId: parsed.cmpId,
      cmpVersion: parsed.cmpVersion,
      vendorListVersion: parsed.vendorListVersion,
      tcfPolicyVersion: parsed.tcfPolicyVersion,
      isServiceSpecific: parsed.isServiceSpecific,
      consentLanguage: parsed.consentLanguage,
      publisherCC: parsed.publisherCC,
      purposeOneTreatment: parsed.purposeOneTreatment,
      specialFeatureOptIns: Array.from(parsed.specialFeatureOptIns),
      purposeConsents: Array.from(parsed.purposeConsents),
      purposeLegitimateInterests: Array.from(parsed.purposeLegitimateInterests),
      vendorConsents: Array.from(parsed.vendorConsents),
      vendorLegitimateInterests: Array.from(parsed.vendorLegitimateInterests),
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Error parsing TCF string', { error });
    res.status(500).json({ error: 'Failed to parse TCF string' });
  }
};

/**
 * Parse GPP string (utility endpoint)
 */
export const parseGPPString = async (req: Request, res: Response): Promise<void> => {
  try {
    const { gppString }: { gppString: string } = req.body;

    if (!gppString) {
      res.status(400).json({ error: 'GPP string required' });
      return;
    }

    // Import parser
    const { GPPParser } = await import('../services/consentManagementService');
    const parsed = GPPParser.parse(gppString);

    if (!parsed) {
      res.status(400).json({ error: 'Invalid GPP string' });
      return;
    }

    res.status(200).json(parsed);
  } catch (error) {
    logger.error('Error parsing GPP string', { error });
    res.status(500).json({ error: 'Failed to parse GPP string' });
  }
};
