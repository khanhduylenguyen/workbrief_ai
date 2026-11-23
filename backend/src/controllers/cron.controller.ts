import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { assertAccountUsable } from '../middleware/auth.middleware';
import { User } from '../models/User';
import { isGmailConfigured, syncGmail } from '../services/gmail.service';
import { isMailConfigured } from '../services/mail.service';
import { sendDigest } from '../services/reminder.service';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { zonedDayRange } from '../utils/time';

/** Stop picking up new users after this long so the run finishes inside the function time limit. */
const TIME_BUDGET_MS = 240_000;

/**
 * Cron calls must carry CRON_SECRET, either as `Authorization: Bearer <secret>` (what Vercel Cron sends)
 * or `x-cron-secret: <secret>` (handy for GitHub Actions / cron-job.org).
 */
export function requireCronSecret(req: Request, _res: Response, next: NextFunction): void {
  if (!env.CRON_SECRET) {
    throw new ApiError(503, 'Chưa cấu hình CRON_SECRET trên máy chủ.', { code: 'CRON_NOT_CONFIGURED' });
  }
  const header = req.header('authorization');
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : req.header('x-cron-secret') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CRON_SECRET);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw ApiError.unauthorized('CRON_SECRET không hợp lệ');
  next();
}

interface GmailCronSummary {
  eligible: number;
  synced: number;
  skippedRecent: number;
  skippedTimeBudget: number;
  created: number;
  errors: { email: string; error: string }[];
}

async function runScheduledGmailSync(startedAt: number): Promise<GmailCronSummary> {
  const summary: GmailCronSummary = { eligible: 0, synced: 0, skippedRecent: 0, skippedTimeBudget: 0, created: 0, errors: [] };
  if (!isGmailConfigured()) return summary;

  const minInterval = env.GMAIL_AUTO_SYNC_MIN_INTERVAL_MINUTES * 60_000;
  const users = await User.find({
    status: 'ACTIVE',
    'gmailIntegration.isConnected': true,
    'settings.autoGmailSync': { $ne: false },
    $expr: { $lt: ['$aiQuotaUsed', '$aiQuotaLimit'] },
  }).sort({ 'gmailIntegration.lastSyncedAt': 1 }); // least recently synced first

  for (const user of users) {
    try {
      assertAccountUsable(user); // skips expired trials
    } catch {
      continue;
    }
    summary.eligible++;
    const last = user.gmailIntegration?.lastSyncedAt?.getTime() ?? 0;
    if (Date.now() - last < minInterval) {
      summary.skippedRecent++;
      continue;
    }
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      summary.skippedTimeBudget++;
      continue;
    }
    try {
      const result = await syncGmail(user._id);
      summary.synced++;
      summary.created += result.created;
    } catch (err) {
      summary.errors.push({ email: user.email, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return summary;
}

interface DigestCronSummary {
  eligible: number;
  sent: number;
  nothingToSend: number;
  alreadySentToday: number;
  errors: { email: string; error: string }[];
}

async function runDailyDigest(): Promise<DigestCronSummary> {
  const summary: DigestCronSummary = { eligible: 0, sent: 0, nothingToSend: 0, alreadySentToday: 0, errors: [] };
  if (!isMailConfigured()) return summary;

  const todayStart = zonedDayRange(new Date(), env.APP_TIMEZONE).start;
  const users = await User.find({ status: 'ACTIVE', 'settings.emailDigest': { $ne: false } });

  for (const user of users) {
    try {
      assertAccountUsable(user);
    } catch {
      continue;
    }
    summary.eligible++;
    if (user.lastDigestAt && user.lastDigestAt >= todayStart) {
      summary.alreadySentToday++;
      continue;
    }
    try {
      const { sent } = await sendDigest(user);
      if (sent) summary.sent++;
      else summary.nothingToSend++;
    } catch (err) {
      summary.errors.push({ email: user.email, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return summary;
}

/** Frequent job (e.g. every 30 min from GitHub Actions): Gmail auto-sync only. */
export async function cronGmailSync(_req: Request, res: Response) {
  const startedAt = Date.now();
  const gmail = await runScheduledGmailSync(startedAt);
  console.log('⏰ cron gmail-sync', JSON.stringify(gmail));
  return sendSuccess(res, { gmail, durationMs: Date.now() - startedAt }, 'Đã chạy đồng bộ Gmail theo lịch');
}

/** Daily job (Vercel Cron): reminder emails first, then a Gmail sync pass. */
export async function cronDaily(_req: Request, res: Response) {
  const startedAt = Date.now();
  const digest = await runDailyDigest();
  const gmail = await runScheduledGmailSync(startedAt);
  console.log('⏰ cron daily', JSON.stringify({ digest, gmail }));
  return sendSuccess(
    res,
    { digest, gmail, mailConfigured: isMailConfigured(), gmailConfigured: isGmailConfigured(), durationMs: Date.now() - startedAt },
    'Đã chạy tác vụ hằng ngày',
  );
}
