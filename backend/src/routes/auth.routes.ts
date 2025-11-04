import { Router } from 'express';
import * as authController from '../controllers/auth.controller';

const router = Router();

// POST /api/v1/auth/login - Authenticate user
router.post('/login', authController.login);

// POST /api/v1/auth/register - Register new user
router.post('/register', authController.register);

// POST /api/v1/auth/refresh - Refresh access token
router.post('/refresh', authController.refresh);

export default router;
