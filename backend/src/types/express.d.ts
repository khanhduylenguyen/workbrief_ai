import type { UserDocument } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate` (JWT) or `authenticateWebhook` (x-webhook-key). */
      user?: UserDocument;
      /** Set when the account is past its trial/paid period but allowed through the paywall routes. */
      accessExpired?: boolean;
    }
  }
}

export {};
