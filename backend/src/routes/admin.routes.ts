import { Router } from 'express';
import * as admin from '../controllers/admin.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/users', admin.listUsers);
router.post('/users', admin.createTrialUser);
router.get('/users/:id', admin.getUser);
router.patch('/users/:id/extend-trial', admin.extendTrial);
router.patch('/users/:id/reset-quota', admin.resetQuota);
router.patch('/users/:id/status', admin.updateUserStatus);
router.get('/telegram', admin.telegramStatus);
router.post('/telegram/setup', admin.telegramSetup);

export default router;
