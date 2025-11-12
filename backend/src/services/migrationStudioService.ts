/**
 * Migration Studio Service
 * Handles experiment management, assignment logic, and guardrail evaluation
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import {
  MigrationExperiment,
  MigrationMapping,
  MigrationEvent,
  CreateExperimentRequest,
  UpdateExperimentRequest,
  ActivateExperimentRequest,
  ExperimentArm,
  Guardrails,
} from '../types/migration';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

export class MigrationStudioService {
  constructor(private pool: Pool) {}

  /**
   * Create a new migration experiment
   */
  async createExperiment(
    publisherId: string,
    userId: string,
    data: CreateExperimentRequest
  ): Promise<MigrationExperiment> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Validate placement exists and belongs to publisher
      if (data.placement_id) {
        const placementCheck = await client.query(
          `SELECT p.id FROM placements p
           JOIN apps a ON p.app_id = a.id
           WHERE p.id = $1 AND a.publisher_id = $2`,
          [data.placement_id, publisherId]
        );
        
        if (placementCheck.rows.length === 0) {
          throw new AppError('Placement not found or access denied', 404);
        }
      }

      // Create experiment
      const result = await client.query(
        `INSERT INTO migration_experiments (
          publisher_id, name, description, app_id, placement_id, 
          objective, seed, guardrails, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          publisherId,
          data.name,
          data.description || null,
          data.app_id || null,
          data.placement_id || null,
          data.objective || 'revenue_comparison',
          data.seed || crypto.randomUUID(),
          JSON.stringify(data.guardrails || {}),
          userId,
        ]
      );

      const experiment = result.rows[0];

      // Audit log
      await client.query(
        `INSERT INTO migration_audit (
          experiment_id, user_id, action, resource_type, resource_id, new_value
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          experiment.id,
          userId,
          'create',
          'experiment',
          experiment.id,
          JSON.stringify(experiment),
        ]
      );

      await client.query('COMMIT');
      
      logger.info('Migration experiment created', { experimentId: experiment.id, publisherId });
      return this.mapExperiment(experiment);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get experiment by ID (with publisher scope check)
   */
  async getExperiment(experimentId: string, publisherId: string): Promise<MigrationExperiment> {
    const result = await this.pool.query(
      `SELECT * FROM migration_experiments WHERE id = $1 AND publisher_id = $2`,
      [experimentId, publisherId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Experiment not found', 404);
    }

    return this.mapExperiment(result.rows[0]);
  }

  /**
   * List experiments for a publisher
   */
  async listExperiments(
    publisherId: string,
    filters?: { status?: string; placement_id?: string }
  ): Promise<MigrationExperiment[]> {
    let query = 'SELECT * FROM migration_experiments WHERE publisher_id = $1';
    const params: any[] = [publisherId];

    if (filters?.status) {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    if (filters?.placement_id) {
      params.push(filters.placement_id);
      query += ` AND placement_id = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapExperiment(row));
  }

  /**
   * Update experiment (draft/paused only)
   */
  async updateExperiment(
    experimentId: string,
    publisherId: string,
    userId: string,
    data: UpdateExperimentRequest
  ): Promise<MigrationExperiment> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get existing experiment
      const existing = await client.query(
        `SELECT * FROM migration_experiments WHERE id = $1 AND publisher_id = $2`,
        [experimentId, publisherId]
      );

      if (existing.rows.length === 0) {
        throw new AppError('Experiment not found', 404);
      }

      const exp = existing.rows[0];

      // Only allow updates to draft or paused experiments
      if (!['draft', 'paused'].includes(exp.status)) {
        throw new AppError('Cannot update active or completed experiment', 400);
      }

      // Build update query
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (data.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        params.push(data.name);
      }

      if (data.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(data.description);
      }

      if (data.mirror_percent !== undefined) {
        if (data.mirror_percent < 0 || data.mirror_percent > 20) {
          throw new AppError('mirror_percent must be between 0 and 20', 400);
        }
        updates.push(`mirror_percent = $${paramIndex++}`);
        params.push(data.mirror_percent);
      }

      if (data.guardrails !== undefined) {
        const mergedGuardrails = { ...exp.guardrails, ...data.guardrails };
        updates.push(`guardrails = $${paramIndex++}`);
        params.push(JSON.stringify(mergedGuardrails));
      }

      if (updates.length === 0) {
        throw new AppError('No updates provided', 400);
      }

      updates.push(`updated_at = NOW()`);
      params.push(experimentId, publisherId);

      const result = await client.query(
        `UPDATE migration_experiments 
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex++} AND publisher_id = $${paramIndex++}
         RETURNING *`,
        params
      );

      // Audit log
      await client.query(
        `INSERT INTO migration_audit (
          experiment_id, user_id, action, resource_type, resource_id, old_value, new_value
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          experimentId,
          userId,
          'update',
          'experiment',
          experimentId,
          JSON.stringify(exp),
          JSON.stringify(result.rows[0]),
        ]
      );

      await client.query('COMMIT');
      
      return this.mapExperiment(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Activate experiment (start mirroring traffic)
   */
  async activateExperiment(
    experimentId: string,
    publisherId: string,
    userId: string,
    data: ActivateExperimentRequest
  ): Promise<MigrationExperiment> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE migration_experiments
         SET status = 'active',
             mirror_percent = $1,
             activated_at = NOW(),
             updated_at = NOW()
         WHERE id = $2 AND publisher_id = $3 AND status IN ('draft', 'paused')
         RETURNING *`,
        [data.mirror_percent, experimentId, publisherId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Experiment not found or cannot be activated', 404);
      }

      // Log activation event
      await client.query(
        `INSERT INTO migration_events (experiment_id, event_type, reason, triggered_by)
         VALUES ($1, $2, $3, $4)`,
        [experimentId, 'activation', `Activated with ${data.mirror_percent}% mirror`, userId]
      );

      // Audit log
      await client.query(
        `INSERT INTO migration_audit (experiment_id, user_id, action, resource_type, resource_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [experimentId, userId, 'activate', 'experiment', experimentId]
      );

      await client.query('COMMIT');

      logger.info('Experiment activated', { experimentId, mirrorPercent: data.mirror_percent });
      return this.mapExperiment(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Pause experiment (stop traffic mirroring)
   */
  async pauseExperiment(
    experimentId: string,
    publisherId: string,
    userId: string,
    reason?: string
  ): Promise<MigrationExperiment> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE migration_experiments
         SET status = 'paused',
             paused_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND publisher_id = $2 AND status = 'active'
         RETURNING *`,
        [experimentId, publisherId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Experiment not found or not active', 404);
      }

      // Log deactivation event
      await client.query(
        `INSERT INTO migration_events (experiment_id, event_type, reason, triggered_by)
         VALUES ($1, $2, $3, $4)`,
        [experimentId, 'deactivation', reason || 'Manual pause', userId]
      );

      await client.query('COMMIT');

      logger.info('Experiment paused', { experimentId, reason });
      return this.mapExperiment(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Deterministic assignment: hash(user, placement, seed) < mirror_percent → test
   */
  assignArm(
    userIdentifier: string,
    placementId: string,
    seed: string,
    mirrorPercent: number
  ): ExperimentArm {
    const hash = createHash('sha256')
      .update(`${userIdentifier}:${placementId}:${seed}`)
      .digest('hex');

    // Take first 8 hex chars and convert to percentage (0-100)
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const percentage = (hashInt % 100) / 100; // 0.00 to 0.99

    return percentage < (mirrorPercent / 100) ? 'test' : 'control';
  }

  /**
   * Log assignment decision
   */
  async logAssignment(
    experimentId: string,
    arm: ExperimentArm,
    userIdentifier: string,
    placementId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Hash user identifier for privacy
    const hashedUser = createHash('sha256').update(userIdentifier).digest('hex');

    await this.pool.query(
      `INSERT INTO migration_events (
        experiment_id, event_type, arm, user_identifier, placement_id, event_data
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        experimentId,
        'assignment',
        arm,
        hashedUser,
        placementId,
        JSON.stringify(metadata || {}),
      ]
    );
  }

  /**
   * Evaluate guardrails and pause if violated
   */
  async evaluateGuardrails(experimentId: string, publisherId: string): Promise<{
    shouldPause: boolean;
    violations: string[];
  }> {
    // This would query ClickHouse for metrics and compare against guardrails
    // For now, return stub
    return {
      shouldPause: false,
      violations: [],
    };
  }

  /**
   * Delete experiment (soft delete to archived)
   */
  async deleteExperiment(
    experimentId: string,
    publisherId: string,
    userId: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE migration_experiments
         SET status = 'archived', updated_at = NOW()
         WHERE id = $1 AND publisher_id = $2 AND status IN ('draft', 'paused', 'completed')
         RETURNING id`,
        [experimentId, publisherId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Experiment not found or cannot be deleted', 404);
      }

      // Audit log
      await client.query(
        `INSERT INTO migration_audit (experiment_id, user_id, action, resource_type, resource_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [experimentId, userId, 'delete', 'experiment', experimentId]
      );

      await client.query('COMMIT');
      logger.info('Experiment archived', { experimentId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapExperiment(row: any): MigrationExperiment {
    return {
      id: row.id,
      publisher_id: row.publisher_id,
      name: row.name,
      description: row.description,
      app_id: row.app_id,
      placement_id: row.placement_id,
      objective: row.objective,
      seed: row.seed,
      mirror_percent: row.mirror_percent,
      status: row.status,
      activated_at: row.activated_at,
      paused_at: row.paused_at,
      completed_at: row.completed_at,
      guardrails: row.guardrails,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
