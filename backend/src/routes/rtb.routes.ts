import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requestBid, getStatus } from '../controllers/rtb.controller';

const router = Router();

router.use(authenticate);
router.post('/bid', requestBid);
router.get('/status', getStatus);

export default router;
