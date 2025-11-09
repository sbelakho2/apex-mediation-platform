/**
 * Quality Monitoring Service
 * 
 * Real-time quality monitoring with viewability tracking, brand safety,
 * creative compliance, ANR detection, and SLO breach alerting
 */

import { executeQuery } from '../utils/clickhouse';
import logger from '../utils/logger';

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
      const overallQuery = `
        SELECT
          count(*) as total_impressions,
          countIf(viewable = 1) as viewable_impressions,
          countIf(viewable = 1) / count(*) * 100 as viewability_rate,
          avg(view_duration_ms) / 1000.0 as avg_view_duration,
          countIf(measurable = 1) / count(*) * 100 as measurable_rate
        FROM impressions
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND is_test_mode = 0
      `;

      const byFormatQuery = `
        SELECT
          ad_format,
          countIf(viewable = 1) / count(*) * 100 as viewability_rate,
          count(*) as impressions
        FROM impressions
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND is_test_mode = 0
        GROUP BY ad_format
        ORDER BY impressions DESC
      `;

      const [overallResult, formatResult] = await Promise.all([
        executeQuery<{
          total_impressions: string;
          viewable_impressions: string;
          viewability_rate: string;
          avg_view_duration: string;
          measurable_rate: string;
        }>(overallQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        executeQuery<{
          ad_format: string;
          viewability_rate: string;
          impressions: string;
        }>(byFormatQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
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
      const summaryQuery = `
        SELECT
          count(*) as total_scans,
          countIf(passed = 1) as passed_scans,
          countIf(passed = 0) as failed_scans,
          avg(risk_score) as avg_risk_score
        FROM creative_scans
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
      `;

      const categoriesQuery = `
        SELECT
          blocked_category,
          count(*) as count
        FROM creative_scans
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND passed = 0
        GROUP BY blocked_category
        ORDER BY count DESC
        LIMIT 10
      `;

      const violationsQuery = `
        SELECT
          creative_id,
          blocked_category,
          severity,
          timestamp
        FROM creative_scans
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND passed = 0
        ORDER BY timestamp DESC
        LIMIT 50
      `;

      const [summaryResult, categoriesResult, violationsResult] = await Promise.all([
        executeQuery<{
          total_scans: string;
          passed_scans: string;
          failed_scans: string;
          avg_risk_score: string;
        }>(summaryQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        executeQuery<{
          blocked_category: string;
          count: string;
        }>(categoriesQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        executeQuery<{
          creative_id: string;
          blocked_category: string;
          severity: 'low' | 'medium' | 'high';
          timestamp: string;
        }>(violationsQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
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
          severity: row.severity,
          timestamp: row.timestamp,
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
      const query = `
        WITH creative_checks AS (
          SELECT
            creative_id,
            arrayStringConcat(
              arrayFilter(x -> x != '', [
                if(file_size_ok = 0, 'File size exceeded', ''),
                if(dimensions_ok = 0, 'Invalid dimensions', ''),
                if(format_ok = 0, 'Unsupported format', ''),
                if(content_policy_ok = 0, 'Content policy violation', '')
              ]),
              ', '
            ) as violations,
            multiIf(
              status = 'approved', 'approved',
              status = 'rejected', 'rejected',
              status = 'reviewed', 'reviewed',
              'flagged'
            ) as status
          FROM creative_compliance
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {startDate:DateTime}
            AND timestamp < {endDate:DateTime}
        )
        SELECT
          count(DISTINCT creative_id) as total_creatives,
          countIf(violations = '') as compliant_creatives,
          countIf(violations = '') / count(*) * 100 as compliance_rate,
          groupArray((creative_id, violations, status)) as violations_list
        FROM creative_checks
      `;

      const result = await executeQuery<{
        total_creatives: string;
        compliant_creatives: string;
        compliance_rate: string;
        violations_list: Array<[string, string, string]>;
      }>(query, {
        publisherId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      if (result.length === 0) {
        return {
          totalCreatives: 0,
          compliantCreatives: 0,
          complianceRate: 100,
          violations: [],
        };
      }

      const row = result[0];
      const violations = (row.violations_list || [])
        .filter(([, violationType]) => violationType !== '')
        .map(([creativeId, violationType, status]) => ({
          creativeId,
          violationType,
          details: violationType,
          status: status as 'flagged' | 'reviewed' | 'approved' | 'rejected',
        }))
        .slice(0, 100); // Limit to 100 most recent

      return {
        totalCreatives: parseInt(row.total_creatives),
        compliantCreatives: parseInt(row.compliant_creatives),
        complianceRate: parseFloat(row.compliance_rate),
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
      const overallQuery = `
        SELECT
          count(DISTINCT session_id) as total_sessions,
          countIf(event_type = 'anr') as anr_count,
          countIf(event_type = 'anr') / count(DISTINCT session_id) * 100 as anr_rate,
          countIf(event_type = 'crash') as crash_count,
          countIf(event_type = 'crash') / count(DISTINCT session_id) * 100 as crash_rate
        FROM sdk_telemetry
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
      `;

      const byAdapterQuery = `
        SELECT
          adapter_id,
          adapter_name,
          countIf(event_type = 'anr') as anr_count,
          countIf(event_type = 'anr') / count(DISTINCT session_id) * 100 as rate
        FROM sdk_telemetry
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND event_type = 'anr'
        GROUP BY adapter_id, adapter_name
        HAVING anr_count > 0
        ORDER BY anr_count DESC
      `;

      const topIssuesQuery = `
        SELECT
          stack_trace,
          count(*) as count,
          max(timestamp) as last_seen
        FROM sdk_telemetry
        WHERE publisher_id = {publisherId:UUID}
          AND timestamp >= {startDate:DateTime}
          AND timestamp < {endDate:DateTime}
          AND event_type = 'anr'
          AND stack_trace != ''
        GROUP BY stack_trace
        ORDER BY count DESC
        LIMIT 20
      `;

      const [overallResult, byAdapterResult, topIssuesResult] = await Promise.all([
        executeQuery<{
          total_sessions: string;
          anr_count: string;
          anr_rate: string;
          crash_count: string;
          crash_rate: string;
        }>(overallQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        executeQuery<{
          adapter_id: string;
          adapter_name: string;
          anr_count: string;
          rate: string;
        }>(byAdapterQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
        executeQuery<{
          stack_trace: string;
          count: string;
          last_seen: string;
        }>(topIssuesQuery, {
          publisherId,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
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
          adapterId: row.adapter_id,
          adapterName: row.adapter_name,
          anrCount: parseInt(row.anr_count),
          rate: parseFloat(row.rate),
        })),
        topIssues: topIssuesResult.map(row => ({
          stackTrace: row.stack_trace.substring(0, 200), // Truncate long stack traces
          count: parseInt(row.count),
          lastSeen: row.last_seen,
        })),
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
      
      const query = `
        WITH metrics AS (
          SELECT
            count(*) as total_requests,
            countIf(status = 'success') as successful_requests,
            countIf(status = 'error') as error_requests,
            countIf(latency_ms <= 800) as fast_requests,
            countIf(viewable = 1) / count(*) * 100 as viewability
          FROM impressions
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {startTime:DateTime}
        ),
        sdk_metrics AS (
          SELECT
            count(DISTINCT session_id) as sessions,
            countIf(event_type = 'anr') as anrs
          FROM sdk_telemetry
          WHERE publisher_id = {publisherId:UUID}
            AND timestamp >= {startTime:DateTime}
        )
        SELECT
          m.successful_requests / m.total_requests * 100 as availability,
          m.fast_requests / m.total_requests * 100 as latency_slo,
          m.error_requests / m.total_requests * 100 as error_rate,
          s.anrs / s.sessions * 100 as anr_rate,
          m.viewability
        FROM metrics m
        CROSS JOIN sdk_metrics s
      `;

      const result = await executeQuery<{
        availability: string;
        latency_slo: string;
        error_rate: string;
        anr_rate: string;
        viewability: string;
      }>(query, {
        publisherId,
        startTime: startTime.toISOString(),
      });

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
    const isHealthy = inverse
      ? current <= target
      : current >= target;
    
    // Calculate error budget (percentage of allowed failures)
    const errorBudget = 100 - target;
    const actualError = inverse ? current : 100 - current;
    const errorBudgetUsed = (actualError / errorBudget) * 100;
    const errorBudgetRemaining = Math.max(0, 100 - errorBudgetUsed);

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
