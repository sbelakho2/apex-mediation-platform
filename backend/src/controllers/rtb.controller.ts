import { Request, Response, NextFunction } from 'express';
import { executeAuction, getCircuitBreakerStats, getAdapterConfig } from '../services/openrtbEngine';
import { 
  executeWithWaterfall, 
  updateWaterfallStats, 
  getWaterfallStats 
} from '../services/waterfallService';
import { OpenRTBBidRequest } from '../types/openrtb.types';
import logger from '../utils/logger';

/**
 * POST /api/v1/rtb/bid
 * OpenRTB 2.6 compliant bid request endpoint
 * Supports waterfall fallback via query parameter: ?waterfall=true
 */
export const requestBid = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const bidRequest = req.body as OpenRTBBidRequest;
    const useWaterfall = req.query.waterfall === 'true';

    if (useWaterfall) {
      // Execute with waterfall fallback
      const waterfallResult = await executeWithWaterfall(bidRequest);
      updateWaterfallStats(waterfallResult);

      if (!waterfallResult.success || !waterfallResult.finalResult.response) {
        res.status(204).send();
        return;
      }

      // Return response with waterfall metadata
      res.json({
        ...waterfallResult.finalResult.response,
        ext: {
          ...waterfallResult.finalResult.response.ext,
          waterfall: {
            attempts: waterfallResult.attempts.length,
            fallbackUsed: waterfallResult.fallbackUsed,
            totalDuration: waterfallResult.totalDuration,
          },
        },
      });
    } else {
      // Execute standard S2S auction
      const auctionResult = await executeAuction(bidRequest);

      if (!auctionResult.success || !auctionResult.response) {
        res.status(204).send();
        return;
      }

      res.json(auctionResult.response);
    }
  } catch (error) {
    logger.error('RTB bid request failed', { error });
    next(error);
  }
};

/**
 * GET /api/v1/rtb/status
 * Get RTB engine status and circuit breaker stats
 */
export const getStatus = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.json({
    success: true,
    data: {
      adapters: getAdapterConfig(),
      circuitBreakers: getCircuitBreakerStats(),
      waterfall: getWaterfallStats(),
      status: 'operational',
    },
  });
};
