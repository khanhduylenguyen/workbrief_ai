import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User, type UserDocument, type UserRole } from '../models/User';
import { accessInfo, isBillingEnabled } from '../services/access';
import { ApiError } from '../utils/ApiError';
import { verifyAccessToken } from '../utils/jwt';

type AccessUser = Pick<UserDocument, 'status' | 'trialExpiresAt' | 'subscription'>;

export function assertNotSuspended(user: Pick<UserDocument, 'status'>): void {
  if (user.status !== 'ACTIVE') {
    throw new ApiError(403, 'Tài khoản của bạn đã bị khoá. Vui lòng liên hệ quản trị viên.', {
      code: 'ACCOUNT_SUSPENDED',
    });
  }
}

/**
 * Throws if the account may not use the system:
 * - status must be ACTIVE
 * - the trial or a paid subscription must still be running (trialExpiresAt null = unlimited)
 */
export function assertAccountUsable(user: AccessUser): void {
  assertNotSuspended(user);
  const access = accessInfo(user);
  if (!access.active) {
    const billing = isBillingEnabled();
    const hadPaid = !!user.subscription?.currentPeriodEnd;
    throw new ApiError(
      403,
      hadPaid
        ? billing
          ? 'Gói của bạn đã hết hạn. Vui lòng gia hạn để tiếp tục sử dụng.'
          : 'Gói của bạn đã hết hạn. Vui lòng liên hệ quản trị viên để gia hạn.'
        : billing
          ? 'Tài khoản dùng thử đã hết hạn. Chọn gói để tiếp tục sử dụng.'
          : 'Tài khoản dùng thử đã hết hạn. Vui lòng liên hệ quản trị viên để gia hạn.',
      { code: 'TRIAL_EXPIRED', expiresAt: access.expiresAt, paywall: billing },
    );
  }
}

/**
 * Sign-in rules: suspended accounts never; expired accounts only when online payment is enabled
 * (they land on the billing page — the paywall — to renew).
 */
export function assertCanSignIn(user: AccessUser): void {
  assertNotSuspended(user);
  if (isBillingEnabled()) return;
  assertAccountUsable(user);
}

/** Routes an expired (but paying-capable) account may still call. */
const PAYWALL_ALLOWED = [/^\/api\/auth\/(me|logout|change-password)(\/|$|\?)/, /^\/api\/billing(\/|$|\?)/];

function isPaywallAllowed(req: Request): boolean {
  const path = req.originalUrl.split('?')[0]!;
  return PAYWALL_ALLOWED.some((re) => re.test(path));
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/** Requires a valid access token and a usable (ACTIVE, non-expired) account. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) throw ApiError.unauthorized('Thiếu access token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new ApiError(401, 'Access token đã hết hạn', { code: 'TOKEN_EXPIRED' });
    }
    throw ApiError.unauthorized('Access token không hợp lệ');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại');

  // Checked before tokenVersion: suspension also bumps tokenVersion, and the client should
  // get the specific "suspended / trial expired" reason rather than a generic session error.
  try {
    assertAccountUsable(user);
  } catch (err) {
    // Paywall: an expired account may still reach its profile and the billing endpoints to renew.
    const code = (err as ApiError).details as { code?: string } | null;
    if (code?.code !== 'TRIAL_EXPIRED' || !isBillingEnabled() || !isPaywallAllowed(req)) throw err;
    req.accessExpired = true;
  }

  if (user.tokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized('Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại');
  }

  req.user = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw ApiError.unauthorized();
    if (!roles.includes(req.user.role)) throw ApiError.forbidden();
    next();
  };
}

/** Authenticates Zalo Extension calls via the `x-webhook-key` header. */
export async function authenticateWebhook(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const key = req.header('x-webhook-key')?.trim();
  if (!key) throw ApiError.unauthorized('Thiếu header x-webhook-key');

  const user = await User.findOne({ webhookApiKey: key });
  if (!user) throw ApiError.unauthorized('Webhook key không hợp lệ');

  assertAccountUsable(user);

  req.user = user;
  next();
}

/** Narrow `req.user` for handlers mounted after `authenticate`. */
export function getAuthUser(req: Request): UserDocument {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
