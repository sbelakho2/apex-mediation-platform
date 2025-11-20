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
const payoutMethodEnum = z.enum(['stripe', 'paypal', 'wire']);

const updateSettingsSchema = z
  .object({
    method: payoutMethodEnum,
    currency: z.string().length(3),
    schedule: z.enum(['monthly']).default('monthly'),
    minimumPayout: z.number().min(0),
    accountName: z.string().trim().min(1).max(100),
    accountReference: z
      .string()
      .trim()
      .min(4)
      .max(64)
      .regex(/^[A-Za-z0-9*\-\s]+$/),
    autoPayout: z.boolean().optional().default(false),
    backupMethod: payoutMethodEnum.nullable().optional(),
  })
  .refine(
    (value) => {
      if (!value.backupMethod) return true;
      return value.backupMethod !== value.method;
    },
    {
      path: ['backupMethod'],
      message: 'Backup method must differ from primary method',
    }
  );

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

    const pageParam = parseQueryParam(req.query.page);
    const sizeParam = parseQueryParam(req.query.pageSize);
    const page = pageParam ? Number(pageParam) : 1;
    const pageSize = sizeParam ? Number(sizeParam) : 25;

    if (!Number.isFinite(page) || page <= 0) {
      throw new AppError('Invalid page parameter', 400);
    }

    if (!Number.isFinite(pageSize) || pageSize <= 0) {
      throw new AppError('Invalid pageSize parameter', 400);
    }

    const result = await listPayoutHistory(publisherId, page, pageSize);

    res.json({
      success: true,
      data: {
        data: result.items,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasMore: result.hasMore,
      },
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
    const updated = await updatePayoutSettings(publisherId, {
      threshold: data.minimumPayout,
      method: data.method,
      currency: data.currency,
      schedule: data.schedule,
      accountName: data.accountName,
      accountReference: data.accountReference,
      autoPayout: data.autoPayout ?? false,
      backupMethod: data.backupMethod ?? undefined,
    });

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
