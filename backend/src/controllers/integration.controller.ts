import type { Request, Response } from 'express';
import { env } from '../config/env';
import { getAuthUser } from '../middleware/auth.middleware';
import { Task, TASK_SOURCES } from '../models/Task';
import { User } from '../models/User';
import { logActivity } from '../services/activityLog.service';
import { isGeminiConfigured, summarizeForUser } from '../services/ai.service';
import { ASSIGNED_BY_FIELDS, matchColleagueBySender } from '../services/task.service';
import { buildConnectUrl, disconnectGmail, handleOAuthCallback, isGmailConfigured, syncGmail } from '../services/gmail.service';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { generateWebhookApiKey } from '../utils/helpers';
import { zaloWebhookSchema } from '../validators/integration.schema';

function zaloWebhookUrl(): string {
  return `${env.PUBLIC_API_URL.replace(/\/+$/, '')}/api/integrations/zalo/webhook`;
}

export async function getOverview(req: Request, res: Response) {
  const user = getAuthUser(req);

  const [bySourceRows, lastZaloTask, lastGmailTask] = await Promise.all([
    Task.aggregate<{ _id: string; count: number }>([
      { $match: { userId: user._id } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    Task.findOne({ userId: user._id, source: 'ZALO' }).sort({ createdAt: -1 }).select('createdAt title'),
    Task.findOne({ userId: user._id, source: 'GMAIL' }).sort({ createdAt: -1 }).select('createdAt title'),
  ]);
  const tasksBySource = Object.fromEntries(
    TASK_SOURCES.map((s) => [s, bySourceRows.find((r) => r._id === s)?.count ?? 0]),
  );

  return sendSuccess(
    res,
    {
      gmail: {
        configured: isGmailConfigured(),
        isConnected: user.gmailIntegration?.isConnected ?? false,
        email: user.gmailIntegration?.email ?? null,
        connectedAt: user.gmailIntegration?.connectedAt ?? null,
        lastSyncedAt: user.gmailIntegration?.lastSyncedAt ?? null,
        syncLabel: env.GMAIL_SYNC_LABEL,
        syncNewerThanDays: env.GMAIL_SYNC_NEWER_THAN_DAYS,
        syncMaxMessages: env.GMAIL_SYNC_MAX_MESSAGES,
        taskCount: tasksBySource.GMAIL,
        lastTaskAt: lastGmailTask?.createdAt ?? null,
      },
      zalo: {
        webhookUrl: zaloWebhookUrl(),
        pingUrl: zaloWebhookUrl().replace(/\/webhook$/, '/ping'),
        webhookApiKey: user.webhookApiKey,
        headerName: 'x-webhook-key',
        taskCount: tasksBySource.ZALO,
        lastTaskAt: lastZaloTask?.createdAt ?? null,
      },
      ai: {
        provider: 'gemini',
        model: env.GEMINI_MODEL,
        configured: isGeminiConfigured(),
        mockFallback: !isGeminiConfigured() && env.AI_MOCK_FALLBACK,
        quota: {
          used: user.aiQuotaUsed,
          limit: user.aiQuotaLimit,
          remaining: Math.max(0, user.aiQuotaLimit - user.aiQuotaUsed),
        },
      },
      tasksBySource,
    },
    'OK',
  );
}

export async function regenerateWebhookKey(req: Request, res: Response) {
  const user = getAuthUser(req);
  const webhookApiKey = generateWebhookApiKey();
  await User.updateOne({ _id: user._id }, { $set: { webhookApiKey } });
  await logActivity({ userId: user._id, action: 'WEBHOOK_KEY_REGENERATED' });
  return sendSuccess(
    res,
    { webhookApiKey, webhookUrl: zaloWebhookUrl() },
    'Đã tạo webhook key mới. Hãy cập nhật key trong Zalo Extension.',
  );
}

/* ---------------------------------------------------------------- Gmail -- */

/** Returns the Google consent URL; the frontend navigates the browser to it. */
export async function gmailConnect(req: Request, res: Response) {
  const user = getAuthUser(req);
  return sendSuccess(res, { url: buildConnectUrl(user._id) }, 'Chuyển tới Google để cấp quyền Gmail');
}

/** Google redirects the browser here (no JWT). Always redirects back to the frontend with a status. */
export async function gmailCallback(req: Request, res: Response) {
  const target = new URL('/integrations', env.FRONTEND_URL);
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) {
    target.searchParams.set('gmail', 'error');
    target.searchParams.set('message', error === 'access_denied' ? 'Bạn đã từ chối cấp quyền Gmail.' : `Google trả về lỗi: ${error}`);
    return res.redirect(target.toString());
  }

  try {
    if (!code || !state) throw ApiError.badRequest('Thiếu mã xác thực từ Google.');
    const email = await handleOAuthCallback(code, state);
    target.searchParams.set('gmail', 'connected');
    if (email) target.searchParams.set('email', email);
  } catch (err) {
    target.searchParams.set('gmail', 'error');
    target.searchParams.set('message', err instanceof ApiError ? err.message : 'Kết nối Gmail thất bại, vui lòng thử lại.');
    if (!(err instanceof ApiError)) console.error('❌ Gmail callback failed:', err);
  }
  return res.redirect(target.toString());
}

export async function gmailDisconnect(req: Request, res: Response) {
  const user = getAuthUser(req);
  await disconnectGmail(user._id);
  return sendSuccess(res, null, 'Đã ngắt kết nối Gmail');
}

export async function gmailSync(req: Request, res: Response) {
  const user = getAuthUser(req);
  const result = await syncGmail(user._id);

  const parts = [`Đã quét ${result.scanned} email`, `tạo ${result.created} công việc mới`];
  if (result.skippedExisting) parts.push(`bỏ qua ${result.skippedExisting} email đã đồng bộ`);
  if (result.failed) parts.push(`${result.failed} email lỗi`);
  let message = parts.join(', ') + '.';
  if (result.quotaExhausted) message += ' Đã dừng vì hết lượt AI.';

  return sendSuccess(res, result, message);
}

/* ----------------------------------------------------------------- Zalo -- */

/** Lets the Zalo extension verify its URL + key without creating a task or using AI quota. */
export async function zaloPing(req: Request, res: Response) {
  const user = getAuthUser(req);
  return sendSuccess(
    res,
    {
      fullName: user.fullName,
      email: user.email,
      aiQuota: {
        used: user.aiQuotaUsed,
        limit: user.aiQuotaLimit,
        remaining: Math.max(0, user.aiQuotaLimit - user.aiQuotaUsed),
      },
      trialExpiresAt: user.trialExpiresAt,
    },
    `Kết nối thành công tới tài khoản ${user.email}`,
  );
}

/** Called by the Zalo extension (auth: x-webhook-key). Summarises the message with AI and stores it as a task. */
export async function zaloWebhook(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = zaloWebhookSchema.parse(req.body);

  const headerLines = [
    input.groupName && `Nhóm: ${input.groupName}`,
    (input.senderName || input.senderPhone) &&
      `Người gửi: ${[input.senderName, input.senderPhone].filter(Boolean).join(' - ')}`,
    input.sentAt && `Thời gian: ${input.sentAt.toISOString()}`,
  ].filter(Boolean);
  const rawContent = headerLines.length > 0 ? `${headerLines.join('\n')}\n\n${input.content}` : input.content;

  const summary = await summarizeForUser(user._id, rawContent, 'ZALO');
  const assignedBy = await matchColleagueBySender(user._id, input.senderPhone, input.senderName);

  const task = await Task.create({
    userId: user._id,
    title: summary.title,
    rawContent,
    aiSummary: summary.aiSummary,
    checklist: summary.checklist,
    source: 'ZALO',
    assignedBy,
    priority: summary.suggestedPriority,
    status: 'IN_PROGRESS',
    deadline: null,
  });

  await logActivity({
    userId: user._id,
    taskId: task._id,
    action: 'ZALO_TASK_CREATED',
    metadata: {
      senderName: input.senderName ?? null,
      senderPhone: input.senderPhone ?? null,
      groupName: input.groupName ?? null,
      isMock: summary.isMock,
      matchedColleague: !!assignedBy,
    },
  });
  await task.populate('assignedBy', ASSIGNED_BY_FIELDS);

  return sendSuccess(res, { task, isMock: summary.isMock, quota: summary.quota }, 'Đã tạo công việc từ tin nhắn Zalo', 201);
}
