import { Router } from 'express';
import * as authController from '../../controllers/auth.controller';

const router = Router();

// POST /api/v1/auth/register - Register new user
router.post('/register', authController.register);

export default router;
