import { query } from '../utils/postgres';
import { toNumber } from '../utils/number';

export interface RevenueOverview {
  revenue: {
    today: number;
    yesterday: number;
    thisMonth: number;
    lastMonth: number;
    lifetime: number;
  };
  impressions: number;
  clicks: number;
  ecpm: number;
  ctr: number;
}

export interface TimeSeriesPoint {
  date: string;
  revenue: number;
  impressions: number;
  clicks: number;
}

export interface PerformanceRow {
  id: string;
  name: string;
  revenue: number;
  impressions: number;
  ecpm: number;
}

export const fetchRevenueOverview = async (publisherId: string): Promise<RevenueOverview> => {
  const { rows } = await query<{
    revenue_today: string | number | null;
    revenue_yesterday: string | number | null;
    revenue_this_month: string | number | null;
    revenue_last_month: string | number | null;
    revenue_lifetime: string | number | null;
    impressions_total: string | number | null;
    clicks_total: string | number | null;
  }>(
    `SELECT
        SUM(CASE WHEN event_date = CURRENT_DATE THEN revenue ELSE 0 END) AS revenue_today,
        SUM(CASE WHEN event_date = CURRENT_DATE - INTERVAL '1 day' THEN revenue ELSE 0 END) AS revenue_yesterday,
        SUM(CASE WHEN date_trunc('month', event_date) = date_trunc('month', CURRENT_DATE) THEN revenue ELSE 0 END) AS revenue_this_month,
        SUM(CASE WHEN date_trunc('month', event_date) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month') THEN revenue ELSE 0 END) AS revenue_last_month,
        SUM(revenue) AS revenue_lifetime,
        SUM(impressions) AS impressions_total,
        SUM(clicks) AS clicks_total
      FROM revenue_events
      WHERE publisher_id = $1`,
    [publisherId]
  );

  const totals = rows[0] ?? {
    revenue_today: 0,
    revenue_yesterday: 0,
    revenue_this_month: 0,
    revenue_last_month: 0,
    revenue_lifetime: 0,
    impressions_total: 0,
    clicks_total: 0,
  };

  const impressions = toNumber(totals.impressions_total);
  const clicks = toNumber(totals.clicks_total);
  const lifetimeRevenue = toNumber(totals.revenue_lifetime);
  const ecpm = impressions > 0 ? (lifetimeRevenue / impressions) * 1000 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  return {
    revenue: {
      today: toNumber(totals.revenue_today),
      yesterday: toNumber(totals.revenue_yesterday),
      thisMonth: toNumber(totals.revenue_this_month),
      lastMonth: toNumber(totals.revenue_last_month),
      lifetime: lifetimeRevenue,
    },
    impressions,
    clicks,
    ecpm: Number(ecpm.toFixed(2)),
    ctr: Number(ctr.toFixed(2)),
  };
};

export const fetchRevenueTimeSeries = async (
  publisherId: string,
  startDate: Date,
  endDate: Date
): Promise<TimeSeriesPoint[]> => {
  const { rows } = await query<{
    event_date: Date;
    revenue: string | number | null;
    impressions: string | number | null;
    clicks: string | number | null;
  }>(
    `SELECT
        event_date,
        SUM(revenue) AS revenue,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks
      FROM revenue_events
      WHERE publisher_id = $1
        AND event_date BETWEEN $2 AND $3
      GROUP BY event_date
      ORDER BY event_date ASC`,
    [publisherId, startDate, endDate]
  );

  return rows.map((row) => ({
    date: row.event_date.toISOString().split('T')[0],
    revenue: toNumber(row.revenue),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
  }));
};

export const fetchPerformanceBreakdown = async (
  publisherId: string,
  groupBy: 'placement' | 'adapter'
): Promise<PerformanceRow[]> => {
  if (groupBy === 'adapter') {
    const { rows } = await query<{
      adapter_id: string;
      name: string;
      revenue: string | number | null;
      impressions: string | number | null;
    }>(
      `SELECT
          a.id AS adapter_id,
          a.name,
          SUM(re.revenue) AS revenue,
          SUM(re.impressions) AS impressions
        FROM revenue_events re
        JOIN adapters a ON a.id = re.adapter_id
        WHERE re.publisher_id = $1
        GROUP BY a.id, a.name
        ORDER BY revenue DESC NULLS LAST`,
      [publisherId]
    );

    return rows.map((row) => {
      const impressions = toNumber(row.impressions);
      const revenue = toNumber(row.revenue);
      const ecpm = impressions > 0 ? (revenue / impressions) * 1000 : 0;
      return {
        id: row.adapter_id,
        name: row.name,
        revenue,
        impressions,
        ecpm: Number(ecpm.toFixed(2)),
      };
    });
  }

  const { rows } = await query<{
    placement_id: string;
    name: string;
    revenue: string | number | null;
    impressions: string | number | null;
  }>(
    `SELECT
        p.id AS placement_id,
        p.name,
        SUM(re.revenue) AS revenue,
        SUM(re.impressions) AS impressions
      FROM revenue_events re
      JOIN placements p ON p.id = re.placement_id
      WHERE re.publisher_id = $1
      GROUP BY p.id, p.name
      ORDER BY revenue DESC NULLS LAST`,
    [publisherId]
  );

  return rows.map((row) => {
    const impressions = toNumber(row.impressions);
    const revenue = toNumber(row.revenue);
    const ecpm = impressions > 0 ? (revenue / impressions) * 1000 : 0;
    return {
      id: row.placement_id,
      name: row.name,
      revenue,
      impressions,
      ecpm: Number(ecpm.toFixed(2)),
    };
  });
};
