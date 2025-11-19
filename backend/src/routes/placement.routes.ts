import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as placementController from '../controllers/placement.controller';

const router = Router();

// All placement endpoints require authentication
router.use(authenticate);

// GET /api/v1/placements - List all placements
router.get('/', placementController.list);

// GET /api/v1/placements/:id - Get single placement
router.get('/:id', placementController.getById);

// POST /api/v1/placements - Create new placement
router.post('/', placementController.create);

// PUT /api/v1/placements/:id - Update placement
router.put('/:id', placementController.update);

// PATCH /api/v1/placements/:id - Partial update with deep-merge for config
router.patch('/:id', placementController.patch);

// DELETE /api/v1/placements/:id - Delete placement
router.delete('/:id', placementController.remove);

export default router;
