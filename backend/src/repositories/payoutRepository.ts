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
  schedule: 'monthly'; // NET 30 payment terms only
  accountName: string;
  accountReference: string;
  autoPayout: boolean;
  backupMethod?: 'stripe' | 'paypal' | 'wire' | null;
}

export interface PayoutSettingsRow extends PayoutSettingsInput {
  updatedAt: string;
}

export const fetchPayoutHistory = async (
  publisherId: string,
  limit: number,
  offset = 0
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
      LIMIT $2 OFFSET $3`,
    [publisherId, limit, offset]
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

export const fetchUpcomingPayouts = async (publisherId: string): Promise<PayoutHistoryRow | null> => {
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
      ORDER BY scheduled_for ASC
      LIMIT 1`,
    [publisherId]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    id: String(rows[0].id),
    amount: toNumber(rows[0].amount),
    currency: rows[0].currency,
    status: rows[0].status,
    method: rows[0].method,
    scheduledFor: rows[0].scheduled_for.toISOString(),
  };
};

export const fetchPayoutSettings = async (
  publisherId: string
): Promise<PayoutSettingsRow | null> => {
  const { rows } = await query<{
    threshold: string | number | null;
    method: 'stripe' | 'paypal' | 'wire';
    currency: string;
    schedule: 'monthly'; // NET 30 payment terms only
    account_name: string | null;
    account_reference: string | null;
    auto_payout: boolean | null;
    backup_method: 'stripe' | 'paypal' | 'wire' | null;
    updated_at: Date;
  }>(
    `SELECT threshold, method, currency, schedule, account_name, account_reference, auto_payout, backup_method, updated_at
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
    accountName: rows[0].account_name ?? '',
    accountReference: rows[0].account_reference ?? '',
    autoPayout: rows[0].auto_payout ?? false,
    backupMethod: rows[0].backup_method ?? undefined,
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
    schedule: 'monthly'; // NET 30 payment terms only
    account_name: string | null;
    account_reference: string | null;
    auto_payout: boolean | null;
    backup_method: 'stripe' | 'paypal' | 'wire' | null;
    updated_at: Date;
  }>(
    `INSERT INTO payout_settings (publisher_id, threshold, method, currency, schedule, account_name, account_reference, auto_payout, backup_method, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (publisher_id)
      DO UPDATE SET
        threshold = EXCLUDED.threshold,
        method = EXCLUDED.method,
        currency = EXCLUDED.currency,
        schedule = EXCLUDED.schedule,
        account_name = EXCLUDED.account_name,
        account_reference = EXCLUDED.account_reference,
        auto_payout = EXCLUDED.auto_payout,
        backup_method = EXCLUDED.backup_method,
        updated_at = NOW()
      RETURNING threshold, method, currency, schedule, account_name, account_reference, auto_payout, backup_method, updated_at`,
    [
      publisherId,
      settings.threshold,
      settings.method,
      settings.currency,
      settings.schedule,
      settings.accountName,
      settings.accountReference,
      settings.autoPayout,
      settings.backupMethod ?? null,
    ]
  );

  return {
    threshold: toNumber(rows[0].threshold),
    method: rows[0].method,
    currency: rows[0].currency,
    schedule: rows[0].schedule,
    accountName: rows[0].account_name ?? '',
    accountReference: rows[0].account_reference ?? '',
    autoPayout: rows[0].auto_payout ?? false,
    backupMethod: rows[0].backup_method ?? undefined,
    updatedAt: rows[0].updated_at.toISOString(),
  };
};

export const countPayoutHistory = async (publisherId: string): Promise<number> => {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
      FROM payouts
      WHERE publisher_id = $1`,
    [publisherId]
  );

  return Number(rows[0]?.count ?? 0);
};
