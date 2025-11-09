import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getAuctions, getAuctionById, getAuctionSummary } from '../controllers/transparency.controller';

const router = Router();

// All Transparency endpoints require auth and are publisher-scoped
router.use(authenticate);

// GET /api/v1/transparency/auctions
router.get('/auctions', getAuctions);

// GET /api/v1/transparency/auctions/:auction_id
router.get('/auctions/:auction_id', getAuctionById);

// GET /api/v1/transparency/summary/auctions
router.get('/summary/auctions', getAuctionSummary);

export default router;
