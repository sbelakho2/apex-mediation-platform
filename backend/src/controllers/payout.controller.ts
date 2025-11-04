import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
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
  schedule: z.enum(['weekly', 'biweekly', 'monthly']),
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

    const history = await listPayoutHistory(publisherId, Math.floor(limit));

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
