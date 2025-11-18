/**
 * Analytics Reporting Service (stub)
 *
 * Prevents dead imports and offers a minimal facade that can be expanded.
 * Delegates to reportingService for now.
 * (FIX-11: 697)
 */

import reportingService from './reportingService';

export interface OverviewParams {
  publisherId: string;
  startDate: Date;
  endDate: Date;
}

export const getOverview = async ({ publisherId, startDate, endDate }: OverviewParams) => {
  return reportingService.getRevenueStats(publisherId, startDate, endDate);
};

export const getTimeSeries = async (
  publisherId: string,
  startDate: Date,
  endDate: Date,
  granularity: 'hour' | 'day' = 'day'
) => {
  return reportingService.getTimeSeriesData(publisherId, startDate, endDate, granularity);
};

export default {
  getOverview,
  getTimeSeries,
};