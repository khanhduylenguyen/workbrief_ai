import { Router } from 'express';
import * as cron from '../controllers/cron.controller';

// Called by Vercel Cron (GET) and external schedulers (GET/POST). Auth: CRON_SECRET.
const router = Router();

router.use(cron.requireCronSecret);
router.get('/daily', cron.cronDaily);
router.post('/daily', cron.cronDaily);
router.get('/gmail-sync', cron.cronGmailSync);
router.post('/gmail-sync', cron.cronGmailSync);

export default router;
