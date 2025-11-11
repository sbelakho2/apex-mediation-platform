import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requestBid, getStatus } from '../controllers/rtb.controller';
import { getCreative, trackClick, trackImpression } from '../controllers/rtbTracking.controller';
import { validate } from '../middleware/validation';
import { trackingRateLimiter } from '../middleware/trackingRateLimiter';
import { AuctionRequestSchema } from '../schemas/rtb';

const router = Router();

// Protected auction endpoints
router.post('/bid', authenticate, validate(AuctionRequestSchema), requestBid);
router.get('/status', authenticate, getStatus);

// Public delivery and tracking endpoints (rate-limited)
router.get('/creative', getCreative);
router.get('/t/imp', trackingRateLimiter, trackImpression);
router.get('/t/click', trackingRateLimiter, trackClick);

export default router;
