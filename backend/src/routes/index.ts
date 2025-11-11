import { Router } from 'express';
import revenueRoutes from './revenue.routes';
import placementRoutes from './placement.routes';
import adapterRoutes from './adapter.routes';
import fraudRoutes from './fraud.routes';
import payoutRoutes from './payout.routes';
import analyticsRoutes from './analytics.routes';
import reportingRoutes from './reporting.routes';
import rtbRoutes from './rtb.routes';
import authRoutes from './auth.routes';
import skadnetworkRoutes from './skadnetwork.routes';
import consentRoutes from './consent.routes';
import abTestingRoutes from './abTesting.routes';
import dataExportRoutes from './dataExport.routes';
import queuesRoutes from './queues.routes';
import transparencyRoutes from './transparency.routes';
import metaRoutes from './meta.routes';
import billingRoutes from './billing.routes';
import webhooksRoutes from './webhooks.routes';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/meta', metaRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/revenue', revenueRoutes);
router.use('/placements', placementRoutes);
router.use('/adapters', adapterRoutes);
router.use('/fraud', fraudRoutes);
router.use('/payouts', payoutRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reporting', reportingRoutes);
router.use('/rtb', rtbRoutes);
router.use('/skadnetwork', skadnetworkRoutes);
router.use('/consent', consentRoutes);
router.use('/ab-testing', abTestingRoutes);
router.use('/data-export', dataExportRoutes);
router.use('/queues', queuesRoutes);
router.use('/transparency', transparencyRoutes);
router.use('/billing', billingRoutes);

export default router;
