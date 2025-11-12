/**
 * Migration Studio Controller
 * Handles HTTP requests for experiment management
 */

import { Request, Response, NextFunction } from 'express';
import { MigrationStudioService } from '../services/migrationStudioService';
import pool from '../utils/postgres';
import { AppError } from '../middleware/errorHandler';

const migrationService = new MigrationStudioService(pool);

/**
 * POST /api/v1/migration/experiments
 * Create a new migration experiment
 */
export const createExperiment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const userId = req.user?.userId;

    if (!publisherId || !userId) {
      throw new AppError('Unauthorized', 401);
    }

    const experiment = await migrationService.createExperiment(
      publisherId,
      userId,
      req.body
    );

    res.status(201).json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/migration/experiments/:id
 * Get experiment by ID
 */
export const getExperiment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const { id } = req.params;

    if (!publisherId) {
      throw new AppError('Unauthorized', 401);
    }

    const experiment = await migrationService.getExperiment(id, publisherId);

    res.json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/migration/experiments
 * List all experiments for publisher
 */
export const listExperiments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;

    if (!publisherId) {
      throw new AppError('Unauthorized', 401);
    }

    const filters = {
      status: req.query.status as string | undefined,
      placement_id: req.query.placement_id as string | undefined,
    };

    const experiments = await migrationService.listExperiments(publisherId, filters);

    res.json({
      success: true,
      data: experiments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/migration/experiments/:id
 * Update experiment
 */
export const updateExperiment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!publisherId || !userId) {
      throw new AppError('Unauthorized', 401);
    }

    const experiment = await migrationService.updateExperiment(
      id,
      publisherId,
      userId,
      req.body
    );

    res.json({
      success: true,
      data: experiment,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/migration/experiments/:id/activate
 * Activate experiment (start mirroring)
 */
export const activateExperiment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!publisherId || !userId) {
      throw new AppError('Unauthorized', 401);
    }

    const experiment = await migrationService.activateExperiment(
      id,
      publisherId,
      userId,
      req.body
    );

    res.json({
      success: true,
      data: experiment,
      message: `Experiment activated with ${experiment.mirror_percent}% traffic mirroring`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/migration/experiments/:id/pause
 * Pause experiment (stop mirroring)
 */
export const pauseExperiment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!publisherId || !userId) {
      throw new AppError('Unauthorized', 401);
    }

    const experiment = await migrationService.pauseExperiment(
      id,
      publisherId,
      userId,
      req.body.reason
    );

    res.json({
      success: true,
      data: experiment,
      message: 'Experiment paused',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/migration/experiments/:id
 * Delete (archive) experiment
 */
export const deleteExperiment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!publisherId || !userId) {
      throw new AppError('Unauthorized', 401);
    }

    await migrationService.deleteExperiment(id, publisherId, userId);

    res.json({
      success: true,
      message: 'Experiment archived',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/migration/assign
 * Get experiment assignment for a user (used by SDKs)
 */
export const getAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { user_identifier, placement_id } = req.body;

    if (!user_identifier || !placement_id) {
      throw new AppError('user_identifier and placement_id required', 400);
    }

    // Find active experiment for this placement
    const result = await pool.query(
      `SELECT * FROM migration_experiments 
       WHERE placement_id = $1 AND status = 'active'
       LIMIT 1`,
      [placement_id]
    );

    if (result.rows.length === 0) {
      // No active experiment for this placement
      res.json({
        success: true,
        data: {
          has_experiment: false,
          arm: 'control',
        },
      });
      return;
    }

    const experiment = result.rows[0];

    // Deterministic assignment
    const arm = migrationService.assignArm(
      user_identifier,
      placement_id,
      experiment.seed,
      experiment.mirror_percent
    );

    // Log assignment (async, don't block response)
    migrationService.logAssignment(
      experiment.id,
      arm,
      user_identifier,
      placement_id
    ).catch(err => {
      console.error('Failed to log assignment:', err);
    });

    res.json({
      success: true,
      data: {
        has_experiment: true,
        experiment_id: experiment.id,
        arm,
        mirror_percent: experiment.mirror_percent,
      },
    });
  } catch (error) {
    next(error);
  }
};
