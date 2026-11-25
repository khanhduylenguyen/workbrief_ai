import { Router } from 'express';
import * as admin from '../controllers/admin.controller';
import * as team from '../controllers/team.controller';
import * as billing from '../controllers/billing.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/users', admin.listUsers);
router.post('/users', admin.createTrialUser);
router.get('/users/:id', admin.getUser);
router.patch('/users/:id/extend-trial', admin.extendTrial);
router.patch('/users/:id/reset-quota', admin.resetQuota);
router.patch('/users/:id/status', admin.updateUserStatus);
router.get('/orders', billing.adminOrders);
router.get('/teams', team.adminTeams);
router.post('/teams', team.adminCreate);
router.patch('/teams/:id', team.adminUpdate);
router.delete('/teams/:id', team.adminDelete);
router.post('/teams/:id/members', team.adminAdd);
router.delete('/teams/:id/members/:userId', team.adminRemove);
router.get('/telegram', admin.telegramStatus);
router.post('/telegram/setup', admin.telegramSetup);

export default router;
