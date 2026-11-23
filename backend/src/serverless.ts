import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { connectDatabase } from './config/db';
import { createApp } from './createApp';
import { seedAdmin } from './seed/seedAdmin';
import { sendError } from './utils/apiResponse';

/**
 * Serverless entry (Vercel). There is no `app.listen()` here: the platform calls the exported app
 * per request. The DB connection + admin seed run once per warm instance and are reused.
 */
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (mongoose.connection.readyState === 1 && ready) return ready;
  ready ??= (async () => {
    await connectDatabase();
    await seedAdmin();
  })().catch((err) => {
    ready = null; // allow the next request to retry
    throw err;
  });
  return ready;
}

const app = createApp({
  beforeRoutes: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await ensureReady();
      next();
    } catch (err) {
      console.error('❌ Database not ready:', err);
      sendError(res, 503, 'Máy chủ chưa kết nối được cơ sở dữ liệu, vui lòng thử lại sau.');
    }
  },
});

export default app;
