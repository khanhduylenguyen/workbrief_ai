import cors from 'cors';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import apiRoutes from './routes';
import { sendSuccess } from './utils/apiResponse';

export interface CreateAppOptions {
  /** Runs before the API routes (serverless uses it to make sure the DB is connected). */
  beforeRoutes?: RequestHandler;
}

export function createApp({ beforeRoutes }: CreateAppOptions = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (no Origin header) and whitelisted origins.
        if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-webhook-key'],
    }),
  );
  // File uploads (base64 images / PDF / audio) get a larger body limit than the rest of the API.
  app.use(['/api/tasks/ai-summarize-file', '/api/ai/meeting', '/api/guides/ai-extract'], express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));

  app.get('/', (_req, res) => {
    sendSuccess(res, { name: 'WorkBrief AI API', health: '/api/health' }, 'WorkBrief AI API');
  });

  if (beforeRoutes) app.use('/api', beforeRoutes);
  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
