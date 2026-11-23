import { Router } from 'express';
import * as integrations from '../controllers/integration.controller';
import { authenticate, authenticateWebhook } from '../middleware/auth.middleware';

const router = Router();

// Zalo extension: authenticated by x-webhook-key header, not JWT.
router.post('/zalo/webhook', authenticateWebhook, integrations.zaloWebhook);

router.get('/overview', authenticate, integrations.getOverview);
router.post('/zalo/regenerate-key', authenticate, integrations.regenerateWebhookKey);

export default router;
