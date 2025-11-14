import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import * as twofaController from '../controllers/twofa.controller';
import { authenticate } from '../middleware/auth';
import { issueCsrfToken } from '../middleware/csrf';

const router = Router();

// POST /api/v1/auth/login - Authenticate user
router.post('/login', authController.login);

// POST /api/v1/auth/login/2fa - Complete 2FA step-up login using tempToken + code
router.post('/login/2fa', authController.login2fa);

// POST /api/v1/auth/register - Register new user
router.post('/register', authController.register);

// POST /api/v1/auth/refresh - Refresh access token
router.post('/refresh', authController.refresh);

// GET /api/v1/auth/csrf - Issue CSRF token cookie and return token
router.get('/csrf', issueCsrfToken);

// GET /api/v1/auth/me - Return current session user (cookie/JWT based)
router.get('/me', authenticate, authController.me);

// POST /api/v1/auth/logout - Clear auth cookies
router.post('/logout', authenticate, authController.logout);

// 2FA enrollment and verification (sandbox in-memory; no auth required)
router.post('/2fa/enroll', twofaController.enroll);
router.post('/2fa/verify', twofaController.verify);

// 2FA backup codes and disable (require auth)
router.post('/2fa/backup-codes/regenerate', authenticate, twofaController.regenerateBackupCodes);
router.post('/2fa/disable', authenticate, twofaController.disable);

export default router;
