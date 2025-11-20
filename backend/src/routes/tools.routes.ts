import { Router } from 'express'
import { authenticate } from '../middleware/auth'
import { appAdsInspector } from '../controllers/tools.controller'

const router = Router()

// Tools routes require authentication to avoid leaking publisher diagnostics
router.use(authenticate)

// App-ads.txt inspector
router.get('/app-ads-inspector', appAdsInspector)

export default router
