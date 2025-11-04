import type {
  FraudStats,
  FraudAlertRow,
  FraudTypeBreakdown,
} from '../../repositories/fraudRepository';

jest.mock('../../repositories/fraudRepository', () => ({
  fetchFraudStats: jest.fn(),
  fetchRecentFraudAlerts: jest.fn(),
  fetchFraudTypeBreakdown: jest.fn(),
}));

import {
  fetchFraudStats,
  fetchRecentFraudAlerts,
  fetchFraudTypeBreakdown,
} from '../../repositories/fraudRepository';
import {
  getFraudStatistics,
  listFraudAlerts,
  getFraudByType,
} from '../fraudDetection';

const publisherId = 'publisher-1';
const statsMock = jest.mocked(fetchFraudStats);
const alertsMock = jest.mocked(fetchRecentFraudAlerts);
const breakdownMock = jest.mocked(fetchFraudTypeBreakdown);

describe('fraudDetection service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aggregates statistics with breakdown-derived percentages', async () => {
    const stats: FraudStats = {
      totalAlerts: 10,
      highSeverity: 4,
      mediumSeverity: 6,
      lowSeverity: 0,
      blockedRevenue: 123.456,
      lastDetectionAt: '2024-04-30T12:00:00.000Z',
    };
    const breakdown: FraudTypeBreakdown[] = [
      { type: 'bot', alerts: 6, blockedRevenue: 70 },
      { type: 'spoof', alerts: 4, blockedRevenue: 53.456 },
    ];

    statsMock.mockResolvedValue(stats);
    breakdownMock.mockResolvedValue(breakdown);

    const result = await getFraudStatistics(publisherId);

    expect(statsMock).toHaveBeenCalledWith(publisherId);
    expect(breakdownMock).toHaveBeenCalledWith(publisherId);
    expect(result).toEqual({
      totalDetected: 10,
      blockedRevenue: 123.46,
  detectionRate: 40,
  avgFraudScore: 0.7,
      lastDetectionAt: stats.lastDetectionAt,
      topTypes: [
        { type: 'bot', count: 6, percentage: 60 },
        { type: 'spoof', count: 4, percentage: 40 },
      ],
    });
  });

  it('returns zeroed metrics when no alerts found', async () => {
    const stats: FraudStats = {
      totalAlerts: 0,
      highSeverity: 0,
      mediumSeverity: 0,
      lowSeverity: 0,
      blockedRevenue: 0,
      lastDetectionAt: undefined,
    };
    statsMock.mockResolvedValue(stats);
    breakdownMock.mockResolvedValue([]);

    const result = await getFraudStatistics(publisherId);

    expect(result).toEqual({
      totalDetected: 0,
      blockedRevenue: 0,
      detectionRate: 0,
      avgFraudScore: 0,
      topTypes: [],
      lastDetectionAt: undefined,
    });
  });

  it('lists recent fraud alerts via repository call', async () => {
    const alerts: FraudAlertRow[] = [
      {
        id: '1',
        type: 'bot',
        severity: 'high',
        details: 'Example',
        detectedAt: '2024-04-30T00:00:00.000Z',
      },
    ];

    alertsMock.mockResolvedValue(alerts);

    const result = await listFraudAlerts(publisherId, 5);

    expect(alertsMock).toHaveBeenCalledWith(publisherId, 5);
    expect(result).toBe(alerts);
  });

  it('returns breakdown with formatted blocked revenue', async () => {
    const breakdown: FraudTypeBreakdown[] = [
      { type: 'bot', alerts: 3, blockedRevenue: 12.345 },
    ];
    breakdownMock.mockResolvedValue(breakdown);

    const result = await getFraudByType(publisherId);

    expect(breakdownMock).toHaveBeenCalledWith(publisherId);
    expect(result).toEqual([
      { type: 'bot', count: 3, blockedRevenue: 12.35 },
    ]);
  });
});
