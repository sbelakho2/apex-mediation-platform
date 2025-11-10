import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getAuctions, getAuctionById, getAuctionSummary, getTransparencyKeys, verifyAuction, getTransparencyMetrics } from '../controllers/transparency.controller';

const router = Router();

// All Transparency endpoints require auth and are publisher-scoped
router.use(authenticate);

// GET /api/v1/transparency/auctions
router.get('/auctions', getAuctions);

// GET /api/v1/transparency/auctions/:auction_id
router.get('/auctions/:auction_id', getAuctionById);

// GET /api/v1/transparency/summary/auctions
router.get('/summary/auctions', getAuctionSummary);

// GET /api/v1/transparency/keys
router.get('/keys', getTransparencyKeys);

// GET /api/v1/transparency/auctions/:auction_id/verify
router.get('/auctions/:auction_id/verify', verifyAuction);

// GET /api/v1/transparency/metrics
router.get('/metrics', getTransparencyMetrics);

export default router;
