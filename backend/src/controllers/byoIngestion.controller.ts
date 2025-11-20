import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../utils/postgres';
import { createAdMobReportIngestionService } from '../services/admobReportIngestionService';
import { createUnityReportIngestionService } from '../services/unityReportIngestionService';
import { NetworkCredentialVaultService } from '../services/networkCredentialVault';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const admobService = createAdMobReportIngestionService(pool);
const unityService = createUnityReportIngestionService(pool);
const vaultService = new NetworkCredentialVaultService(pool);

type RequestWithFile = Request & { file?: { buffer?: Buffer } };

const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const requirePublisherId = (req: Request): string => {
  const publisherId = req.user?.publisherId;
  if (!publisherId) {
    throw new AppError('Missing publisher context', 401);
  }
  return publisherId;
};

const ensureDateOrder = (startDate: string, endDate: string) => {
  if (new Date(startDate) > new Date(endDate)) {
    throw new AppError('startDate must be on or before endDate', 400);
  }
};

export const ingestAdmobCsv = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = requirePublisherId(req);
    const file = (req as RequestWithFile).file;
    if (!file || !file.buffer) {
      throw new AppError('CSV report file is required', 400);
    }

    const csvContent = file.buffer.toString('utf-8');
    const result = await admobService.ingestFromCSV(publisherId, csvContent);

    logger.info('AdMob CSV ingestion triggered', {
      publisherId,
      rowsProcessed: result.rowsProcessed,
    });

    res.status(202).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const ingestAdmobApi = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = requirePublisherId(req);
    const { startDate, endDate } = dateRangeSchema.parse(req.body ?? {});
    ensureDateOrder(startDate, endDate);

    const credentials = await vaultService.getCredentials(publisherId, 'admob');
    if (!credentials) {
      throw new AppError('AdMob credentials are not configured', 400);
    }

    const accountId = credentials.credentials.accountId as string | undefined;
    const accessToken = (credentials.credentials.accessToken || credentials.credentials.apiKey) as
      | string
      | undefined;

    if (!accountId || !accessToken) {
      throw new AppError('AdMob credentials must include accountId and accessToken/apiKey', 400);
    }

    const result = await admobService.ingestFromAPI(
      publisherId,
      { accountId, accessToken },
      startDate,
      endDate
    );

    logger.info('AdMob API ingestion triggered', {
      publisherId,
      startDate,
      endDate,
      rowsProcessed: result.rowsProcessed,
    });

    res.status(202).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid date range payload', 400));
      return;
    }
    next(error);
  }
};

export const ingestUnityApi = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = requirePublisherId(req);
    const { startDate, endDate } = dateRangeSchema.parse(req.body ?? {});
    ensureDateOrder(startDate, endDate);

    const credentials = await vaultService.getCredentials(publisherId, 'unity');
    if (!credentials) {
      throw new AppError('Unity Ads credentials are not configured', 400);
    }

    const organizationId = credentials.credentials.organizationId as string | undefined;
    const projectId = credentials.credentials.projectId as string | undefined;
    const apiKey = credentials.credentials.apiKey as string | undefined;

    if (!organizationId || !projectId || !apiKey) {
      throw new AppError('Unity credentials must include organizationId, projectId, and apiKey', 400);
    }

    const result = await unityService.ingestFromAPI(
      publisherId,
      { organizationId, projectId, apiKey },
      startDate,
      endDate
    );

    logger.info('Unity API ingestion triggered', {
      publisherId,
      startDate,
      endDate,
      rowsProcessed: result.rowsProcessed,
    });

    res.status(202).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError('Invalid date range payload', 400));
      return;
    }
    next(error);
  }
};
