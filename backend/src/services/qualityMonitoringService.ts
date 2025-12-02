/**
 * Quality Monitoring Service
 * 
 * Real-time quality monitoring with viewability tracking, brand safety,
 * creative compliance, ANR detection, and SLO breach alerting
 */

import type { QueryResultRow } from 'pg';
import { query as pgQuery } from '../utils/postgres';
import logger from '../utils/logger';

const QUALITY_SLOW_QUERY_MS = parseInt(process.env.QUALITY_SLOW_QUERY_MS || '200', 10);
const QUALITY_CAPTURE_EXPLAIN = process.env.QUALITY_CAPTURE_EXPLAIN !== '0';

const runQuery = async <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: ReadonlyArray<unknown> = [],
  label?: string
): Promise<T[]> => {
  const queryLabel = label ?? 'QUALITY';
  const start = Date.now();
  const { rows } = await pgQuery<T>(sql, params, { replica: true, label: queryLabel });
  const durationMs = Date.now() - start;

  if (durationMs > QUALITY_SLOW_QUERY_MS) {
    logger.warn('Slow quality query detected', { label: queryLabel, durationMs });
    if (QUALITY_CAPTURE_EXPLAIN) {
      try {
        const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)\n${sql}`;
        const plan = await pgQuery<{ 'QUERY PLAN': unknown }>(explainSql, params, {
          replica: true,
          label: `${queryLabel}_EXPLAIN`,
        });
        logger.warn('Quality query plan', {
          label: queryLabel,
          durationMs,
          plan: plan.rows?.[0]?.['QUERY PLAN'] ?? plan.rows,
        });
      } catch (planError) {
        logger.error('Failed to capture quality query plan', {
          label: queryLabel,
          durationMs,
          error: (planError as Error).message,
        });
      }
    }
  }

  return rows;
};

export interface ViewabilityMetrics {
  totalImpressions: number;
  viewableImpressions: number;
  viewabilityRate: number;
  avgViewDuration: number;
  measurableRate: number;
  byFormat: Array<{
    format: string;
    viewabilityRate: number;
    impressions: number;
  }>;
}

export interface BrandSafetyReport {
  totalCreativeScans: number;
  passedScans: number;
  failedScans: number;
  blockedCategories: Array<{
    category: string;
    count: number;
  }>;
  riskScore: number; // 0-100, lower is better
  violations: Array<{
    creativeId: string;
    category: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: string;
  }>;
}

export interface CreativeComplianceReport {
  totalCreatives: number;
  compliantCreatives: number;
  complianceRate: number;
  violations: Array<{
    creativeId: string;
    violationType: string;
    details: string;
    status: 'flagged' | 'reviewed' | 'approved' | 'rejected';
  }>;
}

export interface ANRReport {
  totalSessions: number;
  anrCount: number;
  anrRate: number;
  crashCount: number;
  crashRate: number;
  anrsByAdapter: Array<{
    adapterId: string;
    adapterName: string;
    anrCount: number;
    rate: number;
  }>;
  topIssues: Array<{
    stackTrace: string;
    count: number;
    lastSeen: string;
  }>;
}

export interface SLOStatus {
  name: string;
  target: number;
  current: number;
  status: 'healthy' | 'at-risk' | 'breached';
  errorBudget: number;
  errorBudgetRemaining: number;
  breachTimestamp?: string;
}

export interface PerformanceSLOs {
  availability: SLOStatus;
  latency: SLOStatus;
  errorRate: SLOStatus;
  anrRate: SLOStatus;
  viewability: SLOStatus;
}

export interface QualityAlert {
  id: string;
  timestamp: string;
  alertType: 'slo_breach' | 'brand_safety' | 'anr_spike' | 'viewability_drop';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  metric: string;
  currentValue: number;
  threshold: number;
  affectedAdapters?: string[];
  recommendedAction: string;
}

export class QualityMonitoringService {
  /**
   * Get viewability metrics with format breakdown
   */
  async getViewabilityMetrics(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ViewabilityMetrics> {
    try {
      const overallSql = `
        SELECT
          COUNT(*) AS total_impressions,
          COUNT(*) FILTER (WHERE viewable) AS viewable_impressions,
          COALESCE(100.0 * COUNT(*) FILTER (WHERE viewable) / NULLIF(COUNT(*), 0), 0) AS viewability_rate,
          COALESCE(AVG(view_duration_ms) / 1000.0, 0) AS avg_view_duration,
          COALESCE(100.0 * COUNT(*) FILTER (WHERE measurable) / NULLIF(COUNT(*), 0), 0) AS measurable_rate
        FROM analytics_impressions
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
          AND is_test_mode = false
      `;

      const byFormatSql = `
        SELECT
          COALESCE(ad_format, 'unknown') AS ad_format,
          COALESCE(100.0 * COUNT(*) FILTER (WHERE viewable) / NULLIF(COUNT(*), 0), 0) AS viewability_rate,
          COUNT(*) AS impressions
        FROM analytics_impressions
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
          AND is_test_mode = false
        GROUP BY ad_format
        ORDER BY impressions DESC
      `;

      const [overallResult, formatResult] = await Promise.all([
        runQuery<{
          total_impressions: string;
          viewable_impressions: string;
          viewability_rate: string;
          avg_view_duration: string;
          measurable_rate: string;
        }>(overallSql, [publisherId, startDate, endDate]),
        runQuery<{
          ad_format: string;
          viewability_rate: string;
          impressions: string;
        }>(byFormatSql, [publisherId, startDate, endDate]),
      ]);

      if (overallResult.length === 0) {
        return {
          totalImpressions: 0,
          viewableImpressions: 0,
          viewabilityRate: 0,
          avgViewDuration: 0,
          measurableRate: 0,
          byFormat: [],
        };
      }

      const overall = overallResult[0];
      return {
        totalImpressions: parseInt(overall.total_impressions),
        viewableImpressions: parseInt(overall.viewable_impressions),
        viewabilityRate: parseFloat(overall.viewability_rate),
        avgViewDuration: parseFloat(overall.avg_view_duration),
        measurableRate: parseFloat(overall.measurable_rate),
        byFormat: formatResult.map(row => ({
          format: row.ad_format,
          viewabilityRate: parseFloat(row.viewability_rate),
          impressions: parseInt(row.impressions),
        })),
      };
    } catch (error) {
      logger.error('Failed to get viewability metrics', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get brand safety report with violations
   */
  async getBrandSafetyReport(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<BrandSafetyReport> {
    try {
      const summarySql = `
        SELECT
          COUNT(*) AS total_scans,
          COUNT(*) FILTER (WHERE passed) AS passed_scans,
          COUNT(*) FILTER (WHERE passed = false) AS failed_scans,
          COALESCE(AVG(risk_score), 0) AS avg_risk_score
        FROM analytics_creative_scans
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
      `;

      const categoriesSql = `
        SELECT
          COALESCE(blocked_category, 'unknown') AS blocked_category,
          COUNT(*) AS count
        FROM analytics_creative_scans
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
          AND passed = false
        GROUP BY blocked_category
        ORDER BY count DESC
        LIMIT 10
      `;

      const violationsSql = `
        SELECT
          creative_id,
          COALESCE(blocked_category, 'unknown') AS blocked_category,
          COALESCE(metadata->>'severity', 'medium') AS severity,
          observed_at
        FROM analytics_creative_scans
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
          AND passed = false
        ORDER BY observed_at DESC
        LIMIT 50
      `;

      const [summaryResult, categoriesResult, violationsResult] = await Promise.all([
        runQuery<{
          total_scans: string;
          passed_scans: string;
          failed_scans: string;
          avg_risk_score: string;
        }>(summarySql, [publisherId, startDate, endDate]),
        runQuery<{
          blocked_category: string;
          count: string;
        }>(categoriesSql, [publisherId, startDate, endDate]),
        runQuery<{
          creative_id: string;
          blocked_category: string;
          severity: string | null;
          observed_at: Date;
        }>(violationsSql, [publisherId, startDate, endDate]),
      ]);

      if (summaryResult.length === 0) {
        return {
          totalCreativeScans: 0,
          passedScans: 0,
          failedScans: 0,
          blockedCategories: [],
          riskScore: 0,
          violations: [],
        };
      }

      const summary = summaryResult[0];
      return {
        totalCreativeScans: parseInt(summary.total_scans),
        passedScans: parseInt(summary.passed_scans),
        failedScans: parseInt(summary.failed_scans),
        blockedCategories: categoriesResult.map(row => ({
          category: row.blocked_category,
          count: parseInt(row.count),
        })),
        riskScore: parseFloat(summary.avg_risk_score),
        violations: violationsResult.map(row => ({
          creativeId: row.creative_id,
          category: row.blocked_category,
          severity: (row.severity ?? 'medium') as 'low' | 'medium' | 'high',
          timestamp: row.observed_at instanceof Date
            ? row.observed_at.toISOString()
            : String(row.observed_at ?? ''),
        })),
      };
    } catch (error) {
      logger.error('Failed to get brand safety report', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get creative compliance report
   */
  async getCreativeComplianceReport(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CreativeComplianceReport> {
    try {
      const summarySql = `
        WITH creative_checks AS (
          SELECT
            creative_id,
            observed_at,
            COALESCE(TRIM(BOTH ', ' FROM CONCAT_WS(', ',
              CASE WHEN NOT file_size_ok THEN 'File size exceeded' END,
              CASE WHEN NOT dimensions_ok THEN 'Invalid dimensions' END,
              CASE WHEN NOT format_ok THEN 'Unsupported format' END,
              CASE WHEN NOT content_policy_ok THEN 'Content policy violation' END
            )), '') AS violations,
            CASE
              WHEN status = 'approved' THEN 'approved'
              WHEN status = 'rejected' THEN 'rejected'
              WHEN status = 'reviewed' THEN 'reviewed'
              ELSE 'flagged'
            END AS status
          FROM analytics_creative_compliance
          WHERE publisher_id = $1
            AND observed_at >= $2
            AND observed_at < $3
        )
        SELECT
          COUNT(DISTINCT creative_id) AS total_creatives,
          COUNT(*) FILTER (WHERE violations = '') AS compliant_creatives,
          COALESCE(100.0 * COUNT(*) FILTER (WHERE violations = '') / NULLIF(COUNT(*), 0), 0) AS compliance_rate
        FROM creative_checks
      `;

      const violationsSql = `
        WITH creative_checks AS (
          SELECT
            creative_id,
            observed_at,
            COALESCE(TRIM(BOTH ', ' FROM CONCAT_WS(', ',
              CASE WHEN NOT file_size_ok THEN 'File size exceeded' END,
              CASE WHEN NOT dimensions_ok THEN 'Invalid dimensions' END,
              CASE WHEN NOT format_ok THEN 'Unsupported format' END,
              CASE WHEN NOT content_policy_ok THEN 'Content policy violation' END
            )), '') AS violations,
            CASE
              WHEN status = 'approved' THEN 'approved'
              WHEN status = 'rejected' THEN 'rejected'
              WHEN status = 'reviewed' THEN 'reviewed'
              ELSE 'flagged'
            END AS status
          FROM analytics_creative_compliance
          WHERE publisher_id = $1
            AND observed_at >= $2
            AND observed_at < $3
        )
        SELECT creative_id, violations, status
        FROM creative_checks
        WHERE violations <> ''
        ORDER BY observed_at DESC
        LIMIT 100
      `;

      const [summaryResult, violationsResult] = await Promise.all([
        runQuery<{
          total_creatives: string;
          compliant_creatives: string;
          compliance_rate: string;
        }>(summarySql, [publisherId, startDate, endDate]),
        runQuery<{
          creative_id: string;
          violations: string;
          status: string;
        }>(violationsSql, [publisherId, startDate, endDate]),
      ]);

      if (summaryResult.length === 0) {
        return {
          totalCreatives: 0,
          compliantCreatives: 0,
          complianceRate: 100,
          violations: [],
        };
      }

      const summary = summaryResult[0];
      const violations = violationsResult.map(row => ({
        creativeId: row.creative_id,
        violationType: row.violations,
        details: row.violations,
        status: row.status as 'flagged' | 'reviewed' | 'approved' | 'rejected',
      }));

      return {
        totalCreatives: parseInt(summary.total_creatives),
        compliantCreatives: parseInt(summary.compliant_creatives),
        complianceRate: parseFloat(summary.compliance_rate),
        violations,
      };
    } catch (error) {
      logger.error('Failed to get creative compliance report', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get ANR (Application Not Responding) and crash report
   */
  async getANRReport(
    publisherId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ANRReport> {
    try {
      const overallSql = `
        SELECT
          COUNT(DISTINCT payload->>'session_id') AS total_sessions,
          COUNT(*) FILTER (WHERE event_type = 'anr') AS anr_count,
          COALESCE(100.0 * COUNT(*) FILTER (WHERE event_type = 'anr') / NULLIF(COUNT(DISTINCT payload->>'session_id'), 0), 0) AS anr_rate,
          COUNT(*) FILTER (WHERE event_type = 'crash') AS crash_count,
          COALESCE(100.0 * COUNT(*) FILTER (WHERE event_type = 'crash') / NULLIF(COUNT(DISTINCT payload->>'session_id'), 0), 0) AS crash_rate
        FROM analytics_sdk_telemetry
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
      `;

      const byAdapterSql = `
        SELECT
          COALESCE(adapter_id, payload->>'adapter_id', 'unknown') AS adapter_id,
          COALESCE(payload->>'adapter_name', adapter_id, 'unknown') AS adapter_name,
          COUNT(*) AS anr_count,
          COALESCE(100.0 * COUNT(*) / NULLIF(COUNT(DISTINCT payload->>'session_id'), 0), 0) AS rate
        FROM analytics_sdk_telemetry
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
          AND event_type = 'anr'
        GROUP BY
          COALESCE(adapter_id, payload->>'adapter_id', 'unknown'),
          COALESCE(payload->>'adapter_name', adapter_id, 'unknown')
        HAVING COUNT(*) > 0
        ORDER BY anr_count DESC
      `;

      const topIssuesSql = `
        SELECT
          COALESCE(payload->>'stack_trace', error_message, message, '') AS stack_trace,
          COUNT(*) AS count,
          MAX(observed_at) AS last_seen
        FROM analytics_sdk_telemetry
        WHERE publisher_id = $1
          AND observed_at >= $2
          AND observed_at < $3
          AND event_type = 'anr'
          AND COALESCE(payload->>'stack_trace', error_message, message, '') <> ''
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 20
      `;

      const [overallResult, byAdapterResult, topIssuesResult] = await Promise.all([
        runQuery<{
          total_sessions: string;
          anr_count: string;
          anr_rate: string;
          crash_count: string;
          crash_rate: string;
        }>(overallSql, [publisherId, startDate, endDate]),
        runQuery<{
          adapter_id: string | null;
          adapter_name: string | null;
          anr_count: string;
          rate: string;
        }>(byAdapterSql, [publisherId, startDate, endDate]),
        runQuery<{
          stack_trace: string;
          count: string;
          last_seen: Date;
        }>(topIssuesSql, [publisherId, startDate, endDate]),
      ]);

      if (overallResult.length === 0) {
        return {
          totalSessions: 0,
          anrCount: 0,
          anrRate: 0,
          crashCount: 0,
          crashRate: 0,
          anrsByAdapter: [],
          topIssues: [],
        };
      }

      const overall = overallResult[0];
      return {
        totalSessions: parseInt(overall.total_sessions),
        anrCount: parseInt(overall.anr_count),
        anrRate: parseFloat(overall.anr_rate),
        crashCount: parseInt(overall.crash_count),
        crashRate: parseFloat(overall.crash_rate),
        anrsByAdapter: byAdapterResult.map(row => ({
          adapterId: row.adapter_id ?? 'unknown',
          adapterName: row.adapter_name ?? row.adapter_id ?? 'unknown',
          anrCount: parseInt(row.anr_count),
          rate: parseFloat(row.rate),
        })),
        topIssues: topIssuesResult.map(row => {
          const stackTrace = row.stack_trace ?? '';
          return {
            stackTrace: stackTrace.substring(0, 200),
            count: parseInt(row.count),
            lastSeen: row.last_seen instanceof Date ? row.last_seen.toISOString() : String(row.last_seen),
          };
        }),
      };
    } catch (error) {
      logger.error('Failed to get ANR report', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get SLO (Service Level Objective) status with error budgets
   */
  async getPerformanceSLOs(
    publisherId: string,
    hours: number = 24
  ): Promise<PerformanceSLOs> {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const endTime = new Date();

      const sql = `
        WITH impression_metrics AS (
          SELECT
            COUNT(*) AS total_requests,
            COUNT(*) FILTER (WHERE status = 'success' OR filled IS TRUE) AS successful_requests,
            COUNT(*) FILTER (WHERE status = 'error') AS error_requests,
            COUNT(*) FILTER (WHERE latency_ms IS NOT NULL AND latency_ms <= 800) AS fast_requests,
            COALESCE(100.0 * COUNT(*) FILTER (WHERE viewable) / NULLIF(COUNT(*), 0), 0) AS viewability
          FROM analytics_impressions
          WHERE publisher_id = $1
            AND observed_at >= $2
            AND observed_at < $3
        ),
        sdk_metrics AS (
          SELECT
            COUNT(DISTINCT payload->>'session_id') AS sessions,
            COUNT(*) FILTER (WHERE event_type = 'anr') AS anrs
          FROM analytics_sdk_telemetry
          WHERE publisher_id = $1
            AND observed_at >= $2
            AND observed_at < $3
        )
        SELECT
          COALESCE(100.0 * successful_requests / NULLIF(total_requests, 0), 0) AS availability,
          COALESCE(100.0 * fast_requests / NULLIF(total_requests, 0), 0) AS latency_slo,
          COALESCE(100.0 * error_requests / NULLIF(total_requests, 0), 0) AS error_rate,
          COALESCE(100.0 * anrs / NULLIF(sessions, 0), 0) AS anr_rate,
          COALESCE(viewability, 0) AS viewability
        FROM impression_metrics, sdk_metrics
      `;

      const result = await runQuery<{
        availability: string;
        latency_slo: string;
        error_rate: string;
        anr_rate: string;
        viewability: string;
      }>(sql, [publisherId, startTime, endTime]);

      if (result.length === 0) {
        // Default SLOs when no data
        return {
          availability: this.createSLOStatus('Availability', 99.9, 100),
          latency: this.createSLOStatus('Latency P95 < 800ms', 95.0, 100),
          errorRate: this.createSLOStatus('Error Rate < 1%', 1.0, 0),
          anrRate: this.createSLOStatus('ANR Rate < 0.02%', 0.02, 0),
          viewability: this.createSLOStatus('Viewability > 60%', 60.0, 100),
        };
      }

      const metrics = result[0];
      return {
        availability: this.createSLOStatus(
          'Availability',
          99.9,
          parseFloat(metrics.availability)
        ),
        latency: this.createSLOStatus(
          'Latency P95 < 800ms',
          95.0,
          parseFloat(metrics.latency_slo)
        ),
        errorRate: this.createSLOStatus(
          'Error Rate < 1%',
          1.0,
          parseFloat(metrics.error_rate),
          true // Inverse (lower is better)
        ),
        anrRate: this.createSLOStatus(
          'ANR Rate < 0.02%',
          0.02,
          parseFloat(metrics.anr_rate),
          true // Inverse
        ),
        viewability: this.createSLOStatus(
          'Viewability > 60%',
          60.0,
          parseFloat(metrics.viewability)
        ),
      };
    } catch (error) {
      logger.error('Failed to get performance SLOs', { publisherId, error });
      throw error;
    }
  }

  /**
   * Get quality alerts requiring attention
   */
  async getQualityAlerts(
    publisherId: string,
    hours: number = 24
  ): Promise<QualityAlert[]> {
    const alerts: QualityAlert[] = [];
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const endTime = new Date();

    try {
      // Check SLO breaches
      const slos = await this.getPerformanceSLOs(publisherId, hours);
      
      Object.entries(slos).forEach(([key, slo]) => {
        if (slo.status === 'breached') {
          alerts.push({
            id: `slo_breach_${key}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            alertType: 'slo_breach',
            severity: 'critical',
            title: `SLO Breach: ${slo.name}`,
            description: `${slo.name} has breached the target of ${slo.target}% (current: ${slo.current.toFixed(2)}%)`,
            metric: key,
            currentValue: slo.current,
            threshold: slo.target,
            recommendedAction: this.getRecommendedAction(key, slo),
          });
        } else if (slo.status === 'at-risk' && slo.errorBudgetRemaining < 20) {
          alerts.push({
            id: `slo_at_risk_${key}_${Date.now()}`,
            timestamp: new Date().toISOString(),
            alertType: 'slo_breach',
            severity: 'high',
            title: `SLO At Risk: ${slo.name}`,
            description: `${slo.name} error budget critically low: ${slo.errorBudgetRemaining.toFixed(1)}% remaining`,
            metric: key,
            currentValue: slo.current,
            threshold: slo.target,
            recommendedAction: 'Monitor closely and prepare incident response',
          });
        }
      });

      // Check ANR spikes
      const anrReport = await this.getANRReport(publisherId, startTime, endTime);
      if (anrReport.anrRate > 0.02) {
        const affectedAdapters = anrReport.anrsByAdapter
          .filter(a => a.rate > 0.02)
          .map(a => a.adapterName);

        alerts.push({
          id: `anr_spike_${Date.now()}`,
          timestamp: new Date().toISOString(),
          alertType: 'anr_spike',
          severity: anrReport.anrRate > 0.05 ? 'critical' : 'high',
          title: 'ANR Rate Elevated',
          description: `ANR rate is ${anrReport.anrRate.toFixed(3)}% (target: <0.02%)`,
          metric: 'anr_rate',
          currentValue: anrReport.anrRate,
          threshold: 0.02,
          affectedAdapters,
          recommendedAction: affectedAdapters.length > 0
            ? `Investigate adapters: ${affectedAdapters.join(', ')}`
            : 'Review SDK integration and background thread usage',
        });
      }

      // Check viewability drops
      const viewability = await this.getViewabilityMetrics(publisherId, startTime, endTime);
      if (viewability.viewabilityRate < 50) {
        alerts.push({
          id: `viewability_drop_${Date.now()}`,
          timestamp: new Date().toISOString(),
          alertType: 'viewability_drop',
          severity: viewability.viewabilityRate < 40 ? 'high' : 'medium',
          title: 'Low Viewability Rate',
          description: `Viewability is ${viewability.viewabilityRate.toFixed(1)}% (target: >60%)`,
          metric: 'viewability_rate',
          currentValue: viewability.viewabilityRate,
          threshold: 60,
          recommendedAction: 'Review ad placement positions and format settings',
        });
      }

      // Check brand safety violations
      const brandSafety = await this.getBrandSafetyReport(publisherId, startTime, endTime);
      const violationRate = (brandSafety.failedScans / brandSafety.totalCreativeScans) * 100;
      if (violationRate > 5) {
        alerts.push({
          id: `brand_safety_${Date.now()}`,
          timestamp: new Date().toISOString(),
          alertType: 'brand_safety',
          severity: violationRate > 10 ? 'high' : 'medium',
          title: 'Brand Safety Violations',
          description: `${violationRate.toFixed(1)}% of creatives failed brand safety scan`,
          metric: 'brand_safety_violation_rate',
          currentValue: violationRate,
          threshold: 5,
          recommendedAction: 'Review and block problematic demand sources',
        });
      }

      return alerts.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
    } catch (error) {
      logger.error('Failed to get quality alerts', { publisherId, error });
      throw error;
    }
  }

  /**
   * Create SLO status object with error budget calculation
   */
  private createSLOStatus(
    name: string,
    target: number,
    current: number,
    inverse: boolean = false
  ): SLOStatus {
    const isHealthy = inverse ? current <= target : current >= target;

    // Calculate error budget (percentage of allowed failures)
    const errorBudget = Math.max(0, 100 - target);
    const actualError = inverse ? current : Math.max(0, 100 - current);

    // Guard against divide-by-zero when target is 100 (no error budget)
    const errorBudgetUsed = errorBudget > 0 ? (actualError / errorBudget) * 100 : 0;
    const errorBudgetRemaining = errorBudget > 0 ? Math.max(0, 100 - errorBudgetUsed) : 100;

    let status: 'healthy' | 'at-risk' | 'breached';
    if (!isHealthy) {
      status = 'breached';
    } else if (errorBudgetRemaining < 20) {
      status = 'at-risk';
    } else {
      status = 'healthy';
    }

    return {
      name,
      target,
      current,
      status,
      errorBudget,
      errorBudgetRemaining,
      breachTimestamp: !isHealthy ? new Date().toISOString() : undefined,
    };
  }

  /**
   * Get recommended action for SLO breach
   */
  private getRecommendedAction(metric: string, _slo: SLOStatus): string {
    const actions: Record<string, string> = {
      availability: 'Check adapter health and enable waterfall fallback',
      latency: 'Review adapter timeouts and enable circuit breakers',
      errorRate: 'Investigate error logs and disable failing adapters',
      anrRate: 'Review background thread usage and reduce SDK operations',
      viewability: 'Optimize ad placement positions and formats',
    };

    return actions[metric] || 'Investigate metric and take corrective action';
  }
}

export const qualityMonitoringService = new QualityMonitoringService();

export default qualityMonitoringService;
