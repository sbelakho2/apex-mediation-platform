/**
 * Reporting Service
 * 
 * Queries ClickHouse for analytics and reporting data
 */

import { executeQuery } from '../utils/clickhouse';
import logger from '../utils/logger';

export interface RevenueStats {
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  ecpm: number;
  ctr: number;
  fillRate: number;
}

export interface TimeSeriesDataPoint {
  timestamp: string;
  revenue: number;
  impressions: number;
  clicks: number;
  ecpm: number;
}

export interface AdapterPerformance {
  adapterId: string;
  adapterName: string;
  revenue: number;
  impressions: number;
  clicks: number;
  ecpm: number;
  ctr: number;
  avgLatency: number;
}

export interface CountryBreakdown {
  countryCode: string;
  revenue: number;
  impressions: number;
  ecpm: number;
}

export interface AdapterHealthScore {
  adapterId: string;
  adapterName: string;
  healthScore: number; // 0-100
  uptime: number; // percentage
  errorRate: number;
  avgResponseTime: number;
  fillRate: number;
  revenueShare: number;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  lastIssue?: string;
  issuesLast24h: number;
}

export interface FraudMetrics {
  totalRequests: number;
  fraudRequests: number;
  fraudRate: number;
  givtDetections: number;
  sivtDetections: number;
  mlDetections: number;
  anomalyDetections: number;
  blockedRevenue: number;
  topFraudTypes: Array<{ type: string; count: number }>;
}

export interface QualityMetrics {
  viewabilityRate: number;
  completionRate: number;
  clickThroughRate: number;
  invalidTrafficRate: number;
  brandSafetyScore: number;
  userExperienceScore: number;
  anrRate: number;
  crashRate: number;
}

export interface RevenueProjection {
  date: string;
  projectedRevenue: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface CohortMetrics {
  cohortDate: string;
  userCount: number;
  day0Revenue: number;
  day1Revenue: number;
  day7Revenue: number;
  day30Revenue: number;
  ltv: number;
  retentionDay1: number;
  retentionDay7: number;
  retentionDay30: number;
  arpu: number;
}

export interface AnomalyAlert {
  id: string;
  timestamp: string;
  type: 'revenue_drop' | 'fraud_spike' | 'performance_degradation' | 'traffic_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  description: string;
}

export interface ReportingService {
  getRevenueStats(publisherId: string, startDate: Date, endDate: Date): Promise<RevenueStats>;
  getTimeSeriesData(publisherId: string, startDate: Date, endDate: Date, granularity: 'hour' | 'day'): Promise<TimeSeriesDataPoint[]>;
  getAdapterPerformance(publisherId: string, startDate: Date, endDate: Date): Promise<AdapterPerformance[]>;
  getCountryBreakdown(publisherId: string, startDate: Date, endDate: Date, limit: number): Promise<CountryBreakdown[]>;
  
  // Advanced analytics methods
  getAdapterHealthScores(publisherId: string): Promise<AdapterHealthScore[]>;
  getFraudMetrics(publisherId: string, startDate: Date, endDate: Date): Promise<FraudMetrics>;
  getQualityMetrics(publisherId: string, startDate: Date, endDate: Date): Promise<QualityMetrics>;
  getRevenueProjections(publisherId: string, days: number): Promise<RevenueProjection[]>;
  getCohortAnalysis(publisherId: string, startDate: Date, endDate: Date): Promise<CohortMetrics[]>;
  getAnomalies(publisherId: string, hours: number): Promise<AnomalyAlert[]>;
}

class ReportingServiceImpl implements ReportingService {
  /**
   * Get overall revenue statistics for a publisher
   */
  async getRevenueStats(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RevenueStats> {
    try {
      const query = `
        SELECT
          sum(revenue_usd) as total_revenue,
          count(DISTINCT impression_id) as total_impressions,
          countIf(revenue_type = 'click') as total_clicks,
          (sum(revenue_usd) / count(DISTINCT impression_id)) * 1000 as ecpm,
          (countIf(revenue_type = 'click') / count(DISTINCT impression_id)) * 100 as ctr
        FROM revenue_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND is_test_mode = 0
      `;

      const result = await executeQuery<{
        total_revenue: string;
        total_impressions: string;
        total_clicks: string;
        ecpm: string;
        ctr: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (result.length === 0) {
        return {
          totalRevenue: 0,
          totalImpressions: 0,
          totalClicks: 0,
          ecpm: 0,
          ctr: 0,
          fillRate: 0,
        };
      }

      const row = result[0];
      return {
        totalRevenue: parseFloat(row.total_revenue),
        totalImpressions: parseInt(row.total_impressions),
        totalClicks: parseInt(row.total_clicks),
        ecpm: parseFloat(row.ecpm),
        ctr: parseFloat(row.ctr),
        fillRate: 100, // TODO: Calculate from impression requests vs served
      };
    } catch (error) {
      logger.error('Failed to get revenue stats', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get time series data for charting
   */
  async getTimeSeriesData(
    publisherId: string,
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<TimeSeriesDataPoint[]> {
    try {
      const timeFunction = granularity === 'hour' ? 'toStartOfHour' : 'toStartOfDay';
      
      const query = `
        SELECT
          ${timeFunction}(timestamp) as timestamp,
          sum(revenue_usd) as revenue,
          count(DISTINCT impression_id) as impressions,
          countIf(revenue_type = 'click') as clicks,
          (sum(revenue_usd) / count(DISTINCT impression_id)) * 1000 as ecpm
        FROM revenue_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND is_test_mode = 0
        GROUP BY timestamp
        ORDER BY timestamp ASC
      `;

      const result = await executeQuery<{
        timestamp: string;
        revenue: string;
        impressions: string;
        clicks: string;
        ecpm: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      return result.map(row => ({
        timestamp: row.timestamp,
        revenue: parseFloat(row.revenue),
        impressions: parseInt(row.impressions),
        clicks: parseInt(row.clicks),
        ecpm: parseFloat(row.ecpm),
      }));
    } catch (error) {
      logger.error('Failed to get time series data', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get performance breakdown by adapter
   */
  async getAdapterPerformance(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<AdapterPerformance[]> {
    try {
      const query = `
        SELECT
          r.adapter_id,
          r.adapter_name,
          sum(r.revenue_usd) as revenue,
          count(DISTINCT r.impression_id) as impressions,
          countIf(r.revenue_type = 'click') as clicks,
          (sum(r.revenue_usd) / count(DISTINCT r.impression_id)) * 1000 as ecpm,
          (countIf(r.revenue_type = 'click') / count(DISTINCT r.impression_id)) * 100 as ctr,
          avg(i.latency_ms) as avg_latency
        FROM revenue_events r
        LEFT JOIN impressions i ON r.impression_id = i.event_id
        WHERE r.publisher_id = {publisherId:UUID}
          AND r.timestamp >= {startDate:DateTime}
          AND r.timestamp < {endDate:DateTime}
          AND r.is_test_mode = 0
        GROUP BY r.adapter_id, r.adapter_name
        ORDER BY revenue DESC
      `;

      const result = await executeQuery<{
        adapter_id: string;
        adapter_name: string;
        revenue: string;
        impressions: string;
        clicks: string;
        ecpm: string;
        ctr: string;
        avg_latency: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      return result.map(row => ({
        adapterId: row.adapter_id,
        adapterName: row.adapter_name,
        revenue: parseFloat(row.revenue),
        impressions: parseInt(row.impressions),
        clicks: parseInt(row.clicks),
        ecpm: parseFloat(row.ecpm),
        ctr: parseFloat(row.ctr),
        avgLatency: parseFloat(row.avg_latency),
      }));
    } catch (error) {
      logger.error('Failed to get adapter performance', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get revenue breakdown by country
   */
  async getCountryBreakdown(
    publisherId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<CountryBreakdown[]> {
    try {
      const query = `
        SELECT
          country_code,
          sum(revenue_usd) as revenue,
          count(DISTINCT impression_id) as impressions,
          (sum(revenue_usd) / count(DISTINCT impression_id)) * 1000 as ecpm
        FROM revenue_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND is_test_mode = 0
        GROUP BY country_code
        ORDER BY revenue DESC
        LIMIT {limit:UInt32}
      `;

      const result = await executeQuery<{
        country_code: string;
        revenue: string;
        impressions: string;
        ecpm: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit,
      });

      return result.map(row => ({
        countryCode: row.country_code,
        revenue: parseFloat(row.revenue),
        impressions: parseInt(row.impressions),
        ecpm: parseFloat(row.ecpm),
      }));
    } catch (error) {
      logger.error('Failed to get country breakdown', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get top performing apps
   */
  async getTopApps(
    publisherId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10
  ): Promise<Array<{
    appId: string;
    revenue: number;
    impressions: number;
    ecpm: number;
  }>> {
    try {
      const query = `
        SELECT
          app_id,
          sum(revenue_usd) as revenue,
          count(DISTINCT impression_id) as impressions,
          (sum(revenue_usd) / count(DISTINCT impression_id)) * 1000 as ecpm
        FROM revenue_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND is_test_mode = 0
        GROUP BY app_id
        ORDER BY revenue DESC
        LIMIT {limit:UInt32}
      `;

      const result = await executeQuery<{
        app_id: string;
        revenue: string;
        impressions: string;
        ecpm: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit,
      });

      return result.map(row => ({
        appId: row.app_id,
        revenue: parseFloat(row.revenue),
        impressions: parseInt(row.impressions),
        ecpm: parseFloat(row.ecpm),
      }));
    } catch (error) {
      logger.error('Failed to get top apps', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get real-time stats (last hour)
   */
  async getRealtimeStats(publisherId: string): Promise<{
    lastHourRevenue: number;
    lastHourImpressions: number;
    activeAdapters: number;
  }> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const query = `
        SELECT
          sum(revenue_usd) as revenue,
          count(DISTINCT impression_id) as impressions,
          uniq(adapter_id) as active_adapters
        FROM revenue_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {oneHourAgo:DateTime}
          AND is_test_mode = 0
      `;

      const result = await executeQuery<{
        revenue: string;
        impressions: string;
        active_adapters: string;
      }>(query, {
        publisherId,
        oneHourAgo: oneHourAgo.toISOString(),
      });

      if (result.length === 0) {
        return {
          lastHourRevenue: 0,
          lastHourImpressions: 0,
          activeAdapters: 0,
        };
      }

      const row = result[0];
      return {
        lastHourRevenue: parseFloat(row.revenue),
        lastHourImpressions: parseInt(row.impressions),
        activeAdapters: parseInt(row.active_adapters),
      };
    } catch (error) {
      logger.error('Failed to get realtime stats', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get adapter health scores with real-time monitoring
   */
  async getAdapterHealthScores(publisherId: string): Promise<AdapterHealthScore[]> {
    try {
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const query = `
        WITH adapter_stats AS (
          SELECT
            adapter_id,
            adapter_name,
            countIf(status = 'success') as success_count,
            countIf(status = 'error') as error_count,
            count(*) as total_requests,
            avg(latency_ms) as avg_latency,
            countIf(filled = 1) / count(*) * 100 as fill_rate,
            sum(revenue_usd) as revenue
          FROM impressions
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {last24h:DateTime}
          GROUP BY adapter_id, adapter_name
        ),
        total_revenue AS (
          SELECT sum(revenue) as total FROM adapter_stats
        ),
        adapter_errors AS (
          SELECT
            adapter_id,
            count(*) as error_count_24h,
            argMax(error_message, timestamp) as last_issue
          FROM sdk_telemetry
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {last24h:DateTime}
            AND event_type = 'error'
          GROUP BY adapter_id
        )
        SELECT
          s.adapter_id,
          s.adapter_name,
          s.success_count / s.total_requests * 100 as uptime,
          s.error_count / s.total_requests as error_rate,
          s.avg_latency,
          s.fill_rate,
          s.revenue / t.total * 100 as revenue_share,
          COALESCE(e.error_count_24h, 0) as issues_last_24h,
          e.last_issue
        FROM adapter_stats s
        CROSS JOIN total_revenue t
        LEFT JOIN adapter_errors e ON s.adapter_id = e.adapter_id
        ORDER BY revenue_share DESC
      `;

      const result = await executeQuery<{
        adapter_id: string;
        adapter_name: string;
        uptime: string;
        error_rate: string;
        avg_latency: string;
        fill_rate: string;
        revenue_share: string;
        issues_last_24h: string;
        last_issue: string | null;
      }>(query, {
        publisherId,
        last24h: last24h.toISOString(),
      });

      return result.map(row => {
        const uptime = parseFloat(row.uptime);
        const errorRate = parseFloat(row.error_rate);
        const fillRate = parseFloat(row.fill_rate);
        const avgLatency = parseFloat(row.avg_latency);
        
        // Calculate health score (0-100)
        let healthScore = 100;
        healthScore -= (100 - uptime) * 0.4; // Uptime weighted 40%
        healthScore -= errorRate * 30; // Error rate weighted 30%
        healthScore -= Math.max(0, (avgLatency - 500) / 10); // Latency penalty after 500ms
        healthScore -= (100 - fillRate) * 0.3; // Fill rate weighted 30%
        healthScore = Math.max(0, Math.min(100, healthScore));

        // Determine status
        let status: 'healthy' | 'degraded' | 'critical' | 'offline';
        if (uptime < 50) status = 'offline';
        else if (healthScore < 50) status = 'critical';
        else if (healthScore < 70) status = 'degraded';
        else status = 'healthy';

        return {
          adapterId: row.adapter_id,
          adapterName: row.adapter_name,
          healthScore: Math.round(healthScore),
          uptime,
          errorRate,
          avgResponseTime: avgLatency,
          fillRate,
          revenueShare: parseFloat(row.revenue_share),
          status,
          lastIssue: row.last_issue || undefined,
          issuesLast24h: parseInt(row.issues_last_24h),
        };
      });
    } catch (error) {
      logger.error('Failed to get adapter health scores', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get fraud detection metrics
   */
  async getFraudMetrics(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<FraudMetrics> {
    try {
      const query = `
        SELECT
          count(*) as total_requests,
          countIf(blocked = 1) as fraud_requests,
          countIf(blocked = 1) / count(*) * 100 as fraud_rate,
          countIf(fraud_type = 'givt') as givt_detections,
          countIf(fraud_type = 'sivt') as sivt_detections,
          countIf(fraud_type = 'ml_fraud') as ml_detections,
          countIf(fraud_type = 'anomaly') as anomaly_detections,
          sum(revenue_blocked_cents) / 100.0 as blocked_revenue
        FROM fraud_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
      `;

      const result = await executeQuery<{
        total_requests: string;
        fraud_requests: string;
        fraud_rate: string;
        givt_detections: string;
        sivt_detections: string;
        ml_detections: string;
        anomaly_detections: string;
        blocked_revenue: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      // Get top fraud types
      const typesQuery = `
        SELECT
          detection_method,
          count(*) as count
        FROM fraud_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND blocked = 1
        GROUP BY detection_method
        ORDER BY count DESC
        LIMIT 10
      `;

      const typesResult = await executeQuery<{
        detection_method: string;
        count: string;
      }>(typesQuery, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (result.length === 0) {
        return {
          totalRequests: 0,
          fraudRequests: 0,
          fraudRate: 0,
          givtDetections: 0,
          sivtDetections: 0,
          mlDetections: 0,
          anomalyDetections: 0,
          blockedRevenue: 0,
          topFraudTypes: [],
        };
      }

      const row = result[0];
      return {
        totalRequests: parseInt(row.total_requests),
        fraudRequests: parseInt(row.fraud_requests),
        fraudRate: parseFloat(row.fraud_rate),
        givtDetections: parseInt(row.givt_detections),
        sivtDetections: parseInt(row.sivt_detections),
        mlDetections: parseInt(row.ml_detections),
        anomalyDetections: parseInt(row.anomaly_detections),
        blockedRevenue: parseFloat(row.blocked_revenue),
        topFraudTypes: typesResult.map(t => ({
          type: t.detection_method,
          count: parseInt(t.count),
        })),
      };
    } catch (error) {
      logger.error('Failed to get fraud metrics', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get quality metrics (viewability, completion, brand safety)
   */
  async getQualityMetrics(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<QualityMetrics> {
    try {
      const query = `
        WITH impression_quality AS (
          SELECT
            countIf(viewable = 1) / count(*) * 100 as viewability_rate,
            countIf(completed = 1) / countIf(ad_format = 'video') * 100 as completion_rate,
            countIf(clicked = 1) / count(*) * 100 as ctr,
            countIf(invalid_traffic = 1) / count(*) * 100 as ivt_rate
          FROM impressions
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {startDate:DateTime}
            AND timestamp < {endDate:DateTime}
        ),
        quality_scores AS (
          SELECT
            avg(brand_safety_score) as brand_safety,
            avg(user_experience_score) as user_experience
          FROM quality_events
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {startDate:DateTime}
            AND timestamp < {endDate:DateTime}
        ),
        sdk_health AS (
          SELECT
            countIf(event_type = 'anr') / count(DISTINCT session_id) * 100 as anr_rate,
            countIf(event_type = 'crash') / count(DISTINCT session_id) * 100 as crash_rate
          FROM sdk_telemetry
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {startDate:DateTime}
            AND timestamp < {endDate:DateTime}
        )
        SELECT
          i.viewability_rate,
          i.completion_rate,
          i.ctr,
          i.ivt_rate,
          COALESCE(q.brand_safety, 100) as brand_safety,
          COALESCE(q.user_experience, 100) as user_experience,
          COALESCE(s.anr_rate, 0) as anr_rate,
          COALESCE(s.crash_rate, 0) as crash_rate
        FROM impression_quality i
        CROSS JOIN quality_scores q
        CROSS JOIN sdk_health s
      `;

      const result = await executeQuery<{
        viewability_rate: string;
        completion_rate: string;
        ctr: string;
        ivt_rate: string;
        brand_safety: string;
        user_experience: string;
        anr_rate: string;
        crash_rate: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (result.length === 0) {
        return {
          viewabilityRate: 0,
          completionRate: 0,
          clickThroughRate: 0,
          invalidTrafficRate: 0,
          brandSafetyScore: 100,
          userExperienceScore: 100,
          anrRate: 0,
          crashRate: 0,
        };
      }

      const row = result[0];
      return {
        viewabilityRate: parseFloat(row.viewability_rate),
        completionRate: parseFloat(row.completion_rate),
        clickThroughRate: parseFloat(row.ctr),
        invalidTrafficRate: parseFloat(row.ivt_rate),
        brandSafetyScore: parseFloat(row.brand_safety),
        userExperienceScore: parseFloat(row.user_experience),
        anrRate: parseFloat(row.anr_rate),
        crashRate: parseFloat(row.crash_rate),
      };
    } catch (error) {
      logger.error('Failed to get quality metrics', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get revenue projections using simple linear regression
   */
  async getRevenueProjections(
    publisherId: string,
    days: number = 7
  ): Promise<RevenueProjection[]> {
    try {
      // Get last 30 days of data for trend analysis
      const lookbackDays = 30;
      const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const query = `
        SELECT
          toDate(timestamp) as date,
          sum(revenue_usd) as revenue
        FROM revenue_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND is_test_mode = 0
        GROUP BY date
        ORDER BY date ASC
      `;

      const result = await executeQuery<{
        date: string;
        revenue: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (result.length < 7) {
        // Not enough data for projection
        return [];
      }

      // Simple linear regression
      const dataPoints = result.map((r, i) => ({
        x: i,
        y: parseFloat(r.revenue),
      }));

      const n = dataPoints.length;
      const sumX = dataPoints.reduce((acc, p) => acc + p.x, 0);
      const sumY = dataPoints.reduce((acc, p) => acc + p.y, 0);
      const sumXY = dataPoints.reduce((acc, p) => acc + p.x * p.y, 0);
      const sumXX = dataPoints.reduce((acc, p) => acc + p.x * p.x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Calculate standard error
      const predictions = dataPoints.map(p => slope * p.x + intercept);
      const residuals = dataPoints.map((p, i) => p.y - predictions[i]);
      const mse = residuals.reduce((acc, r) => acc + r * r, 0) / n;
      const stdError = Math.sqrt(mse);

      // Generate projections
      const projections: RevenueProjection[] = [];
      for (let i = 1; i <= days; i++) {
        const x = n + i;
        const projected = slope * x + intercept;
        const margin = 1.96 * stdError * Math.sqrt(1 + 1/n + Math.pow(x - sumX/n, 2) / (sumXX - sumX*sumX/n));

        const projectionDate = new Date(endDate);
        projectionDate.setDate(projectionDate.getDate() + i);

        projections.push({
          date: projectionDate.toISOString().split('T')[0],
          projectedRevenue: Math.max(0, projected),
          lowerBound: Math.max(0, projected - margin),
          upperBound: projected + margin,
          confidence: 0.95,
        });
      }

      return projections;
    } catch (error) {
      logger.error('Failed to get revenue projections', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get cohort analysis for user retention and LTV
   */
  async getCohortAnalysis(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CohortMetrics[]> {
    try {
      const query = `
        WITH user_installs AS (
          SELECT
            user_id,
            toDate(min(timestamp)) as install_date
          FROM user_events
          WHERE publisher_id = {publisherId:UUID}
            AND event_type = 'install'
            AND timestamp >= {startDate:DateTime}
            AND timestamp < {endDate:DateTime}
          GROUP BY user_id
        ),
        user_revenue AS (
          SELECT
            r.user_id,
            i.install_date,
            dateDiff('day', i.install_date, toDate(r.timestamp)) as days_since_install,
            sum(r.revenue_usd) as revenue
          FROM revenue_events r
          INNER JOIN user_installs i ON r.user_id = i.user_id
          WHERE r.publisher_id = {publisherId:UUID}
          GROUP BY r.user_id, i.install_date, days_since_install
        ),
        cohort_stats AS (
          SELECT
            install_date as cohort_date,
            count(DISTINCT user_id) as user_count,
            sumIf(revenue, days_since_install = 0) as day0_revenue,
            sumIf(revenue, days_since_install = 1) as day1_revenue,
            sumIf(revenue, days_since_install <= 7) as day7_revenue,
            sumIf(revenue, days_since_install <= 30) as day30_revenue,
            uniqIf(user_id, days_since_install >= 1) / count(DISTINCT user_id) * 100 as retention_day1,
            uniqIf(user_id, days_since_install >= 7) / count(DISTINCT user_id) * 100 as retention_day7,
            uniqIf(user_id, days_since_install >= 30) / count(DISTINCT user_id) * 100 as retention_day30
          FROM user_revenue
          GROUP BY install_date
        )
        SELECT
          cohort_date,
          user_count,
          day0_revenue,
          day1_revenue,
          day7_revenue,
          day30_revenue,
          day30_revenue / user_count as ltv,
          retention_day1,
          retention_day7,
          retention_day30,
          day30_revenue / user_count as arpu
        FROM cohort_stats
        WHERE user_count > 100  -- Only cohorts with significant sample size
        ORDER BY cohort_date DESC
      `;

      const result = await executeQuery<{
        cohort_date: string;
        user_count: string;
        day0_revenue: string;
        day1_revenue: string;
        day7_revenue: string;
        day30_revenue: string;
        ltv: string;
        retention_day1: string;
        retention_day7: string;
        retention_day30: string;
        arpu: string;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      return result.map(row => ({
        cohortDate: row.cohort_date,
        userCount: parseInt(row.user_count),
        day0Revenue: parseFloat(row.day0_revenue),
        day1Revenue: parseFloat(row.day1_revenue),
        day7Revenue: parseFloat(row.day7_revenue),
        day30Revenue: parseFloat(row.day30_revenue),
        ltv: parseFloat(row.ltv),
        retentionDay1: parseFloat(row.retention_day1),
        retentionDay7: parseFloat(row.retention_day7),
        retentionDay30: parseFloat(row.retention_day30),
        arpu: parseFloat(row.arpu),
      }));
    } catch (error) {
      logger.error('Failed to get cohort analysis', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get anomaly detection alerts using statistical methods
   */
  async getAnomalies(
    publisherId: string,
    hours: number = 24
  ): Promise<AnomalyAlert[]> {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const lookbackTime = new Date(Date.now() - (hours + 168) * 60 * 60 * 1000); // Additional 7 days for baseline

      // Get hourly metrics with statistical baseline
      const query = `
        WITH hourly_metrics AS (
          SELECT
            toStartOfHour(timestamp) as hour,
            sum(revenue_usd) as revenue,
            count(*) as requests,
            countIf(status = 'error') / count(*) * 100 as error_rate,
            avg(latency_ms) as avg_latency
          FROM impressions
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {lookbackTime:DateTime}
          GROUP BY hour
        ),
        baseline_stats AS (
          SELECT
            avg(revenue) as mean_revenue,
            stddevPop(revenue) as std_revenue,
            avg(requests) as mean_requests,
            stddevPop(requests) as std_requests,
            avg(error_rate) as mean_error_rate,
            stddevPop(error_rate) as std_error_rate,
            avg(avg_latency) as mean_latency,
            stddevPop(avg_latency) as std_latency
          FROM hourly_metrics
          WHERE hour < {startTime:DateTime}
        ),
        recent_metrics AS (
          SELECT
            hour,
            revenue,
            requests,
            error_rate,
            avg_latency
          FROM hourly_metrics
          WHERE hour >= {startTime:DateTime}
        )
        SELECT
          r.hour,
          r.revenue,
          r.requests,
          r.error_rate,
          r.avg_latency,
          b.mean_revenue,
          b.std_revenue,
          b.mean_requests,
          b.std_requests,
          b.mean_error_rate,
          b.std_error_rate,
          b.mean_latency,
          b.std_latency,
          abs(r.revenue - b.mean_revenue) / nullIf(b.std_revenue, 0) as revenue_z_score,
          abs(r.requests - b.mean_requests) / nullIf(b.std_requests, 0) as requests_z_score,
          abs(r.error_rate - b.mean_error_rate) / nullIf(b.std_error_rate, 0) as error_z_score,
          abs(r.avg_latency - b.mean_latency) / nullIf(b.std_latency, 0) as latency_z_score
        FROM recent_metrics r
        CROSS JOIN baseline_stats b
        WHERE revenue_z_score > 2.5 OR requests_z_score > 2.5 OR error_z_score > 3 OR latency_z_score > 3
        ORDER BY r.hour DESC
      `;

      const result = await executeQuery<{
        hour: string;
        revenue: string;
        requests: string;
        error_rate: string;
        avg_latency: string;
        mean_revenue: string;
        std_revenue: string;
        mean_requests: string;
        mean_error_rate: string;
        mean_latency: string;
        revenue_z_score: string;
        requests_z_score: string;
        error_z_score: string;
        latency_z_score: string;
      }>(query, {
        publisherId,
        startTime: startTime.toISOString(),
        lookbackTime: lookbackTime.toISOString(),
      });

      const anomalies: AnomalyAlert[] = [];

      result.forEach((row, index) => {
        const revenueZScore = parseFloat(row.revenue_z_score) || 0;
        const requestsZScore = parseFloat(row.requests_z_score) || 0;
        const errorZScore = parseFloat(row.error_z_score) || 0;
        const latencyZScore = parseFloat(row.latency_z_score) || 0;

        // Revenue anomaly
        if (revenueZScore > 2.5) {
          const currentRevenue = parseFloat(row.revenue);
          const expectedRevenue = parseFloat(row.mean_revenue);
          const deviation = ((currentRevenue - expectedRevenue) / expectedRevenue) * 100;

          anomalies.push({
            id: `revenue_${row.hour}_${index}`,
            timestamp: row.hour,
            type: deviation < 0 ? 'revenue_drop' : 'traffic_anomaly',
            severity: revenueZScore > 4 ? 'critical' : revenueZScore > 3 ? 'high' : 'medium',
            metric: 'revenue',
            currentValue: currentRevenue,
            expectedValue: expectedRevenue,
            deviation,
            description: `Revenue ${deviation > 0 ? 'spike' : 'drop'} of ${Math.abs(deviation).toFixed(1)}% (${revenueZScore.toFixed(2)} σ)`,
          });
        }

        // Traffic anomaly
        if (requestsZScore > 2.5) {
          const currentRequests = parseFloat(row.requests);
          const expectedRequests = parseFloat(row.mean_requests);
          const deviation = ((currentRequests - expectedRequests) / expectedRequests) * 100;

          anomalies.push({
            id: `traffic_${row.hour}_${index}`,
            timestamp: row.hour,
            type: 'traffic_anomaly',
            severity: requestsZScore > 4 ? 'critical' : requestsZScore > 3 ? 'high' : 'medium',
            metric: 'requests',
            currentValue: currentRequests,
            expectedValue: expectedRequests,
            deviation,
            description: `Traffic ${deviation > 0 ? 'surge' : 'drop'} of ${Math.abs(deviation).toFixed(1)}% (${requestsZScore.toFixed(2)} σ)`,
          });
        }

        // Error rate anomaly
        if (errorZScore > 3) {
          const currentErrorRate = parseFloat(row.error_rate);
          const expectedErrorRate = parseFloat(row.mean_error_rate);
          const deviation = currentErrorRate - expectedErrorRate;

          anomalies.push({
            id: `error_${row.hour}_${index}`,
            timestamp: row.hour,
            type: 'performance_degradation',
            severity: errorZScore > 5 ? 'critical' : errorZScore > 4 ? 'high' : 'medium',
            metric: 'error_rate',
            currentValue: currentErrorRate,
            expectedValue: expectedErrorRate,
            deviation,
            description: `Error rate spike: ${currentErrorRate.toFixed(2)}% vs expected ${expectedErrorRate.toFixed(2)}% (${errorZScore.toFixed(2)} σ)`,
          });
        }

        // Latency anomaly
        if (latencyZScore > 3) {
          const currentLatency = parseFloat(row.avg_latency);
          const expectedLatency = parseFloat(row.mean_latency);
          const deviation = ((currentLatency - expectedLatency) / expectedLatency) * 100;

          anomalies.push({
            id: `latency_${row.hour}_${index}`,
            timestamp: row.hour,
            type: 'performance_degradation',
            severity: latencyZScore > 5 ? 'critical' : latencyZScore > 4 ? 'high' : 'medium',
            metric: 'latency',
            currentValue: currentLatency,
            expectedValue: expectedLatency,
            deviation,
            description: `Latency spike: ${currentLatency.toFixed(0)}ms vs expected ${expectedLatency.toFixed(0)}ms (${latencyZScore.toFixed(2)} σ)`,
          });
        }
      });

      // Check for fraud spikes
      const fraudQuery = `
        SELECT
          toStartOfHour(timestamp) as hour,
          countIf(blocked = 1) as fraud_count,
          count(*) as total_count,
          countIf(blocked = 1) / count(*) * 100 as fraud_rate
        FROM fraud_events
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startTime:DateTime}
        GROUP BY hour
        HAVING fraud_rate > 5  -- Alert if fraud rate > 5%
        ORDER BY hour DESC
      `;

      const fraudResult = await executeQuery<{
        hour: string;
        fraud_count: string;
        total_count: string;
        fraud_rate: string;
      }>(fraudQuery, {
        publisherId,
        startTime: startTime.toISOString(),
      });

      fraudResult.forEach((row, index) => {
        const fraudRate = parseFloat(row.fraud_rate);
        anomalies.push({
          id: `fraud_${row.hour}_${index}`,
          timestamp: row.hour,
          type: 'fraud_spike',
          severity: fraudRate > 15 ? 'critical' : fraudRate > 10 ? 'high' : 'medium',
          metric: 'fraud_rate',
          currentValue: fraudRate,
          expectedValue: 2.0, // Baseline fraud rate
          deviation: fraudRate - 2.0,
          description: `Elevated fraud detection: ${fraudRate.toFixed(2)}% of traffic (${row.fraud_count} blocked requests)`,
        });
      });

      return anomalies;
    } catch (error) {
      logger.error('Failed to get anomalies', { publisherId, error });
      throw error;
    }
  }
}

export const reportingService = new ReportingServiceImpl();

export default reportingService;
