import crypto from 'node:crypto';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { assertAccountUsable } from '../middleware/auth.middleware';
import { Task } from '../models/Task';
import { User, type UserDocument } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { formatDateTimeVi } from '../utils/time';
import { logActivity } from './activityLog.service';
import { summarizeForUser, type AiSummaryResult } from './ai.service';
import { MAX_MEDIA_BYTES, summarizeMediaForUser } from './media.service';
import { matchColleagueBySender } from './task.service';

const LINK_CODE_TTL_MS = 15 * 60_000;
const PRIORITY_VI = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' } as const;

export function isTelegramConfigured(): boolean {
  return !!env.TELEGRAM_BOT_TOKEN.trim() && !!env.TELEGRAM_BOT_USERNAME.trim();
}

function assertConfigured(): void {
  if (!isTelegramConfigured()) {
    throw new ApiError(503, 'Máy chủ chưa cấu hình Telegram bot (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME).', {
      code: 'TELEGRAM_NOT_CONFIGURED',
    });
  }
}

const botUsername = () => env.TELEGRAM_BOT_USERNAME.replace(/^@/, '').trim();
const apiBase = () => env.TELEGRAM_API_BASE.replace(/\/+$/, '');

/* ------------------------------------------------------------ Bot API -- */

async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${apiBase()}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? res.status}`);
  return json.result as T;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

async function reply(chatId: number | string, html: string, replyTo?: number): Promise<void> {
  try {
    await tg('sendMessage', {
      chat_id: chatId,
      text: html.slice(0, 4000),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(replyTo && { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }),
    });
  } catch (err) {
    console.error('⚠️  Telegram sendMessage failed:', (err as Error).message);
  }
}

/** Best-effort notification to a user's linked Telegram chat (no-op if not configured / not linked). */
export async function notifyUserOnTelegram(userId: Types.ObjectId, html: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false;
  const user = await User.findById(userId).select('telegramIntegration');
  const chatId = user?.telegramIntegration?.chatId;
  if (!chatId) return false;
  await reply(chatId, html);
  return true;
}

export { escapeHtml as escapeTelegramHtml };

async function downloadFile(fileId: string): Promise<{ data: string; bytes: number }> {
  const file = await tg<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
  if (!file.file_path) throw ApiError.badRequest('Telegram không trả về file.');
  if ((file.file_size ?? 0) > MAX_MEDIA_BYTES) throw ApiError.badRequest(`File quá lớn (tối đa ${MAX_MEDIA_BYTES / 1024 / 1024} MB).`);
  const res = await fetch(`${apiBase()}/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) throw ApiError.badRequest(`File quá lớn (tối đa ${MAX_MEDIA_BYTES / 1024 / 1024} MB).`);
  return { data: buf.toString('base64'), bytes: buf.length };
}

/* ------------------------------------------------------- Account linking -- */

const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

export async function createLinkCode(userId: Types.ObjectId) {
  assertConfigured();
  const code = crypto.randomBytes(16).toString('hex'); // [0-9a-f]{32} — valid for /start payloads
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await User.updateOne(
    { _id: userId },
    { $set: { 'telegramIntegration.linkCodeHash': hashCode(code), 'telegramIntegration.linkCodeExpiresAt': expiresAt } },
  );
  return { deepLink: `https://t.me/${botUsername()}?start=${code}`, botUsername: botUsername(), expiresAt };
}

export async function unlinkTelegram(userId: Types.ObjectId, { notify = true } = {}): Promise<void> {
  const user = await User.findById(userId);
  const chatId = user?.telegramIntegration?.chatId;
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'telegramIntegration.chatId': null,
        'telegramIntegration.username': null,
        'telegramIntegration.firstName': null,
        'telegramIntegration.linkedAt': null,
      },
    },
  );
  await logActivity({ userId, action: 'TELEGRAM_UNLINKED' });
  if (notify && chatId && isTelegramConfigured()) {
    await reply(chatId, 'Đã ngắt kết nối khỏi WorkBrief AI. Tin nhắn gửi tới bot sẽ không còn tạo công việc.');
  }
}

/* ----------------------------------------------------------- Webhook -- */

/** Only the parts of Telegram's Update we use. */
interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: { file_id: string; file_size?: number; width: number; height: number }[];
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; mime_type?: string; file_size?: number; duration: number };
  audio?: { file_id: string; mime_type?: string; file_size?: number; file_name?: string };
  forward_origin?: { type: string; sender_user?: TgUser; sender_user_name?: string; chat?: { title?: string } };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export function verifyWebhookSecret(header: string | undefined): boolean {
  if (!env.TELEGRAM_WEBHOOK_SECRET) return false;
  const a = Buffer.from(header ?? '');
  const b = Buffer.from(env.TELEGRAM_WEBHOOK_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function forwardedFrom(m: TgMessage): string | null {
  const o = m.forward_origin;
  if (!o) return null;
  if (o.sender_user) return [o.sender_user.first_name, o.sender_user.last_name].filter(Boolean).join(' ') || o.sender_user.username || null;
  return o.sender_user_name ?? o.chat?.title ?? null;
}

const HELP = [
  '<b>WorkBrief AI bot</b> 🤖',
  'Gửi hoặc <b>chuyển tiếp</b> cho tôi tin nhắn giao việc, ảnh chụp, file PDF hay tin nhắn thoại — AI sẽ tóm tắt và tạo công việc trên WorkBrief.',
  '',
  '/status – tài khoản & lượt AI còn lại',
  '/unlink – ngắt kết nối',
  '/help – hướng dẫn',
].join('\n');

const NOT_LINKED = 'Chat này chưa liên kết với tài khoản WorkBrief AI.\nVào web WorkBrief → <b>Gmail &amp; Zalo</b> → <b>Kết nối Telegram</b> và bấm vào link được tạo.';

async function handleStart(m: TgMessage, payload: string): Promise<void> {
  const chatId = String(m.chat.id);
  if (!payload) {
    const linked = await User.exists({ 'telegramIntegration.chatId': chatId });
    await reply(m.chat.id, linked ? HELP : `${NOT_LINKED}\n\n${HELP}`);
    return;
  }
  const user = await User.findOne({
    'telegramIntegration.linkCodeHash': hashCode(payload),
    'telegramIntegration.linkCodeExpiresAt': { $gt: new Date() },
  });
  if (!user) {
    await reply(m.chat.id, 'Link kết nối không hợp lệ hoặc đã hết hạn (15 phút). Hãy tạo link mới trên web WorkBrief.');
    return;
  }
  try {
    assertAccountUsable(user);
  } catch (err) {
    await reply(m.chat.id, escapeHtml((err as Error).message));
    return;
  }
  // A chat can belong to only one account: detach it from whoever had it before.
  await User.updateMany(
    { 'telegramIntegration.chatId': chatId, _id: { $ne: user._id } },
    { $set: { 'telegramIntegration.chatId': null, 'telegramIntegration.linkedAt': null } },
  );
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        'telegramIntegration.chatId': chatId,
        'telegramIntegration.username': m.from?.username ?? null,
        'telegramIntegration.firstName': m.from?.first_name ?? null,
        'telegramIntegration.linkedAt': new Date(),
        'telegramIntegration.linkCodeHash': null,
        'telegramIntegration.linkCodeExpiresAt': null,
      },
    },
  );
  await logActivity({ userId: user._id, action: 'TELEGRAM_LINKED', metadata: { username: m.from?.username ?? null } });
  await reply(m.chat.id, `✅ Đã kết nối với tài khoản <b>${escapeHtml(user.email)}</b>.\n\n${HELP}`);
}

async function handleStatus(m: TgMessage, user: UserDocument): Promise<void> {
  const remaining = Math.max(0, user.aiQuotaLimit - user.aiQuotaUsed);
  const open = await Task.countDocuments({ userId: user._id, status: 'IN_PROGRESS' });
  await reply(
    m.chat.id,
    [
      `👤 <b>${escapeHtml(user.fullName)}</b> (${escapeHtml(user.email)})`,
      `✨ Lượt AI: còn ${remaining}/${user.aiQuotaLimit}`,
      `📋 Việc đang làm: ${open}`,
      user.trialExpiresAt ? `⏳ Dùng thử đến ${formatDateTimeVi(user.trialExpiresAt, env.APP_TIMEZONE)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

function describeTask(summary: AiSummaryResult): string {
  const lines = [`✅ Đã tạo công việc: <b>${escapeHtml(summary.title)}</b>`, `Ưu tiên: ${PRIORITY_VI[summary.suggestedPriority]}`];
  if (summary.suggestedDeadline) lines.push(`Hạn: ${formatDateTimeVi(summary.suggestedDeadline, env.APP_TIMEZONE)}`);
  if (summary.checklist.length) lines.push('', ...summary.checklist.slice(0, 6).map((c) => `• ${escapeHtml(c.text)}`));
  lines.push('', `👉 ${escapeHtml(env.FRONTEND_URL.replace(/\/+$/, ''))}/tasks`);
  return lines.join('\n');
}

/** Turn one Telegram message into a task for the linked user. */
async function handleContent(m: TgMessage, user: UserDocument): Promise<void> {
  const externalMessageId = `tg:${m.chat.id}:${m.message_id}`;
  // Telegram retries webhooks that time out; never create the same task twice.
  if (await Task.exists({ userId: user._id, externalMessageId })) return;

  const from = forwardedFrom(m);
  const text = (m.text ?? m.caption ?? '').trim();
  const header = from ? `Chuyển tiếp từ: ${from}\n\n` : '';

  let file: { fileId: string; mimeType: string; filename?: string } | null = null;
  if (m.photo?.length) {
    const largest = [...m.photo].sort((a, b) => (b.file_size ?? b.width * b.height) - (a.file_size ?? a.width * a.height))[0]!;
    file = { fileId: largest.file_id, mimeType: 'image/jpeg' };
  } else if (m.voice) file = { fileId: m.voice.file_id, mimeType: m.voice.mime_type ?? 'audio/ogg' };
  else if (m.audio) file = { fileId: m.audio.file_id, mimeType: m.audio.mime_type ?? 'audio/mpeg', filename: m.audio.file_name };
  else if (m.document) file = { fileId: m.document.file_id, mimeType: m.document.mime_type ?? 'application/octet-stream', filename: m.document.file_name };

  if (!file && text.length < 5) {
    await reply(m.chat.id, 'Hãy gửi nội dung công việc (tối thiểu vài chữ), ảnh, PDF hoặc tin nhắn thoại. Gõ /help để xem hướng dẫn.', m.message_id);
    return;
  }

  await tg('sendChatAction', { chat_id: m.chat.id, action: 'typing' }).catch(() => undefined);

  let summary: AiSummaryResult;
  let rawContent: string;
  if (file) {
    const { data } = await downloadFile(file.fileId);
    const r = await summarizeMediaForUser(
      user._id,
      { mimeType: file.mimeType, data, filename: file.filename },
      { source: 'TELEGRAM', note: [from && `Chuyển tiếp từ ${from}`, text].filter(Boolean).join('. ') || undefined },
    );
    summary = r;
    rawContent = `${header}${text ? `${text}\n\n` : ''}${r.extractedText}`.trim();
  } else {
    rawContent = `${header}${text}`;
    summary = await summarizeForUser(user._id, rawContent, 'TELEGRAM');
  }

  try {
    const task = await Task.create({
      userId: user._id,
      title: summary.title,
      rawContent,
      aiSummary: summary.aiSummary,
      checklist: summary.checklist,
      source: 'TELEGRAM',
      assignedBy: from ? await matchColleagueBySender(user._id, undefined, from) : null,
      priority: summary.suggestedPriority,
      deadline: summary.suggestedDeadline,
      status: 'IN_PROGRESS',
      externalMessageId,
    });
    await logActivity({
      userId: user._id,
      taskId: task._id,
      action: 'TELEGRAM_TASK_CREATED',
      metadata: { kind: file ? file.mimeType : 'text', forwardedFrom: from, isMock: summary.isMock },
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return; // concurrent retry already created it
    throw err;
  }
  await reply(m.chat.id, describeTask(summary), m.message_id);
}

/** Process one update. Never throws — errors are reported back to the chat. */
export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  const m = update.message;
  if (!m || m.from?.is_bot) return;
  if (m.chat.type !== 'private') {
    await reply(m.chat.id, 'Hãy nhắn riêng cho bot (chat 1-1) để tạo công việc.');
    return;
  }

  try {
    const text = m.text?.trim() ?? '';
    const cmd = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s);
    if (cmd?.[1] === 'start') return await handleStart(m, (cmd[2] ?? '').trim());

    const user = await User.findOne({ 'telegramIntegration.chatId': String(m.chat.id) });
    if (cmd?.[1] === 'help') return await reply(m.chat.id, user ? HELP : `${NOT_LINKED}\n\n${HELP}`);
    if (!user) return await reply(m.chat.id, NOT_LINKED);

    try {
      assertAccountUsable(user);
    } catch (err) {
      return await reply(m.chat.id, escapeHtml((err as Error).message));
    }

    if (cmd?.[1] === 'status') return await handleStatus(m, user);
    if (cmd?.[1] === 'unlink') return await unlinkTelegram(user._id);
    if (cmd) return await reply(m.chat.id, 'Lệnh không hợp lệ. Gõ /help để xem hướng dẫn.');

    await handleContent(m, user);
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : 'Có lỗi khi xử lý tin nhắn, vui lòng thử lại sau.';
    if (!(err instanceof ApiError)) console.error('❌ Telegram update failed:', err);
    await reply(m.chat.id, `⚠️ ${escapeHtml(msg)}`, m.message_id);
  }
}

/* ------------------------------------------------------------- Setup -- */

export function telegramWebhookUrl(): string {
  return `${env.PUBLIC_API_URL.replace(/\/+$/, '')}/api/integrations/telegram/webhook`;
}

/** Registers the webhook + command list with Telegram (admin action, run once per deployment URL). */
export async function setupTelegramWebhook() {
  assertConfigured();
  if (!env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET.length < 16) {
    throw ApiError.badRequest('Cần đặt TELEGRAM_WEBHOOK_SECRET (tối thiểu 16 ký tự) trước khi cài webhook.');
  }
  if (!/^https:\/\//.test(env.PUBLIC_API_URL)) {
    throw ApiError.badRequest('Telegram chỉ gọi webhook qua HTTPS — PUBLIC_API_URL phải là địa chỉ https:// (ví dụ domain Vercel).');
  }
  await tg('setWebhook', {
    url: telegramWebhookUrl(),
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message'],
    max_connections: 10,
  });
  await tg('setMyCommands', {
    commands: [
      { command: 'help', description: 'Hướng dẫn sử dụng' },
      { command: 'status', description: 'Tài khoản & lượt AI còn lại' },
      { command: 'unlink', description: 'Ngắt kết nối WorkBrief' },
    ],
  });
  return getTelegramWebhookInfo();
}

export async function getTelegramWebhookInfo() {
  assertConfigured();
  const info = await tg<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>(
    'getWebhookInfo',
    {},
  );
  return {
    botUsername: botUsername(),
    expectedUrl: telegramWebhookUrl(),
    url: info.url,
    active: info.url === telegramWebhookUrl(),
    pendingUpdates: info.pending_update_count,
    lastError: info.last_error_message ?? null,
    lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000) : null,
  };
}
