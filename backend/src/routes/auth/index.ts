import { Router } from 'express';
import sessionRoutes from './session.routes';
import registerRoutes from './register.routes';
import twofaRoutes from './twofa.routes';

const router = Router();

router.use(sessionRoutes);
router.use(registerRoutes);
router.use('/2fa', twofaRoutes);

export default router;
