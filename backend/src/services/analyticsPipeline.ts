import { subDays } from 'date-fns';
import {
  fetchRevenueOverview,
  fetchRevenueTimeSeries,
  fetchPerformanceBreakdown,
} from '../repositories/analyticsRepository';

export const getAnalyticsOverview = async (publisherId: string) => {
  return fetchRevenueOverview(publisherId);
};

export const getAnalyticsTimeSeries = async (
  publisherId: string,
  metric: 'revenue' | 'impressions' | 'clicks',
  startDate?: string,
  endDate?: string
) => {
  const now = new Date();
  const end = endDate ? new Date(endDate) : now;
  const start = startDate ? new Date(startDate) : subDays(end, 30);

  // Validate dates and cap range to 31 days (FIX-11: 673)
  const endSafe = Number.isNaN(end.getTime()) ? now : end;
  const startSafe = Number.isNaN(start.getTime()) ? subDays(endSafe, 30) : start;
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
  const rangeMs = endSafe.getTime() - startSafe.getTime();
  const startCapped = rangeMs > maxRangeMs ? subDays(endSafe, 31) : startSafe;

  const series = await fetchRevenueTimeSeries(publisherId, startCapped, endSafe);

  return series.map((point) => ({
    date: point.date,
    value:
      metric === 'revenue'
        ? Number(point.revenue.toFixed(2))
        : metric === 'impressions'
          ? point.impressions
          : point.clicks,
    revenue: point.revenue,
    impressions: point.impressions,
    clicks: point.clicks,
  }));
};

export const getPerformanceBreakdown = async (
  publisherId: string,
  groupBy: 'placement' | 'adapter'
) => {
  return fetchPerformanceBreakdown(publisherId, groupBy);
};
