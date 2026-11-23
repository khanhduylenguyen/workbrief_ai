import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

// NOTE: there is intentionally no public /register route — accounts are created by admins.
const router = Router();

router.post('/login', auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', authenticate, auth.logout);
router.get('/me', authenticate, auth.me);
router.patch('/me', authenticate, auth.updateMe);
router.post('/me/test-reminder', authenticate, auth.sendTestReminder);
router.patch('/change-password', authenticate, auth.changePassword);

export default router;
