import { Router } from 'express';
import { listKeys, createKey, rotateKey, deleteKey } from '../controllers/apiKeys.controller';

const router = Router();

// GET /api/v1/keys
router.get('/', listKeys);

// POST /api/v1/keys { live?: boolean }
router.post('/', createKey);

// POST /api/v1/keys/:id/rotate
router.post('/:id/rotate', rotateKey);

// DELETE /api/v1/keys/:id
router.delete('/:id', deleteKey);

export default router;
