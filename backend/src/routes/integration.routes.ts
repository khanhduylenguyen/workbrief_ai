import { Router } from 'express';
import * as integrations from '../controllers/integration.controller';
import { authenticate, authenticateWebhook } from '../middleware/auth.middleware';

const router = Router();

// Zalo extension: authenticated by x-webhook-key header, not JWT.
router.post('/zalo/webhook', authenticateWebhook, integrations.zaloWebhook);
router.get('/zalo/ping', authenticateWebhook, integrations.zaloPing);

// Google redirects the browser here — identity comes from the signed `state`, not a JWT.
router.get('/gmail/callback', integrations.gmailCallback);

router.get('/overview', authenticate, integrations.getOverview);
router.post('/zalo/regenerate-key', authenticate, integrations.regenerateWebhookKey);
router.get('/gmail/connect', authenticate, integrations.gmailConnect);
router.post('/gmail/disconnect', authenticate, integrations.gmailDisconnect);
router.post('/gmail/sync', authenticate, integrations.gmailSync);

export default router;
