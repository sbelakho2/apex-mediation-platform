import { Router } from 'express';
import * as authController from '../../controllers/auth.controller';
import { authenticate } from '../../middleware/auth';
import { issueCsrfToken } from '../../middleware/csrf';

const router = Router();

// POST /api/v1/auth/login - Authenticate user
router.post('/login', authController.login);

// POST /api/v1/auth/login/2fa - Complete 2FA step-up login using tempToken + code
router.post('/login/2fa', authController.login2fa);

// POST /api/v1/auth/refresh - Refresh access token
router.post('/refresh', authController.refresh);

// GET /api/v1/auth/csrf - Issue CSRF token cookie and return token
router.get('/csrf', issueCsrfToken);

// GET /api/v1/auth/me - Return current session user (cookie/JWT based)
router.get('/me', authenticate, authController.me);

// POST /api/v1/auth/logout - Clear auth cookies
router.post('/logout', authenticate, authController.logout);

export default router;
