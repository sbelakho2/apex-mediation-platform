import { query } from '../utils/postgres';
import { toNumber } from '../utils/number';

export interface PayoutHistoryRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  processedAt?: string;
  scheduledFor: string;
}

export interface PayoutSettingsInput {
  threshold: number;
  method: 'stripe' | 'paypal' | 'wire';
  currency: string;
  schedule: 'weekly' | 'biweekly' | 'monthly';
}

export interface PayoutSettingsRow extends PayoutSettingsInput {
  updatedAt: string;
}

export const fetchPayoutHistory = async (
  publisherId: string,
  limit: number
): Promise<PayoutHistoryRow[]> => {
  const { rows } = await query<{
    id: string;
    amount: string | number | null;
    currency: string;
    status: string;
    method: string;
    processed_at: Date | null;
    scheduled_for: Date;
  }>(
    `SELECT id, amount, currency, status, method, processed_at, scheduled_for
      FROM payouts
      WHERE publisher_id = $1
      ORDER BY COALESCE(processed_at, scheduled_for) DESC
      LIMIT $2`,
    [publisherId, limit]
  );

  return rows.map((row) => ({
    id: String(row.id),
    amount: toNumber(row.amount),
    currency: row.currency,
    status: row.status,
    method: row.method,
    processedAt: row.processed_at?.toISOString(),
    scheduledFor: row.scheduled_for.toISOString(),
  }));
};

export const fetchUpcomingPayouts = async (publisherId: string): Promise<PayoutHistoryRow[]> => {
  const { rows } = await query<{
    id: string;
    amount: string | number | null;
    currency: string;
    status: string;
    method: string;
    scheduled_for: Date;
  }>(
    `SELECT id, amount, currency, status, method, scheduled_for
      FROM payouts
      WHERE publisher_id = $1
        AND status IN ('pending', 'processing')
      ORDER BY scheduled_for ASC`,
    [publisherId]
  );

  return rows.map((row) => ({
    id: String(row.id),
    amount: toNumber(row.amount),
    currency: row.currency,
    status: row.status,
    method: row.method,
    scheduledFor: row.scheduled_for.toISOString(),
  }));
};

export const fetchPayoutSettings = async (
  publisherId: string
): Promise<PayoutSettingsRow | null> => {
  const { rows } = await query<{
    threshold: string | number | null;
    method: 'stripe' | 'paypal' | 'wire';
    currency: string;
    schedule: 'weekly' | 'biweekly' | 'monthly';
    updated_at: Date;
  }>(
    `SELECT threshold, method, currency, schedule, updated_at
      FROM payout_settings
      WHERE publisher_id = $1`,
    [publisherId]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    threshold: toNumber(rows[0].threshold),
    method: rows[0].method,
    currency: rows[0].currency,
    schedule: rows[0].schedule,
    updatedAt: rows[0].updated_at.toISOString(),
  };
};

export const upsertPayoutSettings = async (
  publisherId: string,
  settings: PayoutSettingsInput
): Promise<PayoutSettingsRow> => {
  const { rows } = await query<{
    threshold: string | number | null;
    method: 'stripe' | 'paypal' | 'wire';
    currency: string;
    schedule: 'weekly' | 'biweekly' | 'monthly';
    updated_at: Date;
  }>(
    `INSERT INTO payout_settings (publisher_id, threshold, method, currency, schedule, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (publisher_id)
      DO UPDATE SET
        threshold = EXCLUDED.threshold,
        method = EXCLUDED.method,
        currency = EXCLUDED.currency,
        schedule = EXCLUDED.schedule,
        updated_at = NOW()
      RETURNING threshold, method, currency, schedule, updated_at`,
    [publisherId, settings.threshold, settings.method, settings.currency, settings.schedule]
  );

  return {
    threshold: toNumber(rows[0].threshold),
    method: rows[0].method,
    currency: rows[0].currency,
    schedule: rows[0].schedule,
    updatedAt: rows[0].updated_at.toISOString(),
  };
};
