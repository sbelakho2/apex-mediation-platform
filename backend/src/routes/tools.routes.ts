import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { appAdsInspector, supplyChainStatus, supplyChainSummary } from '../controllers/tools.controller'

const router = Router()

// Tools routes require authentication to avoid leaking publisher diagnostics
router.use(authenticate)

// App-ads.txt inspector
router.get('/app-ads-inspector', appAdsInspector)

// Supply chain status lookup
router.get('/supply-chain-status', supplyChainStatus)

// Supply chain summary (per app) and snapshot
router.get('/supply-chain/summary', supplyChainSummary)

export default router
