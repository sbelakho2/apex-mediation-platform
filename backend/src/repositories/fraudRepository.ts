import { query } from '../utils/postgres';
import { toNumber } from '../utils/number';

export interface FraudStats {
  totalAlerts: number;
  highSeverity: number;
  mediumSeverity: number;
  lowSeverity: number;
  blockedRevenue: number;
  lastDetectionAt?: string;
}

export interface FraudAlertRow {
  id: string;
  type: string;
  severity: string;
  details: string;
  detectedAt: string;
}

export interface FraudTypeBreakdown {
  type: string;
  alerts: number;
  blockedRevenue: number;
}

export const fetchFraudStats = async (publisherId: string): Promise<FraudStats> => {
  const { rows } = await query<{
    total_alerts: string | number | null;
    high_severity: string | number | null;
    medium_severity: string | number | null;
    low_severity: string | number | null;
    last_detection_at: Date | null;
  }>(
    `SELECT
        COUNT(*) AS total_alerts,
        COUNT(*) FILTER (WHERE severity = 'high') AS high_severity,
        COUNT(*) FILTER (WHERE severity = 'medium') AS medium_severity,
        COUNT(*) FILTER (WHERE severity = 'low') AS low_severity,
        MAX(detected_at) AS last_detection_at
      FROM fraud_alerts
      WHERE publisher_id = $1`,
    [publisherId]
  );

  const stats = rows[0];

  const blockedRevenueResult = await query<{ blocked: string | number | null }>(
    `SELECT COALESCE(SUM(revenue), 0) AS blocked
      FROM revenue_events
      WHERE publisher_id = $1
        AND impressions = 0
        AND revenue > 0`,
    [publisherId]
  );

  const lastDetection = stats?.last_detection_at
    ? stats.last_detection_at.toISOString()
    : undefined;

  return {
    totalAlerts: toNumber(stats?.total_alerts),
    highSeverity: toNumber(stats?.high_severity),
    mediumSeverity: toNumber(stats?.medium_severity),
    lowSeverity: toNumber(stats?.low_severity),
    blockedRevenue: toNumber(blockedRevenueResult.rows[0]?.blocked),
    lastDetectionAt: lastDetection,
  };
};

export const fetchRecentFraudAlerts = async (
  publisherId: string,
  limit: number
): Promise<FraudAlertRow[]> => {
  const { rows } = await query<{
    id: string;
    type: string;
    severity: string;
    details: string;
    detected_at: Date;
  }>(
    `SELECT id, type, severity, details, detected_at
      FROM fraud_alerts
      WHERE publisher_id = $1
      ORDER BY detected_at DESC
      LIMIT $2`,
    [publisherId, limit]
  );

  return rows.map((row) => ({
    id: String(row.id),
    type: row.type,
    severity: row.severity,
    details: row.details,
    detectedAt: row.detected_at.toISOString(),
  }));
};

export const fetchFraudTypeBreakdown = async (
  publisherId: string
): Promise<FraudTypeBreakdown[]> => {
  const { rows } = await query<{
    type: string;
    alerts: string | number | null;
  }>(
    `SELECT type, COUNT(*) AS alerts
      FROM fraud_alerts
      WHERE publisher_id = $1
      GROUP BY type
      ORDER BY alerts DESC`,
    [publisherId]
  );

  return rows.map((row) => ({
    type: row.type,
    alerts: toNumber(row.alerts),
    blockedRevenue: 0,
  }));
};
