/**
 * Migration Studio Routes
 */

import { Router } from 'express';
import multer from 'multer';
import {
  createExperiment,
  getExperiment,
  listExperiments,
  updateExperiment,
  activateExperiment,
  pauseExperiment,
  deleteExperiment,
  getAssignment,
  createImportJob,
  updateMapping,
  finalizeImport,
  evaluateGuardrails,
  generateReport,
} from '../controllers/migration.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

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
router.post(
  '/experiments/:id/guardrails/evaluate',
  authorize(['admin', 'publisher']),
  evaluateGuardrails
);

// Reports (readonly+ access)
router.get('/reports/:experimentId', authorize(['admin', 'publisher', 'readonly']), generateReport);

// Imports & mappings
router.post(
  '/import',
  authorize(['admin', 'publisher']),
  upload.single('file'),
  createImportJob
);
router.post(
  '/import/:id/finalize',
  authorize(['admin', 'publisher']),
  finalizeImport
);
router.put('/mappings/:id', authorize(['admin', 'publisher']), updateMapping);

// Assignment API (used by SDKs - less restricted)
router.post('/assign', getAssignment);

export default router;
