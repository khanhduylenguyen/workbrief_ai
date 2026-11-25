import { Router } from 'express';
import * as ai from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/weekly-report', ai.weeklyReport);
router.post('/assistant', ai.assistant);
router.post('/meeting', ai.meeting);

export default router;
