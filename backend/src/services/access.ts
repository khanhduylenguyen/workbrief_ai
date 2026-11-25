import { env } from '../config/env';
import type { UserDocument } from '../models/User';

/** Online payment is configured (VNPay credentials present). */
export function isBillingEnabled(): boolean {
  return !!env.VNPAY_TMN_CODE.trim() && !!env.VNPAY_HASH_SECRET.trim();
}

/** Access is active while the trial OR the paid period has not ended (trialExpiresAt null = unlimited). */
export function accessInfo(user: Pick<UserDocument, 'trialExpiresAt' | 'subscription'>, now = new Date()) {
  const paidEnd = user.subscription?.currentPeriodEnd ?? null;
  const unlimited = user.trialExpiresAt === null && !paidEnd;
  const trialActive = !!user.trialExpiresAt && user.trialExpiresAt > now;
  const paidActive = !!paidEnd && paidEnd > now;
  const ends = [user.trialExpiresAt, paidEnd].filter((d): d is Date => !!d && d > now);
  const expiresAt = unlimited ? null : ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : (paidEnd ?? user.trialExpiresAt);
  return {
    active: unlimited || trialActive || paidActive,
    unlimited,
    paidActive,
    plan: paidActive ? (user.subscription?.plan ?? null) : null,
    expiresAt,
    daysLeft: expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)) : null,
  };
}
