/**
 * Thompson Sampling Service for Dynamic Bid Floor Optimization
 * 
 * Uses Bayesian multi-armed bandit algorithm to optimize bid floor prices
 * by tracking success rates per adapter/geo/format combination.
 */

import logger from '../utils/logger';
import { query } from '../utils/postgres';

// ========================================
// Thompson Sampling Types
// ========================================

export interface BidFloorConfig {
  adapterId: string;
  geo: string;
  format: string;
  currentFloor: number;
  currency: string;
}

export interface BidFloorCandidate {
  price: number;
  alphaSuccesses: number; // Beta distribution alpha parameter
  betaFailures: number; // Beta distribution beta parameter
}

export interface BidFloorExperiment {
  adapterId: string;
  geo: string;
  format: string;
  currency: string;
  candidates: BidFloorCandidate[];
  lastUpdated: Date;
}

export interface BidFloorUpdate {
  adapterId: string;
  geo: string;
  format: string;
  bidFloor: number;
  bidAmount: number;
  won: boolean;
  revenue: number;
}

export interface ThompsonSamplingStats {
  adapterId: string;
  geo: string;
  format: string;
  bestFloor: number;
  confidence: number;
  totalTrials: number;
  successRate: number;
}

// ========================================
// Thompson Sampling Configuration
// ========================================

const DEFAULT_FLOOR_CANDIDATES = [
  0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0,
];

const PRIOR_ALPHA = 1; // Optimistic prior
const PRIOR_BETA = 1;
const MIN_TRIALS_BEFORE_EXPLORATION = 100; // Warm-up period
const EXPLORATION_RATE = 0.1; // 10% of time use exploration

// ========================================
// Thompson Sampling Service
// ========================================

export class ThompsonSamplingService {
  private experiments: Map<string, BidFloorExperiment> = new Map();

  constructor() {
    // Initialize from database
    this.loadExperiments().catch((error) => {
      logger.error('Failed to load Thompson sampling experiments', { error });
    });
  }

  /**
   * Generate experiment key for caching
   */
  private getExperimentKey(adapterId: string, geo: string, format: string): string {
    return `${adapterId}:${geo}:${format}`;
  }

  /**
   * Sample from Beta distribution using Thompson Sampling
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Use Gamma distribution to sample from Beta
    // Beta(α, β) = Gamma(α, 1) / (Gamma(α, 1) + Gamma(β, 1))
    const gammaAlpha = this.sampleGamma(alpha, 1);
    const gammaBeta = this.sampleGamma(beta, 1);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  /**
   * Sample from Gamma distribution (Marsaglia and Tsang method)
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
        x = this.normalRandom();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();
      const xSquared = x * x;

      if (u < 1 - 0.0331 * xSquared * xSquared) {
        return d * v * scale;
      }

      if (Math.log(u) < 0.5 * xSquared + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }

  /**
   * Generate normally distributed random number (Box-Muller transform)
   */
  private normalRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Get optimal bid floor using Thompson Sampling
   */
  async getOptimalBidFloor(
    adapterId: string,
    geo: string,
    format: string,
    currency: string = 'USD'
  ): Promise<number> {
    const key = this.getExperimentKey(adapterId, geo, format);
    let experiment = this.experiments.get(key);

    // Initialize experiment if not exists
    if (!experiment) {
      experiment = await this.initializeExperiment(adapterId, geo, format, currency);
      this.experiments.set(key, experiment);
    }

    // Calculate total trials
    const totalTrials = experiment.candidates.reduce(
      (sum, c) => sum + c.alphaSuccesses + c.betaFailures,
      0
    );

    // Exploration vs. Exploitation
    const shouldExplore =
      totalTrials < MIN_TRIALS_BEFORE_EXPLORATION || Math.random() < EXPLORATION_RATE;

    if (shouldExplore) {
      // Random exploration
      const randomIndex = Math.floor(Math.random() * experiment.candidates.length);
      logger.debug('Thompson sampling: exploration mode', {
        adapterId,
        geo,
        format,
        floor: experiment.candidates[randomIndex].price,
      });
      return experiment.candidates[randomIndex].price;
    }

    // Thompson Sampling: sample from each candidate's Beta distribution
    let bestSample = -1;
    let bestFloor = experiment.candidates[0].price;

    for (const candidate of experiment.candidates) {
      const sample = this.sampleBeta(
        candidate.alphaSuccesses + PRIOR_ALPHA,
        candidate.betaFailures + PRIOR_BETA
      );

      if (sample > bestSample) {
        bestSample = sample;
        bestFloor = candidate.price;
      }
    }

    logger.debug('Thompson sampling: exploitation mode', {
      adapterId,
      geo,
      format,
      floor: bestFloor,
      sample: bestSample,
    });

    return bestFloor;
  }

  /**
   * Update bid floor experiment with new data
   */
  async updateBidFloor(update: BidFloorUpdate): Promise<void> {
    const key = this.getExperimentKey(update.adapterId, update.geo, update.format);
    const experiment = this.experiments.get(key);

    if (!experiment) {
      logger.warn('Experiment not found for bid floor update', {
        adapterId: update.adapterId,
        geo: update.geo,
        format: update.format,
      });
      return;
    }

    // Find candidate with matching floor (or closest)
    const candidate = experiment.candidates.find((c) => Math.abs(c.price - update.bidFloor) < 0.01);

    if (!candidate) {
      logger.warn('Candidate not found for bid floor update', {
        bidFloor: update.bidFloor,
        availableCandidates: experiment.candidates.map((c) => c.price),
      });
      return;
    }

    // Update Beta distribution parameters
    if (update.won) {
      candidate.alphaSuccesses += 1;
    } else {
      candidate.betaFailures += 1;
    }

    experiment.lastUpdated = new Date();

    // Persist to database
    await this.saveExperiment(experiment);

    logger.info('Bid floor experiment updated', {
      adapterId: update.adapterId,
      geo: update.geo,
      format: update.format,
      floor: update.bidFloor,
      won: update.won,
      alphaSuccesses: candidate.alphaSuccesses,
      betaFailures: candidate.betaFailures,
    });
  }

  /**
   * Get statistics for all experiments
   */
  async getExperimentStats(): Promise<ThompsonSamplingStats[]> {
    const stats: ThompsonSamplingStats[] = [];

  for (const [, experiment] of this.experiments.entries()) {
      // Find best performing candidate
      let bestFloor = experiment.candidates[0].price;
      let bestSuccessRate = 0;
      let totalTrials = 0;

      for (const candidate of experiment.candidates) {
        const trials = candidate.alphaSuccesses + candidate.betaFailures;
        totalTrials += trials;

        if (trials > 0) {
          const successRate = candidate.alphaSuccesses / trials;
          if (successRate > bestSuccessRate) {
            bestSuccessRate = successRate;
            bestFloor = candidate.price;
          }
        }
      }

      // Calculate confidence (inverse of coefficient of variation)
      const variance =
        experiment.candidates.reduce((sum, c) => {
          const trials = c.alphaSuccesses + c.betaFailures;
          if (trials === 0) return sum;
          const p = c.alphaSuccesses / trials;
          return sum + (p * (1 - p)) / trials;
        }, 0) / experiment.candidates.length;

      const confidence = totalTrials > 0 ? 1 - Math.sqrt(variance) : 0;

      stats.push({
        adapterId: experiment.adapterId,
        geo: experiment.geo,
        format: experiment.format,
        bestFloor,
        confidence: Math.min(confidence, 1),
        totalTrials,
        successRate: bestSuccessRate,
      });
    }

    return stats;
  }

  /**
   * Reset experiment (useful for testing or major config changes)
   */
  async resetExperiment(adapterId: string, geo: string, format: string): Promise<void> {
    const key = this.getExperimentKey(adapterId, geo, format);
    
    await query(
      `DELETE FROM thompson_sampling_experiments
       WHERE adapter_id = $1 AND geo = $2 AND format = $3`,
      [adapterId, geo, format]
    );

    this.experiments.delete(key);

    logger.info('Thompson sampling experiment reset', {
      adapterId,
      geo,
      format,
    });
  }

  /**
   * Initialize new experiment
   */
  private async initializeExperiment(
    adapterId: string,
    geo: string,
    format: string,
    currency: string
  ): Promise<BidFloorExperiment> {
    const candidates: BidFloorCandidate[] = DEFAULT_FLOOR_CANDIDATES.map((price) => ({
      price,
      alphaSuccesses: PRIOR_ALPHA,
      betaFailures: PRIOR_BETA,
    }));

    const experiment: BidFloorExperiment = {
      adapterId,
      geo,
      format,
      currency,
      candidates,
      lastUpdated: new Date(),
    };

    await this.saveExperiment(experiment);

    logger.info('Thompson sampling experiment initialized', {
      adapterId,
      geo,
      format,
      candidateFloors: DEFAULT_FLOOR_CANDIDATES,
    });

    return experiment;
  }

  /**
   * Load experiments from database
   */
  private async loadExperiments(): Promise<void> {
    try {
      const result = await query<{
        adapter_id: string;
        geo: string;
        format: string;
        currency: string;
        candidates: string;
        last_updated: Date;
      }>(
        `SELECT adapter_id, geo, format, currency, candidates, last_updated
         FROM thompson_sampling_experiments
         ORDER BY last_updated DESC`
      );

      for (const row of result.rows) {
        const key = this.getExperimentKey(row.adapter_id, row.geo, row.format);
        
        this.experiments.set(key, {
          adapterId: row.adapter_id,
          geo: row.geo,
          format: row.format,
          currency: row.currency,
          candidates: JSON.parse(row.candidates) as BidFloorCandidate[],
          lastUpdated: row.last_updated,
        });
      }

      logger.info('Thompson sampling experiments loaded', {
        count: this.experiments.size,
      });
    } catch (error) {
      logger.error('Failed to load Thompson sampling experiments', { error });
    }
  }

  /**
   * Save experiment to database
   */
  private async saveExperiment(experiment: BidFloorExperiment): Promise<void> {
    try {
      await query(
        `INSERT INTO thompson_sampling_experiments 
          (adapter_id, geo, format, currency, candidates, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (adapter_id, geo, format)
         DO UPDATE SET
           candidates = EXCLUDED.candidates,
           last_updated = EXCLUDED.last_updated`,
        [
          experiment.adapterId,
          experiment.geo,
          experiment.format,
          experiment.currency,
          JSON.stringify(experiment.candidates),
          experiment.lastUpdated,
        ]
      );
    } catch (error) {
      logger.error('Failed to save Thompson sampling experiment', { error });
    }
  }
}

// Export singleton instance
export const thompsonSamplingService = new ThompsonSamplingService();
