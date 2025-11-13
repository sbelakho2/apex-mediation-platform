/**
 * Migration Studio Controller
 * Handles HTTP requests for experiment management
 */

import { Request, Response, NextFunction } from 'express';
import { MigrationStudioService } from '../services/migrationStudioService';
import pool from '../utils/postgres';
import { AppError } from '../middleware/errorHandler';
import { ExperimentMode } from '../types/migration';

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

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      throw new AppError('name is required', 400);
    }

    const experiment = await migrationService.createExperiment(
      publisherId,
      userId,
      { ...req.body, name }
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
 * POST /api/v1/migration/import
 * Create migration import via CSV or connector
 */
export const createImportJob = async (
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

    const source = (req.body.source as string | undefined)?.trim();
    const placementId = (req.body.placement_id as string | undefined)?.trim();
    const experimentId = (req.body.experiment_id as string | undefined)?.trim();

    if (!source) {
      throw new AppError('source is required', 400);
    }

    if (!['csv', 'ironSource', 'applovin'].includes(source)) {
      throw new AppError('Unsupported import source', 400);
    }

    if (!placementId) {
      throw new AppError('placement_id is required', 400);
    }

    let credentials: { api_key: string; account_id: string } | undefined;
    if (req.body.credentials) {
      if (typeof req.body.credentials === 'string') {
        try {
          credentials = JSON.parse(req.body.credentials);
        } catch {
          throw new AppError('Invalid credentials payload', 400);
        }
      } else {
        credentials = req.body.credentials;
      }
    } else if (req.body.api_key || req.body.account_id) {
      credentials = {
        api_key: req.body.api_key,
        account_id: req.body.account_id,
      };
    }

    const fileBuffer = (req as any).file?.buffer as Buffer | undefined;

    const result = await migrationService.createImport({
      publisherId,
      userId,
      placementId,
      experimentId,
      source: source as 'csv' | 'ironSource' | 'applovin',
      fileBuffer,
      credentials,
    });

    res.status(201).json({
      success: true,
      data: {
        import_id: result.import.id,
        experiment_id: result.import.experiment_id,
        placement_id: result.import.placement_id,
        source: result.import.source,
        status: result.import.status,
        created_at: result.import.created_at,
        summary: result.summary,
        mappings: result.mappings,
        signed_comparison: result.signedComparison,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/migration/mappings/:id
 * Update mapping assignment and status
 */
export const updateMapping = async (
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

    const result = await migrationService.updateMapping(req.params.id, publisherId, userId, {
      ourAdapterId: req.body.our_adapter_id,
      status: req.body.status,
      notes: req.body.notes,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/migration/import/:id/finalize
 * Finalize import after mappings resolved
 */
export const finalizeImport = async (
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

    const result = await migrationService.finalizeImport(req.params.id, publisherId, userId);

    res.json({
      success: true,
      data: {
        import_id: result.import.id,
        experiment_id: result.import.experiment_id,
        placement_id: result.import.placement_id,
        source: result.import.source,
        status: result.import.status,
        created_at: result.import.created_at,
        summary: result.summary,
        mappings: result.mappings,
        signed_comparison: result.signedComparison,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/migration/experiments/:id/guardrails/evaluate
 * Evaluate guardrails for an experiment
 */
export const evaluateGuardrails = async (
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

    const result = await migrationService.evaluateGuardrails(
      req.params.id,
      publisherId,
      userId
    );

    res.json({
      success: true,
      data: result,
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
    const mode: ExperimentMode = (experiment.mode as ExperimentMode) || 'shadow';

    const featureFlags = await migrationService.getEffectiveFeatureFlags(
      experiment.publisher_id,
      experiment.app_id,
      experiment.placement_id
    );

    const modeEnabled = mode === 'shadow'
      ? featureFlags.shadowEnabled
      : featureFlags.mirroringEnabled;

    if (!modeEnabled) {
      res.json({
        success: true,
        data: {
          has_experiment: false,
          arm: 'control',
        },
      });
      return;
    }

    // Deterministic assignment
    const arm = migrationService.assignArm(
      user_identifier,
      placement_id,
      experiment.seed,
      experiment.mirror_percent
    );

    const assignmentTs = new Date().toISOString();
    const assignmentMetadata = {
      assignment_ts: assignmentTs,
      feature_flag_source: featureFlags.source,
      mode,
    };

    // Log assignment (async, don't block response)
    migrationService.logAssignment(
      experiment.id,
      arm,
      user_identifier,
      placement_id,
      assignmentMetadata
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
        assignment_ts: assignmentTs,
        mode,
        feature_flag_source: featureFlags.source,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/migration/reports/:experimentId
 * Generate side-by-side comparison report with signed verification
 */
export const generateReport = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const publisherId = req.user?.publisherId;
    const { experimentId } = req.params;

    if (!publisherId) {
      throw new AppError('Unauthorized', 401);
    }

    const result = await migrationService.generateReport(experimentId, publisherId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
