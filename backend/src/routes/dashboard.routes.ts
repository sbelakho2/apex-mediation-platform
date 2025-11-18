import { Router } from 'express';
import { getOverview, getKpis } from '../controllers/dashboard.controller';

const router = Router();

// GET /api/v1/dashboard/overview
router.get('/overview', getOverview);

// GET /api/v1/dashboard/kpis
router.get('/kpis', getKpis);

export default router;
