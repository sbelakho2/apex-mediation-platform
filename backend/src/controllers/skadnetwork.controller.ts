/**
 * SKAdNetwork Controller
 * 
 * Handles SKAdNetwork postback endpoints and campaign management
 */

import { Request, Response, NextFunction } from 'express';
import {
  skadnetworkService,
  SKAdNetworkPostback,
  ConversionValueMapping,
} from '../services/skadnetworkService';
import logger from '../utils/logger';

/**
 * POST /api/v1/skadnetwork/postback
 * Receive SKAdNetwork postback from Apple
 */
export const receivePostback = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const postback = req.body as SKAdNetworkPostback;

    logger.info('Received SKAdNetwork postback', {
      campaignId: postback['campaign-id'],
      networkId: postback['ad-network-id'],
      version: postback.version,
    });

    const result = await skadnetworkService.processPostback(postback);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.attribution,
    });
  } catch (error) {
    logger.error('Failed to process SKAdNetwork postback', { error });
    next(error);
  }
};

/**
 * POST /api/v1/skadnetwork/campaigns
 * Create or update campaign conversion value schema
 */
export const createCampaign = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      campaignId,
      networkId,
      conversionSchema,
    }: {
      campaignId: string;
      networkId: string;
      conversionSchema?: ConversionValueMapping[];
    } = req.body;

    if (!campaignId || !networkId) {
      res.status(400).json({
        success: false,
        error: 'campaignId and networkId are required',
      });
      return;
    }

    const campaign = skadnetworkService.createCampaign({
      campaignId,
      networkId,
      conversionSchema,
    });

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error('Failed to create SKAdNetwork campaign', { error });
    next(error);
  }
};

/**
 * GET /api/v1/skadnetwork/campaigns/:campaignId/stats
 * Get campaign attribution statistics
 */
export const getCampaignStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { campaignId } = req.params;

    const stats = skadnetworkService.getCampaignStats(campaignId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get campaign stats', { error });
    next(error);
  }
};

/**
 * POST /api/v1/skadnetwork/conversion-value
 * Calculate conversion value based on user events
 */
export const calculateConversionValue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      campaignId,
      eventCount,
      eventTypes,
      revenue,
    }: {
      campaignId: string;
      eventCount: number;
      eventTypes?: string[];
      revenue?: number;
    } = req.body;

    if (!campaignId || eventCount === undefined) {
      res.status(400).json({
        success: false,
        error: 'campaignId and eventCount are required',
      });
      return;
    }

    const conversionValue = skadnetworkService.calculateConversionValue({
      campaignId,
      eventCount,
      eventTypes: eventTypes || [],
      revenue,
    });

    res.json({
      success: true,
      data: conversionValue,
    });
  } catch (error) {
    logger.error('Failed to calculate conversion value', { error });
    next(error);
  }
};

/**
 * PUT /api/v1/skadnetwork/conversion-value
 * Update conversion value for a transaction
 */
export const updateConversionValue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      transactionId,
      campaignId,
      newValue,
      coarseValue,
    }: {
      transactionId: string;
      campaignId: string;
      newValue: number;
      coarseValue?: 'low' | 'medium' | 'high';
    } = req.body;

    if (!transactionId || !campaignId || newValue === undefined) {
      res.status(400).json({
        success: false,
        error: 'transactionId, campaignId, and newValue are required',
      });
      return;
    }

    const result = skadnetworkService.updateConversionValue({
      transactionId,
      campaignId,
      newValue,
      coarseValue,
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.json({
      success: true,
      message: 'Conversion value updated',
    });
  } catch (error) {
    logger.error('Failed to update conversion value', { error });
    next(error);
  }
};

/**
 * POST /api/v1/skadnetwork/signature
 * Generate SKAdNetwork signature parameters for bid response
 */
export const generateSignature = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const {
      version,
      networkId,
      campaignId,
      appId,
      sourceAppId,
    }: {
      version: string;
      networkId: string;
      campaignId: string;
      appId: string;
      sourceAppId?: string;
    } = req.body;

    if (!version || !networkId || !campaignId || !appId) {
      res.status(400).json({
        success: false,
        error: 'version, networkId, campaignId, and appId are required',
      });
      return;
    }

    const nonce = skadnetworkService.generateNonce();

    const signature = skadnetworkService.generateSignatureParams({
      version,
      networkId,
      campaignId,
      appId,
      nonce,
      sourceAppId,
    });

    res.json({
      success: true,
      data: signature,
    });
  } catch (error) {
    logger.error('Failed to generate signature', { error });
    next(error);
  }
};

/**
 * GET /api/v1/skadnetwork/versions
 * Get supported SKAdNetwork versions and features
 */
export const getSupportedVersions = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const versions = skadnetworkService.getSupportedVersions();

  res.json({
    success: true,
    data: versions,
  });
};
