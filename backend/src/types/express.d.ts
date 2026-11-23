import type { UserDocument } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate` (JWT) or `authenticateWebhook` (x-webhook-key). */
      user?: UserDocument;
    }
  }
}

export {};
