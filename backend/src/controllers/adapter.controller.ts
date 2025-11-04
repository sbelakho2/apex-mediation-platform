import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import * as adapterConfigService from '../services/adapterConfigService';

// Validation schemas
const createAdapterConfigSchema = z.object({
  adapterId: z.string().uuid(),
  config: z.record(z.any()),
});

const updateAdapterConfigSchema = z.object({
  config: z.record(z.any()),
});

/**
 * List all adapter configs for the authenticated publisher
 */
export const list = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Publisher context required', 401);
    }

    const configs = await adapterConfigService.getAdapterConfigs(publisherId);

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single adapter config by ID
 */
export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Publisher context required', 401);
    }

    const config = await adapterConfigService.getAdapterConfigById(id, publisherId);

    if (!config) {
      throw new AppError('Adapter config not found', 404);
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new adapter config
 */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Publisher context required', 401);
    }

    const data = createAdapterConfigSchema.parse(req.body);
    const config = await adapterConfigService.createAdapterConfig(publisherId, data);

    logger.info(`Adapter config created for adapter: ${data.adapterId}`);

    res.status(201).json({
      success: true,
      data: config,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
    } else if (error instanceof Error && error.message.includes('already exists')) {
      next(new AppError(error.message, 409));
    } else {
      next(error);
    }
  }
};

/**
 * Update adapter config
 */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Publisher context required', 401);
    }

    const data = updateAdapterConfigSchema.parse(req.body);
    const config = await adapterConfigService.updateAdapterConfig(id, publisherId, data);

    if (!config) {
      throw new AppError('Adapter config not found', 404);
    }

    logger.info(`Adapter config updated: ${id}`);

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
    } else {
      next(error);
    }
  }
};

/**
 * Delete adapter config
 */
export const deleteConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Publisher context required', 401);
    }

    const deleted = await adapterConfigService.deleteAdapterConfig(id, publisherId);

    if (!deleted) {
      throw new AppError('Adapter config not found', 404);
    }

    logger.info(`Adapter config deleted: ${id}`);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
