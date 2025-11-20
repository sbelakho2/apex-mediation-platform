import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import * as placementsRepo from '../repositories/placementRepository';

// Validation schemas
const iso2 = z.string().regex(/^[A-Z]{2}$/);
const Platform = z.enum(['ios', 'android', 'unity', 'web']);

// Placement configuration schema (proposed v1; additive and optional)
export const placementConfigSchema = z
  .object({
    targeting: z
      .object({
        geos: z.array(iso2).max(300).optional(),
        platforms: z.array(Platform).min(1).max(4).optional(),
        osVersions: z.record(z.string().min(1)).optional(),
        appVersions: z.array(z.string().min(1)).max(50).optional(),
      })
      .partial()
      .optional(),
    delivery: z
      .object({
        frequencyCap: z
          .object({ count: z.number().int().min(0).max(1000), per: z.enum(['minute', 'hour', 'day']) })
          .optional(),
        pacing: z.object({ impressionsPerMinute: z.number().int().min(0).max(1_000_000) }).optional(),
      })
      .partial()
      .optional(),
    pricing: z
      .object({
        floorPriceCents: z.number().int().min(0).max(10_000_00).optional(),
        currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      })
      .partial()
      .optional(),
    sdk: z
      .object({
        unitIdIos: z.string().max(200).optional(),
        unitIdAndroid: z.string().max(200).optional(),
        unitIdUnity: z.string().max(200).optional(),
        unitIdWeb: z.string().max(200).optional(),
      })
      .partial()
      .optional(),
    metadata: z
      .object({
        labels: z.array(z.string().min(1).max(50)).max(50).optional(),
        notes: z.string().max(2000).optional(),
      })
      .partial()
      .optional(),
  })
  .strict();
const createPlacementSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['banner', 'interstitial', 'rewarded', 'native']),
  appId: z.string(),
  platform: Platform,
  config: placementConfigSchema.optional(),
});

const updatePlacementSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'paused']).optional(),
  config: placementConfigSchema.optional(),
});

const requirePublisherId = (req: Request): string => {
  const publisherId = req.user?.publisherId;
  if (!publisherId) {
    throw new AppError('Missing publisher context', 403);
  }
  return publisherId;
};

/**
 * List all placements
 */
export const list = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = requirePublisherId(req);
    const limit = Math.min(200, parseInt(String(req.query.pageSize || req.query.limit || 50), 10) || 50);
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
    const offset = (page - 1) * limit;
    const rows = await placementsRepo.list(publisherId, limit, offset);
    res.json({ success: true, data: { items: rows, total: rows.length, page, pageSize: limit } });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single placement by ID
 */
export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const publisherId = requirePublisherId(req);
    const row = await placementsRepo.getById(publisherId, id);
    if (!row) {
      return next(new AppError('Placement not found', 404));
    }
    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new placement
 */
export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const data = createPlacementSchema.parse(req.body);
    const publisherId = requirePublisherId(req);
    const created = await placementsRepo.create(publisherId, {
      appId: data.appId,
      name: data.name,
      type: data.type,
      status: 'active',
      config: data.config ?? {},
    });
    if (!created) {
      return next(new AppError('App not found for publisher', 404));
    }
    logger.info(`Placement created: ${created.id}`);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
    } else {
      next(error);
    }
  }
};

/**
 * Update placement
 */
export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = updatePlacementSchema.parse(req.body);
    const publisherId = requirePublisherId(req);
    // Update basic fields if provided
    let updated = await placementsRepo.update(publisherId, id, {
      name: data.name as any,
      status: data.status as any,
    });
    // If config provided on PUT, treat as full replacement for now
    if (data.config) {
      updated = await placementsRepo.patchConfig(publisherId, id, data.config);
    }
    if (!updated) return next(new AppError('Placement not found', 404));
    logger.info(`Placement updated: ${id}`);
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
    } else {
      next(error);
    }
  }
};

/**
 * Patch placement (partial), including deep-merge of config
 */
export const patch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    // Accept either top-level fields or a nested config doc
    const body = req.body ?? {};
    const parsed = updatePlacementSchema.parse(body);
    const publisherId = requirePublisherId(req);

    let updated = await placementsRepo.getById(publisherId, id);
    if (!updated) return next(new AppError('Placement not found', 404));

    if (typeof parsed.name !== 'undefined' || typeof parsed.status !== 'undefined') {
      updated = (await placementsRepo.update(publisherId, id, {
        name: parsed.name as any,
        status: parsed.status as any,
      })) || updated;
    }
    if (parsed.config) {
      updated = (await placementsRepo.patchConfig(publisherId, id, parsed.config)) || updated;
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
    } else {
      next(error);
    }
  }
};

/**
 * Delete placement
 */
export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      throw new AppError('Invalid placement ID', 400);
    }

    const publisherId = requirePublisherId(req);
    // Check if placement exists
    const existing = await placementsRepo.getById(publisherId, id);
    if (!existing) {
      throw new AppError('Placement not found', 404);
    }

    // Delete from database
    const deleted = await placementsRepo.deleteById(publisherId, id);
    
    if (!deleted) {
      throw new AppError('Failed to delete placement', 500);
    }

    logger.info(`Placement deleted`, { placementId: id, appId: existing.app_id });

    res.json({
      success: true,
      message: 'Placement deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Alias for backward compatibility
export const deletePlacement = remove;
