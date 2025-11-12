/**
 * Migration Studio Routes
 */

import { Router } from 'express';
import {
  createExperiment,
  getExperiment,
  listExperiments,
  updateExperiment,
  activateExperiment,
  pauseExperiment,
  deleteExperiment,
  getAssignment,
} from '../controllers/migration.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Experiment CRUD (admin/publisher only)
router.post('/experiments', authorize(['admin', 'publisher']), createExperiment);
router.get('/experiments', authorize(['admin', 'publisher', 'readonly']), listExperiments);
router.get('/experiments/:id', authorize(['admin', 'publisher', 'readonly']), getExperiment);
router.put('/experiments/:id', authorize(['admin', 'publisher']), updateExperiment);
router.delete('/experiments/:id', authorize(['admin', 'publisher']), deleteExperiment);

// Experiment lifecycle (admin/publisher only)
router.post('/experiments/:id/activate', authorize(['admin', 'publisher']), activateExperiment);
router.post('/experiments/:id/pause', authorize(['admin', 'publisher']), pauseExperiment);

// Assignment API (used by SDKs - less restricted)
router.post('/assign', getAssignment);

export default router;
