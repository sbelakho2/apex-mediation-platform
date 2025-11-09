/**
 * A/B Testing Service
 * 
 * Statistical A/B testing framework with experiment tracking,
 * significance testing, and multi-armed bandit integration
 */

import logger from '../utils/logger';
import { query } from '../utils/postgres';

type JsonObject = Record<string, unknown>;

interface ExperimentRow {
  id: string;
  name: string;
  description: string | null;
  type: Experiment['type'];
  status: Experiment['status'];
  start_date: Date | null;
  end_date: Date | null;
  publisher_id: string;
  target_sample_size: number | string;
  confidence_level: number | string;
  created_at: Date;
  updated_at: Date;
}

interface VariantRow {
  id: string;
  experiment_id: string;
  name: string;
  traffic_allocation: number | string;
  configuration: JsonObject | string | null;
  created_at: Date;
  updated_at: Date;
}

interface VariantMetricsRow {
  impressions: number | string | null;
  revenue: number | string | null;
  clicks: number | string | null;
  conversions: number | string | null;
}

interface VariantNameRow {
  name: string | null;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  type: 'floor_price' | 'adapter_priority' | 'placement_optimization' | 'waterfall_order';
  status: 'draft' | 'running' | 'paused' | 'completed';
  startDate?: Date;
  endDate?: Date;
  publisherId: string;
  variants: ExperimentVariant[];
  targetSampleSize: number;
  confidenceLevel: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExperimentVariant {
  id: string;
  experimentId: string;
  name: string;
  trafficAllocation: number; // 0-100 percentage
  configuration: JsonObject;
  metrics: VariantMetrics;
}

export interface VariantMetrics {
  impressions: number;
  revenue: number;
  clicks: number;
  conversions: number;
  ecpm: number;
  ctr: number;
  conversionRate: number;
}

export interface StatisticalResult {
  variant: string;
  mean: number;
  standardError: number;
  confidenceInterval: [number, number];
  sampleSize: number;
}

export interface SignificanceTest {
  metric: string;
  controlVariant: StatisticalResult;
  testVariant: StatisticalResult;
  pValue: number;
  isSignificant: boolean;
  confidenceLevel: number;
  relativeUplift: number;
  absoluteDifference: number;
  recommendation: 'continue' | 'winner' | 'no_difference' | 'insufficient_data';
}

export interface BanditRecommendation {
  variantId: string;
  variantName: string;
  expectedValue: number;
  probability: number;
  explorationBonus: number;
}

export class ABTestingService {
  /**
   * Create a new A/B test experiment
   */
  async createExperiment(params: {
    publisherId: string;
    name: string;
    description: string;
    type: Experiment['type'];
    variants: Array<{
      name: string;
      trafficAllocation: number;
      configuration: JsonObject;
    }>;
    targetSampleSize: number;
    confidenceLevel: number;
  }): Promise<Experiment> {
    try {
      // Validate traffic allocations sum to 100
      const totalAllocation = params.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
      if (Math.abs(totalAllocation - 100) > 0.01) {
        throw new Error(`Traffic allocations must sum to 100% (got ${totalAllocation}%)`);
      }

      const experimentId = this.generateId();

      // Insert experiment
      await query(
        `INSERT INTO ab_experiments 
         (id, name, description, type, status, publisher_id, target_sample_size, confidence_level, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          experimentId,
          params.name,
          params.description,
          params.type,
          'draft',
          params.publisherId,
          params.targetSampleSize,
          params.confidenceLevel,
        ]
      );

      // Insert variants
      for (const variant of params.variants) {
        const variantId = this.generateId();
        await query(
          `INSERT INTO ab_variants
           (id, experiment_id, name, traffic_allocation, configuration, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [
            variantId,
            experimentId,
            variant.name,
            variant.trafficAllocation,
            JSON.stringify(variant.configuration),
          ]
        );
      }

      return this.getExperiment(experimentId);
    } catch (error) {
      logger.error('Failed to create experiment', { error, params });
      throw error;
    }
  }

  /**
   * Get experiment by ID
   */
  async getExperiment(experimentId: string): Promise<Experiment> {
    try {
      const experimentResult = await query<ExperimentRow>(
        `SELECT * FROM ab_experiments WHERE id = $1`,
        [experimentId]
      );

      const experimentRow = experimentResult.rows[0];

      if (!experimentRow) {
        throw new Error('Experiment not found');
      }

      const variantsResult = await query<VariantRow>(
        `SELECT * FROM ab_variants WHERE experiment_id = $1 ORDER BY created_at`,
        [experimentId]
      );

      const variants = await Promise.all(
        variantsResult.rows.map(async (variantRow) => {
          const metrics = await this.getVariantMetrics(variantRow.id);
          return {
            id: variantRow.id,
            experimentId: variantRow.experiment_id,
            name: variantRow.name,
            trafficAllocation: this.toNumber(variantRow.traffic_allocation),
            configuration: this.parseJsonField(variantRow.configuration),
            metrics,
          };
        })
      );

      return {
        id: experimentRow.id,
        name: experimentRow.name,
        description: experimentRow.description ?? '',
        type: experimentRow.type,
        status: experimentRow.status,
        startDate: experimentRow.start_date ? new Date(experimentRow.start_date) : undefined,
        endDate: experimentRow.end_date ? new Date(experimentRow.end_date) : undefined,
        publisherId: experimentRow.publisher_id,
        variants,
        targetSampleSize: this.toNumber(experimentRow.target_sample_size),
        confidenceLevel: this.toNumber(experimentRow.confidence_level),
        createdAt: new Date(experimentRow.created_at),
        updatedAt: new Date(experimentRow.updated_at),
      };
    } catch (error) {
      logger.error('Failed to get experiment', { error, experimentId });
      throw error;
    }
  }

  /**
   * Start an experiment
   */
  async startExperiment(experimentId: string): Promise<void> {
    try {
      await query(
        `UPDATE ab_experiments 
         SET status = 'running', start_date = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'draft'`,
        [experimentId]
      );

      logger.info('Started experiment', { experimentId });
    } catch (error) {
      logger.error('Failed to start experiment', { error, experimentId });
      throw error;
    }
  }

  /**
   * Stop an experiment
   */
  async stopExperiment(experimentId: string): Promise<void> {
    try {
      await query(
        `UPDATE ab_experiments 
         SET status = 'completed', end_date = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'running'`,
        [experimentId]
      );

      logger.info('Stopped experiment', { experimentId });
    } catch (error) {
      logger.error('Failed to stop experiment', { error, experimentId });
      throw error;
    }
  }

  /**
   * Record experiment event (impression, click, conversion)
   */
  async recordEvent(params: {
    experimentId: string;
    variantId: string;
    eventType: 'impression' | 'click' | 'conversion';
    revenue?: number;
    metadata?: JsonObject;
  }): Promise<void> {
    try {
      await query(
        `INSERT INTO ab_events 
         (id, experiment_id, variant_id, event_type, revenue, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          this.generateId(),
          params.experimentId,
          params.variantId,
          params.eventType,
          params.revenue || 0,
          JSON.stringify(params.metadata || {}),
        ]
      );
    } catch (error) {
      logger.error('Failed to record experiment event', { error, params });
      throw error;
    }
  }

  private parseJsonField(value: unknown): JsonObject {
    if (value === null || value === undefined) {
      return {};
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return this.isPlainObject(parsed) ? parsed : {};
      } catch (error) {
        logger.warn('Failed to parse JSON configuration', { error });
        return {};
      }
    }

    if (this.isPlainObject(value)) {
      return value as JsonObject;
    }

    return {};
  }

  private isPlainObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toNumber(value: number | string | null | undefined): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  /**
   * Get variant metrics
   */
  private async getVariantMetrics(variantId: string): Promise<VariantMetrics> {
    try {
      const result = await query<VariantMetricsRow>(
        `SELECT
           COUNT(CASE WHEN event_type = 'impression' THEN 1 END) as impressions,
           SUM(revenue) as revenue,
           COUNT(CASE WHEN event_type = 'click' THEN 1 END) as clicks,
           COUNT(CASE WHEN event_type = 'conversion' THEN 1 END) as conversions
         FROM ab_events
         WHERE variant_id = $1`,
        [variantId]
      );

      const row = result.rows[0] ?? {
        impressions: 0,
        revenue: 0,
        clicks: 0,
        conversions: 0,
      };

      const impressions = this.toNumber(row.impressions);
      const revenue = this.toNumber(row.revenue);
      const clicks = this.toNumber(row.clicks);
      const conversions = this.toNumber(row.conversions);

      return {
        impressions,
        revenue,
        clicks,
        conversions,
        ecpm: impressions > 0 ? (revenue / impressions) * 1000 : 0,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      };
    } catch (error) {
      logger.error('Failed to get variant metrics', { error, variantId });
      throw error;
    }
  }

  /**
   * Perform statistical significance test (T-test)
   */
  async testSignificance(
    experimentId: string,
    metric: 'ecpm' | 'ctr' | 'conversionRate' = 'ecpm'
  ): Promise<SignificanceTest> {
    try {
      const experiment = await this.getExperiment(experimentId);

      if (experiment.variants.length !== 2) {
        throw new Error('Significance test requires exactly 2 variants');
      }

      const [control, test] = experiment.variants;

      // Get statistical results for each variant
      const controlStats = await this.calculateStatistics(control.id, metric);
      const testStats = await this.calculateStatistics(test.id, metric);

      // Perform two-sample t-test
      const pooledSE = Math.sqrt(
        controlStats.standardError ** 2 + testStats.standardError ** 2
      );

      const tStatistic = (testStats.mean - controlStats.mean) / pooledSE;
      const degreesOfFreedom = controlStats.sampleSize + testStats.sampleSize - 2;

      // Calculate p-value (two-tailed test)
      const pValue = this.calculatePValue(Math.abs(tStatistic), degreesOfFreedom);

      const isSignificant = pValue < (1 - experiment.confidenceLevel);

      const relativeUplift = controlStats.mean > 0
        ? ((testStats.mean - controlStats.mean) / controlStats.mean) * 100
        : 0;

      const absoluteDifference = testStats.mean - controlStats.mean;

      // Determine recommendation
      let recommendation: SignificanceTest['recommendation'];
      if (controlStats.sampleSize < experiment.targetSampleSize / 2) {
        recommendation = 'insufficient_data';
      } else if (isSignificant && relativeUplift > 5) {
        recommendation = 'winner';
      } else if (isSignificant && relativeUplift < -5) {
        recommendation = 'winner'; // Control wins
      } else if (!isSignificant && controlStats.sampleSize >= experiment.targetSampleSize) {
        recommendation = 'no_difference';
      } else {
        recommendation = 'continue';
      }

      return {
        metric,
        controlVariant: controlStats,
        testVariant: testStats,
        pValue,
        isSignificant,
        confidenceLevel: experiment.confidenceLevel,
        relativeUplift,
        absoluteDifference,
        recommendation,
      };
    } catch (error) {
      logger.error('Failed to test significance', { error, experimentId });
      throw error;
    }
  }

  /**
   * Calculate statistics for a variant
   */
  private async calculateStatistics(
    variantId: string,
    metric: 'ecpm' | 'ctr' | 'conversionRate'
  ): Promise<StatisticalResult> {
    try {
      const metrics = await this.getVariantMetrics(variantId);
      
      const sampleSize = metrics.impressions;
      const mean = metrics[metric];

      // Estimate standard error based on metric type
      let standardError: number;
      if (metric === 'ecpm') {
        // For revenue metrics, use sample standard deviation
        const variance = mean * mean / Math.max(sampleSize, 1);
        standardError = Math.sqrt(variance / sampleSize);
      } else {
        // For proportion metrics (CTR, conversion rate), use binomial SE
        const p = mean / 100; // Convert percentage to proportion
        standardError = Math.sqrt((p * (1 - p)) / Math.max(sampleSize, 1)) * 100;
      }

      // Calculate 95% confidence interval
      const marginOfError = 1.96 * standardError;
      const confidenceInterval: [number, number] = [
        mean - marginOfError,
        mean + marginOfError,
      ];

      const variant = await query<VariantNameRow>(
        `SELECT name FROM ab_variants WHERE id = $1`,
        [variantId]
      );

      return {
        variant: variant.rows[0]?.name ?? 'Unknown',
        mean,
        standardError,
        confidenceInterval,
        sampleSize,
      };
    } catch (error) {
      logger.error('Failed to calculate statistics', { error, variantId });
      throw error;
    }
  }

  /**
   * Get multi-armed bandit recommendation (Thompson Sampling)
   */
  async getBanditRecommendation(experimentId: string): Promise<BanditRecommendation> {
    try {
      const experiment = await this.getExperiment(experimentId);

      // Use Thompson Sampling with Beta distributions
      let bestVariant: BanditRecommendation | null = null;
      let maxSample = -Infinity;

      for (const variant of experiment.variants) {
        const alpha = variant.metrics.impressions * (variant.metrics.ecpm / 1000) + 1;
        const beta = variant.metrics.impressions * (1 - variant.metrics.ecpm / 1000) + 1;

        // Sample from Beta distribution
        const sample = this.sampleBeta(alpha, beta);
        
        // Add exploration bonus (UCB-like)
        const totalImpressions = experiment.variants.reduce((sum, v) => sum + v.metrics.impressions, 0);
        const explorationBonus = Math.sqrt(
          (2 * Math.log(totalImpressions)) / Math.max(variant.metrics.impressions, 1)
        );

        const score = sample + explorationBonus * 0.1; // Small exploration weight

        if (score > maxSample) {
          maxSample = score;
          bestVariant = {
            variantId: variant.id,
            variantName: variant.name,
            expectedValue: variant.metrics.ecpm,
            probability: sample,
            explorationBonus,
          };
        }
      }

      if (!bestVariant) {
        throw new Error('No variant selected');
      }

      return bestVariant;
    } catch (error) {
      logger.error('Failed to get bandit recommendation', { error, experimentId });
      throw error;
    }
  }

  /**
   * Sample from Beta distribution using rejection sampling
   */
  private sampleBeta(alpha: number, beta: number): number {
    // For efficiency, use normal approximation for large alpha, beta
    if (alpha > 10 && beta > 10) {
      const mean = alpha / (alpha + beta);
      const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
      const std = Math.sqrt(variance);
      
      // Box-Muller transform for normal sampling
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      return Math.max(0, Math.min(1, mean + z * std));
    }

    // For small parameters, use Gamma sampling
    const gammaA = this.sampleGamma(alpha, 1);
    const gammaB = this.sampleGamma(beta, 1);
    return gammaA / (gammaA + gammaB);
  }

  /**
   * Sample from Gamma distribution using Marsaglia-Tsang method
   */
  private sampleGamma(shape: number, scale: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    for (;;) {
      let x, v;
      do {
        x = this.sampleNormal(0, 1);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v * scale;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }

  /**
   * Sample from standard normal distribution
   */
  private sampleNormal(mean: number, std: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }

  /**
   * Calculate p-value from t-statistic (approximation)
   */
  private calculatePValue(tStat: number, df: number): number {
    // Simplified approximation for p-value calculation
    // For production, use a proper statistical library
    if (df > 30) {
      // Use normal approximation for large df
      const z = tStat;
      return 2 * (1 - this.normalCDF(Math.abs(z)));
    }

    // Rough approximation for smaller df
    const x = df / (df + tStat * tStat);
    return this.betaCDF(x, df / 2, 0.5);
  }

  /**
   * Normal cumulative distribution function
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Beta cumulative distribution function (approximation)
   */
  private betaCDF(x: number, _a: number, _b: number): number {
    // Simplified approximation
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x; // Very rough approximation
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const abTestingService = new ABTestingService();

export default abTestingService;
