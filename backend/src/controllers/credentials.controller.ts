/**
 * Network Credential Vault Controller
 * 
 * API endpoints for managing publisher network credentials (BYO model).
 * Handles credential storage, retrieval, rotation, and short-lived token generation.
 */

import { Request, Response, NextFunction } from 'express';
import pool from '../utils/postgres';
import { NetworkCredentialVaultService, NetworkCredentialInput } from '../services/networkCredentialVault';
import logger from '../utils/logger';

const vaultService = new NetworkCredentialVaultService(pool);

/**
 * Store or update network credentials for a publisher
 * POST /api/v1/credentials
 * Body: { network: string, credentials: object }
 */
export async function storeCredentials(req: Request, res: Response, next: NextFunction) {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { network, credentials } = req.body;

    if (!network || !credentials) {
      return res.status(400).json({
        error: 'Missing required fields: network, credentials',
      });
    }

    const input: NetworkCredentialInput = {
      publisherId,
      network,
      credentials,
    };

    const credentialId = await vaultService.storeCredentials(input);

    logger.info('Credentials stored', {
      publisherId,
      network,
      credentialId,
    });

    return res.status(201).json({
      success: true,
      data: {
        credentialId,
      },
    });
  } catch (error: any) {
    logger.error('Failed to store credentials', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Retrieve network credentials for a publisher
 * GET /api/v1/credentials/:network
 */
export async function getCredentials(req: Request, res: Response, next: NextFunction) {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { network } = req.params;

    const result = await vaultService.getCredentials(publisherId, network);

    if (!result) {
      return res.status(404).json({ error: 'Credentials not found' });
    }

    // Don't return raw credentials - only metadata
    return res.json({
      success: true,
      data: {
        id: result.id,
        network: result.network,
        version: result.version,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        // Note: credentials field intentionally omitted for security
      },
    });
  } catch (error: any) {
    logger.error('Failed to retrieve credentials', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Generate short-lived token for SDK authentication
 * POST /api/v1/credentials/:network/token
 * Body: { ttlMinutes?: number }
 */
export async function generateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { network } = req.params;
    const { ttlMinutes } = req.body;

    const result = await vaultService.generateShortLivedToken(
      publisherId,
      network,
      ttlMinutes
    );

    if (!result) {
      return res.status(404).json({ error: 'Credentials not found' });
    }

    logger.info('Short-lived token generated', {
      publisherId,
      network,
      ttlMinutes: ttlMinutes || 15,
    });

    return res.json({
      success: true,
      data: {
        token: result.token,
        expiresAt: result.expiresAt,
        expiresIn: (ttlMinutes || 15) * 60, // seconds
      },
    });
  } catch (error: any) {
    logger.error('Failed to generate token', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Rotate network credentials (create new version)
 * POST /api/v1/credentials/:network/rotate
 * Body: { newCredentials: object }
 */
export async function rotateCredentials(req: Request, res: Response, next: NextFunction) {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { network } = req.params;
    const { newCredentials } = req.body;

    if (!newCredentials) {
      return res.status(400).json({ error: 'Missing newCredentials' });
    }

    await vaultService.rotateCredentials(publisherId, network, newCredentials);

    logger.info('Credentials rotated', {
      publisherId,
      network,
    });

    return res.json({
      success: true,
      message: 'Credentials rotated successfully',
    });
  } catch (error: any) {
    logger.error('Failed to rotate credentials', { error: error.message });
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Delete network credentials
 * DELETE /api/v1/credentials/:network
 */
export async function deleteCredentials(req: Request, res: Response, next: NextFunction) {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { network } = req.params;

    await vaultService.deleteCredentials(publisherId, network);

    logger.info('Credentials deleted', { publisherId, network });

    return res.json({
      success: true,
      message: 'Credentials deleted successfully',
    });
  } catch (error: any) {
    logger.error('Failed to delete credentials', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * List all networks with stored credentials
 * GET /api/v1/credentials
 */
export async function listCredentials(req: Request, res: Response, next: NextFunction) {
  try {
    const publisherId = req.user?.publisherId;
    if (!publisherId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const networks = await vaultService.listNetworks(publisherId);

    return res.json({
      success: true,
      data: {
        networks,
      },
    });
  } catch (error: any) {
    logger.error('Failed to list credentials', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
