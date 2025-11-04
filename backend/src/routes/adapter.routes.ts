import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as adapterController from '../controllers/adapter.controller';

const router = Router();

// All adapter endpoints require authentication
router.use(authenticate);

// GET /api/v1/adapters - List all adapter configs
router.get('/', adapterController.list);

// POST /api/v1/adapters - Create adapter config
router.post('/', adapterController.create);

// GET /api/v1/adapters/:id - Get single adapter config
router.get('/:id', adapterController.getById);

// PUT /api/v1/adapters/:id - Update adapter config
router.put('/:id', adapterController.update);

// DELETE /api/v1/adapters/:id - Delete adapter config
router.delete('/:id', adapterController.deleteConfig);

export default router;
