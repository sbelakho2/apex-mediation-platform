import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import {
  listPayoutHistory,
  getUpcomingPayouts,
  getPayoutSettings,
  updatePayoutSettings,
} from '../services/payoutProcessor';

// Validation schema
const updateSettingsSchema = z.object({
  threshold: z.number().min(0),
  method: z.enum(['stripe', 'paypal', 'wire']),
  currency: z.string().length(3),
  schedule: z.enum(['monthly']), // NET 30 payment terms only
});

const parseQueryParam = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        return item;
      }
    }
  }

  return undefined;
};

export const getHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const limitParam = parseQueryParam(req.query.limit);
    const limit = limitParam ? Number(limitParam) : 10;

    if (!Number.isFinite(limit) || limit <= 0) {
      throw new AppError('Invalid limit parameter', 400);
    }

    // Cap maximum to prevent abuse (FIX-11: 667)
    const bounded = Math.min(Math.floor(limit), 100);

    const history = await listPayoutHistory(publisherId, bounded);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get upcoming payouts
 */
export const getUpcoming = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const upcoming = await getUpcomingPayouts(publisherId);

    res.json({
      success: true,
      data: upcoming,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get payout settings
 */
export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const settings = await getPayoutSettings(publisherId);

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update payout settings
 */
export const updateSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Missing publisher context', 401);
    }

    const data = updateSettingsSchema.parse(req.body);
    const updated = await updatePayoutSettings(publisherId, data);

    // Emit simple audit log (FIX-11: 667)
    logger.info('[Payouts] Settings updated', {
      actor: req.user?.email,
      publisherId,
      method: data.method,
      currency: data.currency,
      schedule: data.schedule,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid request data', 400));
    } else {
      next(error);
    }
  }
};
