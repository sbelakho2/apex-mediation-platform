import { subDays } from 'date-fns';
import type {
  RevenueOverview,
  TimeSeriesPoint,
  PerformanceRow,
} from '../../repositories/analyticsRepository';

jest.mock('../../repositories/analyticsRepository', () => ({
  fetchRevenueOverview: jest.fn(),
  fetchRevenueTimeSeries: jest.fn(),
  fetchPerformanceBreakdown: jest.fn(),
}));

import {
  fetchRevenueOverview,
  fetchRevenueTimeSeries,
  fetchPerformanceBreakdown,
} from '../../repositories/analyticsRepository';
import {
  getAnalyticsOverview,
  getAnalyticsTimeSeries,
  getPerformanceBreakdown,
} from '../analyticsPipeline';

const publisherId = 'publisher-1';
const overviewMock = jest.mocked(fetchRevenueOverview);
const timeSeriesMock = jest.mocked(fetchRevenueTimeSeries);
const performanceMock = jest.mocked(fetchPerformanceBreakdown);

describe('analyticsPipeline service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('delegates overview fetch to repository', async () => {
    const expected: RevenueOverview = {
      revenue: {
        today: 10,
        yesterday: 20,
        thisMonth: 100,
        lastMonth: 80,
        lifetime: 500,
      },
      impressions: 1000,
      clicks: 50,
      ecpm: 5,
      ctr: 5,
    };
    overviewMock.mockResolvedValue(expected);

    const result = await getAnalyticsOverview(publisherId);

    expect(overviewMock).toHaveBeenCalledWith(publisherId);
    expect(result).toBe(expected);
  });

  it('returns formatted time series with default 30-day range when no dates provided', async () => {
    const now = new Date('2024-04-30T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const points: TimeSeriesPoint[] = [
      {
        date: '2024-04-29',
        revenue: 12.345,
        impressions: 1000,
        clicks: 120,
      },
    ];
    timeSeriesMock.mockResolvedValue(points);

    const result = await getAnalyticsTimeSeries(publisherId, 'revenue');

    expect(timeSeriesMock).toHaveBeenCalledWith(publisherId, subDays(now, 30), now);
    expect(result).toEqual([
      {
        date: '2024-04-29',
        value: 12.35,
        revenue: 12.345,
        impressions: 1000,
        clicks: 120,
      },
    ]);
  });

  it('calculates metric-specific values and uses provided range', async () => {
    const point: TimeSeriesPoint = {
      date: '2024-04-28',
      revenue: 5.01,
      impressions: 200,
      clicks: 10,
    };
    timeSeriesMock.mockResolvedValue([point]);

    const start = '2024-04-01';
    const end = '2024-04-30';

    const impressionsSeries = await getAnalyticsTimeSeries(
      publisherId,
      'impressions',
      start,
      end
    );

    expect(timeSeriesMock).toHaveBeenCalledWith(
      publisherId,
      new Date(start),
      new Date(end)
    );
    expect(impressionsSeries[0]).toMatchObject({
      value: 200,
      impressions: 200,
      clicks: 10,
      revenue: 5.01,
    });

    timeSeriesMock.mockResolvedValue([point]);
    const clicksSeries = await getAnalyticsTimeSeries(publisherId, 'clicks', start, end);
    expect(clicksSeries[0].value).toBe(10);
  });

  it('delegates performance breakdown fetch to repository', async () => {
    const rows: PerformanceRow[] = [
      {
        id: 'placement-1',
        name: 'Interstitial',
        revenue: 10,
        impressions: 500,
        ecpm: 20,
      },
    ];
    performanceMock.mockResolvedValue(rows);

    const result = await getPerformanceBreakdown(publisherId, 'placement');

    expect(performanceMock).toHaveBeenCalledWith(publisherId, 'placement');
    expect(result).toBe(rows);
  });
});
