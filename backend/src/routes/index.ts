import { Router } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../utils/apiResponse';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import cronRoutes from './cron.routes';
import colleagueRoutes from './colleague.routes';
import integrationRoutes from './integration.routes';
import taskRoutes from './task.routes';

const router = Router();

router.get('/health', (_req, res) => {
  sendSuccess(
    res,
    {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    },
    'WorkBrief AI API is running',
  );
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/tasks', taskRoutes);
router.use('/colleagues', colleagueRoutes);
router.use('/integrations', integrationRoutes);
router.use('/cron', cronRoutes);

export default router;
