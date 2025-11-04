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
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate ? new Date(startDate) : subDays(end, 30);

  const series = await fetchRevenueTimeSeries(publisherId, start, end);

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
