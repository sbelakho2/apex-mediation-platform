import {
  fetchFraudStats,
  fetchRecentFraudAlerts,
  fetchFraudTypeBreakdown,
} from '../repositories/fraudRepository';

export const getFraudStatistics = async (publisherId: string) => {
  const stats = await fetchFraudStats(publisherId);
  const typeBreakdown = await fetchFraudTypeBreakdown(publisherId);

  return {
    totalDetected: stats.totalAlerts,
    blockedRevenue: Number(stats.blockedRevenue.toFixed(2)),
    detectionRate: stats.totalAlerts > 0 ? Number(((stats.highSeverity / stats.totalAlerts) * 100).toFixed(2)) : 0,
    avgFraudScore: stats.totalAlerts > 0
      ? Number(((stats.highSeverity * 1 + stats.mediumSeverity * 0.5) / stats.totalAlerts).toFixed(2))
      : 0,
    topTypes: typeBreakdown.map((row) => ({
      type: row.type,
      count: row.alerts,
      percentage: stats.totalAlerts > 0 ? Number(((row.alerts / stats.totalAlerts) * 100).toFixed(1)) : 0,
    })),
    lastDetectionAt: stats.lastDetectionAt,
  };
};

export const listFraudAlerts = async (publisherId: string, limit: number) => {
  return fetchRecentFraudAlerts(publisherId, limit);
};

export const getFraudByType = async (publisherId: string) => {
  const breakdown = await fetchFraudTypeBreakdown(publisherId);
  return breakdown.map((row) => ({
    type: row.type,
    count: row.alerts,
    blockedRevenue: Number(row.blockedRevenue.toFixed(2)),
  }));
};
