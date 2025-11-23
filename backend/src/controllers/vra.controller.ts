import { Request, Response } from 'express';
import { vraService } from '../services/vra/vraService';
import { getFeatureFlags } from '../utils/featureFlags';
import { executeQuery, insertBatch } from '../utils/clickhouse';
import logger from '../utils/logger';
import { vraDisputeShadowAcksTotal, vraDisputesCreatedTotal } from '../utils/prometheus';

export async function getReconOverview(req: Request, res: Response) {
  try {
    const { app_id: appId, from, to } = req.query as Record<string, string | undefined>;
    const data = await vraService.getOverview({ appId, from, to });
    return res.json({ success: true, data });
  } catch (err) {
    logger.error('VRA getReconOverview failed', { error: (err as Error)?.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}

export async function getReconDeltas(req: Request, res: Response) {
  try {
    const q = req.query as Record<string, string | undefined>;
    const data = await vraService.getDeltas({
      appId: q.app_id,
      from: q.from,
      to: q.to,
      kind: q.kind as any,
      minConf: q.min_conf ? Number(q.min_conf) : undefined,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.page_size ? Number(q.page_size) : undefined,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    logger.error('VRA getReconDeltas failed', { error: (err as Error)?.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}

export async function createDispute(req: Request, res: Response) {
  try {
    const flags = getFeatureFlags();
    const { delta_ids = [], network = '', contact = '' } = req.body || {};
    if (!Array.isArray(delta_ids) || typeof network !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid request body' });
    }

    // Shadow-only: acknowledge without side-effects
    if (flags.vraShadowOnly) {
      const disputeId = `dry-${Date.now()}`;
      try {
        if (network) {
          vraDisputeShadowAcksTotal.inc({ network });
        } else {
          vraDisputeShadowAcksTotal.inc({ network: 'unknown' });
        }
      } catch (_) {
        // metrics are best-effort; never fail the request on metrics errors
      }
      return res.status(202).json({
        success: true,
        data: {
          dispute_id: disputeId,
          status: 'draft',
          evidence_uri: 'shadow://not-written',
          amount: 0,
          network,
          contact,
          shadow: true,
        },
      });
    }

    // Sum amount from recon_deltas by evidence_id (delta_ids interpreted as evidence ids per VRA.md)
    const ids = delta_ids.map((x: any) => String(x));
    const placeholders = ids.map((_, i) => `{id${i}:String}`).join(',');
    const params: Record<string, unknown> = {};
    ids.forEach((v, i) => (params[`id${i}`] = v));

    const sumRows = await executeQuery<{ amount: string }>(
      `SELECT round(sum(amount),6) AS amount FROM recon_deltas WHERE evidence_id IN (${placeholders})`,
      params
    );
    const amount = Number(sumRows[0]?.amount || 0);
    const disputeId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const evidenceUri = `vra://disputes/${disputeId}`;

    await insertBatch('recon_disputes', [
      {
        dispute_id: disputeId,
        network,
        amount,
        status: 'draft',
        evidence_uri: evidenceUri,
      },
    ]);

    try {
      vraDisputesCreatedTotal.inc({ network: network || 'unknown' });
    } catch (_) {
      // ignore metrics errors
    }

    return res.status(201).json({
      success: true,
      data: { dispute_id: disputeId, amount, status: 'draft', evidence_uri: evidenceUri },
    });
  } catch (err) {
    logger.error('VRA createDispute failed', { error: (err as Error)?.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}

export async function getMonthlyRevenueDigest(req: Request, res: Response) {
  try {
    const month = String((req.query?.month as string) || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM.' });
    }
    const digest = await vraService.getMonthlyDigest(month);
    if (!digest) {
      return res.status(404).json({ success: false, error: 'Digest not found' });
    }
    return res.json({ success: true, data: digest });
  } catch (err) {
    logger.error('VRA getMonthlyRevenueDigest failed', { error: (err as Error)?.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
}
