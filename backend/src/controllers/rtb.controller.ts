import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger';
import { AuctionRequestBody } from '../schemas/rtb';
import { runAuction } from '../services/rtb/orchestrator';
import { getAllAdapters } from '../services/rtb/adapterRegistry';

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
    const body = req.body as AuctionRequestBody;
    const enabled = process.env.ENABLE_PRODUCTION_RTB === '1';

    if (!enabled) {
      // Fallback to legacy mock engine
      const { executeBid } = await import('../services/rtbEngine');
      const resp = await executeBid({
        requestId: body.requestId || crypto.randomUUID?.() || 'req',
        placementId: body.placementId,
        adFormat: body.adFormat,
        floorCpm: body.floorCpm ?? 0,
        device: body.device as any,
        user: body.user as any,
        app: body.app as any,
        signal: body.signal,
      } as any);
      if (!resp) { res.status(204).send(); return; }
      res.json(resp);
      return;
    }

    const proto = (req.headers['x-forwarded-proto'] as string) || (req.protocol || 'http');
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
    const baseUrl = `${proto}://${host}`;

    const migration = body.signal?.migration
      ? {
          experimentId: body.signal.migration.experiment_id,
          arm: body.signal.migration.arm,
          assignmentTs: body.signal.migration.assignment_ts,
          mirrorPercent: body.signal.migration.mirror_percent,
          mode: body.signal.migration.mode,
        }
      : undefined;

    const result = await runAuction({
      requestId: body.requestId!,
      placementId: body.placementId,
      adFormat: body.adFormat,
      floorCpm: body.floorCpm ?? 0,
      device: body.device,
      user: body.user,
      app: body.app,
      consent: body.consent && {
        gdpr: body.consent.gdpr,
        gdprConsent: body.consent.gdpr_consent,
        usPrivacy: body.consent.us_privacy,
        coppa: body.consent.coppa,
      },
      signal: body.signal,
      migration,
    }, baseUrl);

    if (!result.success || !result.response) {
      if (result.reason === 'CONTROL_ARM' || result.reason === 'SHADOW_MODE') {
        res.status(204).send();
        return;
      }
      // Provide structured error response to aid debugging and instrumentation
      const reason = (result as any).reason || 'UNKNOWN';
      res.status(400).json({ success: false, error: 'Auction failed', reason });
      return;
    }

    res.json(result.response);
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
      adapters: getAllAdapters().map(a => ({ name: a.name, supports: a.supports, timeoutMs: a.timeoutMs })),
      circuitBreakers: {},
      waterfall: {},
      status: 'operational',
    },
  });
};
