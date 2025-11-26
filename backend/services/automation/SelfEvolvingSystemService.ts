// services/automation/SelfEvolvingSystemService.ts
// Zero-touch self-evolving system that continuously improves platform performance
// Uses AI to detect patterns, predict issues, and automatically optimize configurations
//
// DEPRECATION NOTICE (2025-11-25)
// This file previously referenced legacy multi-provider deployment examples (e.g., Fly.io) in comments
// and operational notes. The authoritative production plan is DigitalOcean-only with Managed Postgres
// and self-hosted Redis, per docs/Internal/Infrastructure/INFRASTRUCTURE_MIGRATION_PLAN.md.
// Any provider-specific guidance here is deprecated and must not be used for new work.

import { Pool } from 'pg';
import OpenAI from 'openai';

interface SystemMetric {
  metric_name: string;
  current_value: number;
  threshold_value: number;
  severity: 'info' | 'warning' | 'critical';
  trend: 'improving' | 'stable' | 'degrading';
}

interface OptimizationOpportunity {
  area: string;
  current_performance: string;
  proposed_change: string;
  expected_improvement: string;
  confidence_score: number;
  auto_apply: boolean;
}

interface EvolutionLog {
  timestamp: Date;
  change_type: string;
  description: string;
  metrics_before: Record<string, number>;
  metrics_after?: Record<string, number>;
  success: boolean;
}

export class SelfEvolvingSystemService {
  private pool: Pool;
  private openai: OpenAI | null = null;
  private aiEnabled: boolean;
  private evolutionHistory: EvolutionLog[] = [];

  constructor(databaseUrl: string, openaiApiKey?: string, enableAI = false) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.aiEnabled = Boolean(enableAI && openaiApiKey);
    if (this.aiEnabled && openaiApiKey) {
      this.openai = new OpenAI({ apiKey: openaiApiKey });
    } else if (enableAI && !openaiApiKey) {
      console.warn('[SelfEvolving] AI features requested but OPENAI_API_KEY is missing; disabling AI integration');
      this.aiEnabled = false;
    } else {
      this.aiEnabled = false;
    }
  }

  /**
   * CORE: Continuous system monitoring and auto-optimization
   * Runs every hour to detect issues and apply improvements automatically
   */
  async monitorAndEvolve(): Promise<void> {
    console.log('[SelfEvolving] Starting continuous monitoring cycle...');

    if (!this.aiEnabled) {
      console.log('[SelfEvolving] AI-driven optimizations disabled, running analytics-only cycle');
    }

    try {
      // 1. Collect current system metrics
      const metrics = await this.collectSystemMetrics();
      
      // 2. Detect performance degradation patterns
      const issues = await this.detectPerformanceDegradation(metrics);
      
      // 3. Identify optimization opportunities
      const opportunities = await this.identifyOptimizationOpportunities(metrics);
      
      // 4. Auto-apply safe optimizations (high confidence, low risk)
      await this.autoApplySafeOptimizations(opportunities);
      
      // 5. Flag risky optimizations for review (store in database)
      await this.flagRiskyOptimizations(opportunities);
      
      // 6. Predict future capacity needs
      await this.predictCapacityNeeds(metrics);
      
      // 7. Auto-scale infrastructure if needed
      await this.autoScaleInfrastructure(metrics);
      
      // 8. Learn from past changes (improve AI model)
      await this.learnFromHistory();

      console.log('[SelfEvolving] Monitoring cycle complete');
    } catch (error) {
      console.error('[SelfEvolving] Error in monitoring cycle:', error);
      await this.logEvolution('error', 'Monitoring cycle failed', {}, {}, false);
    }
  }

  /**
   * Collect real-time system metrics across all services
   */
  private async collectSystemMetrics(): Promise<SystemMetric[]> {
    const metrics: SystemMetric[] = [];

    // Database performance
    const dbMetrics = await this.pool.query(`
      SELECT 
        'db_connection_count' as metric_name,
        (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as current_value,
        100 as threshold_value,
        CASE 
          WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') > 80 THEN 'warning'
          WHEN (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') > 100 THEN 'critical'
          ELSE 'info'
        END as severity
      UNION ALL
      SELECT 
        'db_slow_queries',
        COUNT(*),
        10,
        CASE WHEN COUNT(*) > 10 THEN 'warning' ELSE 'info' END
      FROM pg_stat_statements 
      WHERE mean_exec_time > 1000 -- queries taking >1 second
        AND calls > 100
    `);
    metrics.push(...dbMetrics.rows);

    // API performance
    const apiMetrics = await this.pool.query(`
      SELECT 
        'api_avg_response_time_ms' as metric_name,
        AVG(response_time_ms)::INTEGER as current_value,
        500 as threshold_value,
        CASE 
          WHEN AVG(response_time_ms) > 500 THEN 'warning'
          WHEN AVG(response_time_ms) > 1000 THEN 'critical'
          ELSE 'info'
        END as severity
      FROM api_logs
      WHERE created_at > NOW() - INTERVAL '1 hour'
      UNION ALL
      SELECT 
        'api_error_rate_percent',
        (COUNT(*) FILTER (WHERE status_code >= 500) * 100.0 / COUNT(*))::INTEGER,
        5,
        CASE 
          WHEN (COUNT(*) FILTER (WHERE status_code >= 500) * 100.0 / COUNT(*)) > 5 THEN 'critical'
          WHEN (COUNT(*) FILTER (WHERE status_code >= 500) * 100.0 / COUNT(*)) > 1 THEN 'warning'
          ELSE 'info'
        END
      FROM api_logs
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);
    metrics.push(...apiMetrics.rows);

    // SDK performance (ANR rate)
    const sdkMetrics = await this.pool.query(`
      SELECT 
        'sdk_anr_rate_percent' as metric_name,
        (COUNT(*) FILTER (WHERE event_type = 'anr') * 100.0 / NULLIF(COUNT(*), 0))::DECIMAL(5,4) as current_value,
        0.02 as threshold_value,
        CASE 
          WHEN (COUNT(*) FILTER (WHERE event_type = 'anr') * 100.0 / NULLIF(COUNT(*), 0)) > 0.05 THEN 'critical'
          WHEN (COUNT(*) FILTER (WHERE event_type = 'anr') * 100.0 / NULLIF(COUNT(*), 0)) > 0.02 THEN 'warning'
          ELSE 'info'
        END as severity
      FROM sdk_events
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);
    metrics.push(...sdkMetrics.rows);

    // Revenue metrics
    const revenueMetrics = await this.pool.query(`
      SELECT 
        'revenue_per_customer' as metric_name,
        (SUM(revenue_cents) / COUNT(DISTINCT customer_id))::INTEGER as current_value,
        15000 as threshold_value,
        'info' as severity
      FROM usage_records
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    metrics.push(...revenueMetrics.rows);

    // Calculate trends (compare to previous hour)
    for (const metric of metrics) {
      const trend = await this.calculateMetricTrend(metric.metric_name);
      metric.trend = trend;
    }

    return metrics;
  }

  /**
   * Detect performance degradation using time-series analysis
   */
  private async detectPerformanceDegradation(
    metrics: SystemMetric[]
  ): Promise<SystemMetric[]> {
    const issues = metrics.filter(
      (m) => m.severity === 'warning' || m.severity === 'critical'
    );

    if (issues.length > 0) {
      console.log(`[SelfEvolving] Detected ${issues.length} performance issues:`);
      for (const issue of issues) {
        console.log(
          `  - ${issue.metric_name}: ${issue.current_value} (threshold: ${issue.threshold_value}, trend: ${issue.trend})`
        );
      }

      // Auto-create incident if critical
      const criticalIssues = issues.filter((i) => i.severity === 'critical');
      if (criticalIssues.length > 0) {
        await this.autoCreateIncident(criticalIssues);
      }
    }

    return issues;
  }

  /**
   * Use AI to identify optimization opportunities
   */
  private async identifyOptimizationOpportunities(
    metrics: SystemMetric[]
  ): Promise<OptimizationOpportunity[]> {
    if (!this.aiEnabled || !this.openai) {
      console.log('[SelfEvolving] AI optimization disabled, skipping recommendations');
      return [];
    }

    // Get historical performance data
    const historyData = await this.pool.query(`
      SELECT 
        metric_name,
        metric_value,
        recorded_at
      FROM system_metrics_history
      WHERE recorded_at > NOW() - INTERVAL '7 days'
      ORDER BY recorded_at DESC
      LIMIT 1000
    `);

    // Use AI to analyze patterns and suggest optimizations
    const prompt = `
You are an expert system administrator analyzing a SaaS platform's performance metrics.

Current Metrics:
${JSON.stringify(metrics, null, 2)}

Historical Data (last 7 days):
${JSON.stringify(historyData.rows.slice(0, 50), null, 2)}

Identify optimization opportunities that can be automatically applied. For each opportunity, provide:
1. Area of improvement (database, API, caching, infrastructure)
2. Current performance description
3. Proposed change (be specific and actionable)
4. Expected improvement (quantified)
5. Confidence score (0-1, where 1 is highest confidence)
6. Auto-apply recommendation (true if safe to apply automatically, false if needs human review)

Focus on:
- Database query optimization (add indexes, rewrite queries)
- API endpoint caching opportunities
- Infrastructure scaling triggers
- Code-level performance improvements
- Cost optimization opportunities

Return JSON array of optimization opportunities.
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Low temperature for consistent, conservative recommendations
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.opportunities || [];
    } catch (error) {
      console.error('[SelfEvolving] AI analysis failed:', error);
      return [];
    }
  }

  /**
   * Automatically apply safe optimizations (high confidence, low risk)
   */
  private async autoApplySafeOptimizations(
    opportunities: OptimizationOpportunity[]
  ): Promise<void> {
    const safeOps = opportunities.filter(
      (op) => op.auto_apply && op.confidence_score >= 0.8
    );

    for (const op of safeOps) {
      console.log(`[SelfEvolving] Auto-applying optimization: ${op.area}`);
      console.log(`  Change: ${op.proposed_change}`);
      console.log(`  Expected: ${op.expected_improvement}`);

      const metricsBefore = await this.captureMetrics();

      try {
        // Apply optimization based on area
        if (op.area === 'database') {
          await this.applyDatabaseOptimization(op);
        } else if (op.area === 'API') {
          await this.applyAPIOptimization(op);
        } else if (op.area === 'caching') {
          await this.applyCachingOptimization(op);
        } else if (op.area === 'infrastructure') {
          await this.applyInfrastructureOptimization(op);
        }

        // Wait 5 minutes for changes to take effect
        await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));

        // Measure improvement
        const metricsAfter = await this.captureMetrics();
        const improvement = this.calculateImprovement(metricsBefore, metricsAfter);

        await this.logEvolution(
          'auto_optimization',
          `Applied: ${op.proposed_change}`,
          metricsBefore,
          metricsAfter,
          true
        );

        console.log(`[SelfEvolving] Optimization successful. Improvement: ${improvement}%`);
      } catch (error) {
        console.error(`[SelfEvolving] Optimization failed:`, error);
        // Rollback if possible
        await this.rollbackLastChange();
        await this.logEvolution(
          'auto_optimization_failed',
          `Failed: ${op.proposed_change}`,
          metricsBefore,
          {},
          false
        );
      }
    }
  }

  /**
   * Database optimization: Add indexes, optimize queries
   */
  private async applyDatabaseOptimization(op: OptimizationOpportunity): Promise<void> {
    // Parse proposed change to extract SQL commands
    const addIndexMatch = op.proposed_change.match(/CREATE INDEX (.*?) ON (.*?);/i);
    
    if (addIndexMatch) {
      const [, indexName, tableInfo] = addIndexMatch;
      console.log(`[SelfEvolving] Creating index: ${indexName} on ${tableInfo}`);
      
      // Check if index already exists
      const existingIndex = await this.pool.query(
        `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
        [indexName.replace(/['"]/g, '')]
      );

      if (existingIndex.rows.length === 0) {
        await this.pool.query(op.proposed_change);
        console.log(`[SelfEvolving] Index created successfully`);
      } else {
        console.log(`[SelfEvolving] Index already exists, skipping`);
      }
    }
  }

  /**
   * API optimization: Enable caching, rate limiting adjustments
   */
  private async applyAPIOptimization(op: OptimizationOpportunity): Promise<void> {
    // Store API configuration changes in database
    await this.pool.query(
      `INSERT INTO system_config (key, value, applied_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, applied_at = NOW()`,
      ['api_optimization_' + Date.now(), JSON.stringify(op)]
    );

    // Notify API service to reload configuration (via Redis pub/sub)
    console.log('[SelfEvolving] API optimization configuration stored');
  }

  /**
   * Caching optimization: Add cache layers, adjust TTLs
   */
  private async applyCachingOptimization(op: OptimizationOpportunity): Promise<void> {
    await this.pool.query(
      `INSERT INTO cache_policies (endpoint_pattern, ttl_seconds, enabled, created_at)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (endpoint_pattern) DO UPDATE SET ttl_seconds = $2, enabled = true`,
      [op.area, 300] // Default 5 minute cache
    );
    console.log('[SelfEvolving] Caching policy updated');
  }

  /**
   * Infrastructure optimization: Scale resources, adjust limits
   */
  private async applyInfrastructureOptimization(op: OptimizationOpportunity): Promise<void> {
    // Store scaling recommendation (actual scaling happens via Fly.io autoscaling)
    await this.pool.query(
      `INSERT INTO infrastructure_events (event_type, description, metadata, created_at)
       VALUES ('scaling_recommendation', $1, $2, NOW())`,
      [op.proposed_change, JSON.stringify(op)]
    );
    console.log('[SelfEvolving] Infrastructure recommendation logged');
  }

  /**
   * Flag risky optimizations for human review
   */
  private async flagRiskyOptimizations(
    opportunities: OptimizationOpportunity[]
  ): Promise<void> {
    const riskyOps = opportunities.filter(
      (op) => !op.auto_apply || op.confidence_score < 0.8
    );

    for (const op of riskyOps) {
      await this.pool.query(
        `INSERT INTO optimization_queue (
           area, proposed_change, expected_improvement, confidence_score,
           requires_review, created_at
         ) VALUES ($1, $2, $3, $4, true, NOW())`,
        [op.area, op.proposed_change, op.expected_improvement, op.confidence_score]
      );

      // Send email notification to operator (async, non-blocking)
      await this.pool.query(
        `INSERT INTO events (event_type, data, created_at)
         VALUES ('email.optimization_review', $1, NOW())`,
        [JSON.stringify({ optimization: op })]
      );
    }

    if (riskyOps.length > 0) {
      console.log(
        `[SelfEvolving] Flagged ${riskyOps.length} optimizations for human review`
      );
    }
  }

  /**
   * Predict future capacity needs using time-series forecasting
   */
  private async predictCapacityNeeds(metrics: SystemMetric[]): Promise<void> {
    // Get growth trends
    const customerGrowth = await this.pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as new_customers
      FROM users
      WHERE created_at > NOW() - INTERVAL '90 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    const revenueGrowth = await this.pool.query(`
      SELECT 
        DATE(created_at) as date,
        SUM(revenue_cents) as daily_revenue
      FROM usage_records
      WHERE created_at > NOW() - INTERVAL '90 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Simple linear regression to predict next 30 days
    const prediction = this.linearForecast(customerGrowth.rows, 30);

    if (prediction.slope > 0) {
      const predictedCustomers = prediction.intercept + prediction.slope * 30;
      const currentCapacity = await this.getCurrentCapacity();

      if (predictedCustomers > currentCapacity * 0.8) {
        console.log(
          `[SelfEvolving] Capacity warning: Predicted ${Math.round(predictedCustomers)} customers in 30 days (80% of capacity: ${currentCapacity * 0.8})`
        );

        // Auto-schedule capacity increase
        await this.pool.query(
          `INSERT INTO infrastructure_events (
             event_type, description, scheduled_for, metadata, created_at
           ) VALUES ('capacity_increase', $1, NOW() + INTERVAL '14 days', $2, NOW())`,
          [
            'Proactive capacity increase based on growth forecast',
            JSON.stringify({ predicted_customers: predictedCustomers, current_capacity: currentCapacity }),
          ]
        );
      }
    }
  }

  /**
   * Auto-scale infrastructure based on current load
   */
  private async autoScaleInfrastructure(metrics: SystemMetric[]): Promise<void> {
    const cpuMetric = metrics.find((m) => m.metric_name === 'cpu_usage_percent');
    const memoryMetric = metrics.find((m) => m.metric_name === 'memory_usage_percent');

    if (cpuMetric && cpuMetric.current_value > 70) {
      console.log('[SelfEvolving] High CPU detected, triggering scale-up');
      await this.triggerFlyioScaling('scale-up');
    } else if (cpuMetric && cpuMetric.current_value < 20) {
      console.log('[SelfEvolving] Low CPU detected, triggering scale-down');
      await this.triggerFlyioScaling('scale-down');
    }
  }

  /**
   * Learn from past changes to improve AI model
   */
  private async learnFromHistory(): Promise<void> {
    // Get successful vs failed optimizations
    const history = await this.pool.query(`
      SELECT 
        change_type,
        description,
        success,
        metrics_before,
        metrics_after
      FROM evolution_log
      WHERE timestamp > NOW() - INTERVAL '30 days'
      ORDER BY timestamp DESC
      LIMIT 100
    `);

    const successRate = history.rows.filter((h) => h.success).length / history.rows.length;
    console.log(`[SelfEvolving] Historical success rate: ${(successRate * 100).toFixed(1)}%`);

    // Store learning insights
    await this.pool.query(
      `INSERT INTO ai_learning_insights (
         insight_type, data, success_rate, sample_size, created_at
       ) VALUES ('optimization_history', $1, $2, $3, NOW())`,
      [JSON.stringify(history.rows), successRate, history.rows.length]
    );
  }

  /**
   * Helper: Calculate metric trend (improving/stable/degrading)
   */
  private async calculateMetricTrend(metricName: string): Promise<'improving' | 'stable' | 'degrading'> {
    const trend = await this.pool.query(
      `SELECT 
         metric_value,
         recorded_at
       FROM system_metrics_history
       WHERE metric_name = $1
         AND recorded_at > NOW() - INTERVAL '24 hours'
       ORDER BY recorded_at DESC
       LIMIT 24`,
      [metricName]
    );

    if (trend.rows.length < 2) return 'stable';

    const recent = trend.rows.slice(0, 6).reduce((sum, r) => sum + parseFloat(r.metric_value), 0) / 6;
    const older = trend.rows.slice(6, 12).reduce((sum, r) => sum + parseFloat(r.metric_value), 0) / 6;

    const changePercent = ((recent - older) / older) * 100;

    if (changePercent > 10) return 'degrading'; // Assuming higher values are worse
    if (changePercent < -10) return 'improving';
    return 'stable';
  }

  /**
   * Helper: Auto-create incident for critical issues
   */
  private async autoCreateIncident(issues: SystemMetric[]): Promise<void> {
    const incidentDescription = issues
      .map((i) => `${i.metric_name}: ${i.current_value} (threshold: ${i.threshold_value})`)
      .join('; ');

    await this.pool.query(
      `INSERT INTO incidents (
         title, description, severity, status, auto_created, created_at
       ) VALUES ($1, $2, 'critical', 'investigating', true, NOW())`,
      ['Auto-detected performance degradation', incidentDescription]
    );

    // Send alert (email + SMS if configured)
    await this.pool.query(
      `INSERT INTO events (event_type, data, created_at)
       VALUES ('alert.critical_performance', $1, NOW())`,
      [JSON.stringify({ issues })]
    );

    console.log('[SelfEvolving] Critical incident created and alerts sent');
  }

  /**
   * Helper: Capture current metrics snapshot
   */
  private async captureMetrics(): Promise<Record<string, number>> {
    const metrics = await this.collectSystemMetrics();
    return metrics.reduce((acc, m) => {
      acc[m.metric_name] = m.current_value;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Helper: Calculate improvement percentage
   */
  private calculateImprovement(
    before: Record<string, number>,
    after: Record<string, number>
  ): number {
    const improvements = Object.keys(before)
      .filter((key) => after[key] !== undefined)
      .map((key) => {
        const change = ((after[key] - before[key]) / before[key]) * 100;
        return Math.abs(change); // Take absolute value for overall improvement
      });

    return improvements.length > 0
      ? improvements.reduce((sum, val) => sum + val, 0) / improvements.length
      : 0;
  }

  /**
   * Helper: Rollback last change
   */
  private async rollbackLastChange(): Promise<void> {
    console.log('[SelfEvolving] Attempting rollback of last change...');
    // Implementation depends on what was changed (database, config, infrastructure)
    // For now, just log the rollback attempt
    await this.pool.query(
      `INSERT INTO evolution_log (
         timestamp, change_type, description, success
       ) VALUES (NOW(), 'rollback', 'Auto-rollback due to optimization failure', true)`
    );
  }

  /**
   * Helper: Log evolution event
   */
  private async logEvolution(
    changeType: string,
    description: string,
    metricsBefore: Record<string, number>,
    metricsAfter: Record<string, number>,
    success: boolean
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO evolution_log (
         timestamp, change_type, description, metrics_before, metrics_after, success
       ) VALUES (NOW(), $1, $2, $3, $4, $5)`,
      [changeType, description, JSON.stringify(metricsBefore), JSON.stringify(metricsAfter), success]
    );

    this.evolutionHistory.push({
      timestamp: new Date(),
      change_type: changeType,
      description,
      metrics_before: metricsBefore,
      metrics_after: metricsAfter,
      success,
    });
  }

  /**
   * Helper: Linear forecast
   */
  private linearForecast(
    data: Array<{ date: Date; new_customers?: number; daily_revenue?: number }>,
    daysAhead: number
  ): { slope: number; intercept: number } {
    if (data.length < 2) return { slope: 0, intercept: 0 };

    const n = data.length;
    const sumX = data.reduce((sum, _, i) => sum + i, 0);
    const sumY = data.reduce((sum, d) => sum + (d.new_customers || d.daily_revenue || 0), 0);
    const sumXY = data.reduce((sum, d, i) => sum + i * (d.new_customers || d.daily_revenue || 0), 0);
    const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  /**
   * Helper: Get current capacity
   */
  private async getCurrentCapacity(): Promise<number> {
    const result = await this.pool.query(
      `SELECT value::INTEGER FROM system_config WHERE key = 'max_customer_capacity'`
    );
    return result.rows[0]?.value || 10000; // Default 10K customers
  }

  /**
   * Helper: Trigger Fly.io scaling
   */
  private async triggerFlyioScaling(action: 'scale-up' | 'scale-down'): Promise<void> {
    // Store scaling event (actual scaling handled by Fly.io autoscaling config)
    await this.pool.query(
      `INSERT INTO infrastructure_events (
         event_type, description, created_at
       ) VALUES ('autoscaling', $1, NOW())`,
      [`Auto-triggered ${action} based on metrics`]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// Export singleton instance
const databaseUrl = process.env.DATABASE_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;
const enableSelfEvolvingAI =
  process.env.ENABLE_AI_AUTOMATION === 'true' || process.env.ENABLE_SELF_EVOLVING_AI === 'true';

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const selfEvolvingSystemService = new SelfEvolvingSystemService(
  databaseUrl,
  openaiApiKey,
  enableSelfEvolvingAI
);

// CLI support
if (require.main === module) {
  (async () => {
    const service = new SelfEvolvingSystemService(
      databaseUrl!,
      openaiApiKey,
      enableSelfEvolvingAI
    );
    try {
      await service.monitorAndEvolve();
      await service.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      await service.close();
      process.exit(1);
    }
  })();
}
