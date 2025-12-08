import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { appAdsInspector, supplyChainStatus } from '../controllers/tools.controller'

const router = Router()

// Tools routes require authentication to avoid leaking publisher diagnostics
router.use(authenticate)

// App-ads.txt inspector
router.get('/app-ads-inspector', appAdsInspector)

// Supply chain status lookup
router.get('/supply-chain-status', supplyChainStatus)

export default router
