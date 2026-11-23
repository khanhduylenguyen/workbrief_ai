import type { Request, Response } from 'express';
import { env } from '../config/env';
import { getAuthUser } from '../middleware/auth.middleware';
import { Task, TASK_SOURCES } from '../models/Task';
import { User } from '../models/User';
import { logActivity } from '../services/activityLog.service';
import { isGeminiConfigured, summarizeForUser } from '../services/ai.service';
import { ASSIGNED_BY_FIELDS, matchColleagueBySender } from '../services/task.service';
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
        isConnected: user.gmailIntegration?.isConnected ?? false,
        email: user.gmailIntegration?.email ?? null,
        taskCount: tasksBySource.GMAIL,
        lastTaskAt: lastGmailTask?.createdAt ?? null,
      },
      zalo: {
        webhookUrl: zaloWebhookUrl(),
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
