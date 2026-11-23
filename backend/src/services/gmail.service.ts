import crypto from 'node:crypto';
import { google, type gmail_v1 } from 'googleapis';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { assertAccountUsable } from '../middleware/auth.middleware';
import { Colleague } from '../models/Colleague';
import { Task } from '../models/Task';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { escapeRegex } from '../utils/helpers';
import { logActivity } from './activityLog.service';
import { summarizeForUser } from './ai.service';

/** Read-only access to mail; the profile endpoint gives us the connected address. */
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const STATE_TTL = '10m';
const MAX_BODY_CHARS = 8_000;
const MAX_FROM_FILTERS = 40;

type OAuthClient = InstanceType<typeof google.auth.OAuth2>;

export function isGmailConfigured(): boolean {
  return !!(env.GOOGLE_CLIENT_ID.trim() && env.GOOGLE_CLIENT_SECRET.trim());
}

function assertConfigured(): void {
  if (!isGmailConfigured()) {
    throw new ApiError(503, 'Máy chủ chưa cấu hình Google OAuth (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).', {
      code: 'GMAIL_NOT_CONFIGURED',
    });
  }
}

function createOAuthClient(): OAuthClient {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

/* ------------------------------------------------------------ OAuth flow -- */

interface OAuthStatePayload {
  sub: string;
  type: 'gmail_oauth';
  nonce: string;
}

/** Build the Google consent URL. `state` is a short-lived signed token binding the flow to this user. */
export function buildConnectUrl(userId: Types.ObjectId): string {
  assertConfigured();
  const state = jwt.sign(
    { sub: userId.toString(), type: 'gmail_oauth', nonce: crypto.randomBytes(8).toString('hex') } satisfies OAuthStatePayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: STATE_TTL },
  );
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline', // we need a refresh token for background sync
    prompt: 'consent', // force Google to return a refresh token even on re-connect
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    state,
  });
}

function verifyState(state: string): string {
  try {
    const decoded = jwt.verify(state, env.JWT_ACCESS_SECRET) as Partial<OAuthStatePayload>;
    if (decoded.type !== 'gmail_oauth' || typeof decoded.sub !== 'string') throw new Error('bad state');
    return decoded.sub;
  } catch {
    throw ApiError.badRequest('Phiên kết nối Gmail không hợp lệ hoặc đã hết hạn, vui lòng thử lại.');
  }
}

/** Exchange the authorization code and store the tokens on the user. Returns the connected Gmail address. */
export async function handleOAuthCallback(code: string, state: string): Promise<string> {
  assertConfigured();
  const userId = verifyState(state);

  const user = await User.findById(userId).select('+gmailIntegration.refreshToken');
  if (!user) throw ApiError.notFound('Không tìm thấy tài khoản');
  assertAccountUsable(user);

  const client = createOAuthClient();
  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch (err) {
    console.error('❌ Google token exchange failed:', err);
    throw ApiError.badRequest('Không đổi được mã xác thực Google, vui lòng thử lại.');
  }
  if (!tokens.access_token) throw ApiError.badRequest('Google không trả về access token.');

  const grantedScopes = tokens.scope?.split(' ') ?? [];
  if (!GMAIL_SCOPES.every((s) => grantedScopes.includes(s))) {
    throw ApiError.badRequest('Bạn cần cấp quyền "Xem email" của Gmail để WorkBrief AI đồng bộ công việc.');
  }

  client.setCredentials(tokens);
  const profile = await google.gmail({ version: 'v1', auth: client }).users.getProfile({ userId: 'me' });
  const gmailAddress = profile.data.emailAddress?.toLowerCase() ?? null;

  // Google only returns a refresh token on the first consent; keep the stored one otherwise.
  const refreshToken = tokens.refresh_token ?? user.gmailIntegration?.refreshToken ?? null;
  if (!refreshToken) {
    throw ApiError.badRequest(
      'Google không cấp refresh token. Hãy gỡ quyền WorkBrief AI tại myaccount.google.com/permissions rồi kết nối lại.',
    );
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        'gmailIntegration.isConnected': true,
        'gmailIntegration.email': gmailAddress,
        'gmailIntegration.accessToken': tokens.access_token,
        'gmailIntegration.refreshToken': refreshToken,
        'gmailIntegration.connectedAt': new Date(),
      },
    },
  );
  await logActivity({ userId: user._id, action: 'GMAIL_CONNECTED', metadata: { email: gmailAddress } });
  return gmailAddress ?? '';
}

export async function disconnectGmail(userId: Types.ObjectId): Promise<void> {
  const user = await User.findById(userId).select('+gmailIntegration.accessToken +gmailIntegration.refreshToken');
  const token = user?.gmailIntegration?.refreshToken ?? user?.gmailIntegration?.accessToken;
  if (token && isGmailConfigured()) {
    // Best effort: revoke at Google so the grant disappears from the user's Google account.
    await createOAuthClient()
      .revokeToken(token)
      .catch((err: unknown) => console.warn('⚠️  Google token revoke failed (ignored):', (err as Error).message));
  }
  await clearGmailTokens(userId);
  await logActivity({ userId, action: 'GMAIL_DISCONNECTED' });
}

async function clearGmailTokens(userId: Types.ObjectId): Promise<void> {
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'gmailIntegration.isConnected': false,
        'gmailIntegration.accessToken': null,
        'gmailIntegration.refreshToken': null,
      },
    },
  );
}

/** OAuth client with the user's stored tokens; refreshed access tokens are persisted automatically. */
async function getAuthorizedClient(userId: Types.ObjectId): Promise<OAuthClient> {
  assertConfigured();
  const user = await User.findById(userId).select('+gmailIntegration.accessToken +gmailIntegration.refreshToken');
  const gi = user?.gmailIntegration;
  if (!gi?.isConnected || !gi.refreshToken) {
    throw new ApiError(400, 'Bạn chưa kết nối Gmail.', { code: 'GMAIL_NOT_CONNECTED' });
  }

  const client = createOAuthClient();
  client.setCredentials({ access_token: gi.accessToken, refresh_token: gi.refreshToken });
  client.on('tokens', (tokens) => {
    const $set: Record<string, string> = {};
    if (tokens.access_token) $set['gmailIntegration.accessToken'] = tokens.access_token;
    if (tokens.refresh_token) $set['gmailIntegration.refreshToken'] = tokens.refresh_token;
    if (Object.keys($set).length > 0) {
      User.updateOne({ _id: userId }, { $set }).catch((err) => console.error('⚠️  Failed to persist Gmail token:', err));
    }
  });
  return client;
}

/** True when Google says the grant is no longer valid (revoked, expired, scope removed). */
function isAuthGrantError(err: unknown): boolean {
  const e = err as { message?: string; status?: number; code?: number | string; response?: { status?: number; data?: { error?: unknown } } };
  const status = e.response?.status ?? e.status ?? (typeof e.code === 'number' ? e.code : undefined);
  const dataError = e.response?.data?.error;
  return (
    status === 401 ||
    dataError === 'invalid_grant' ||
    (typeof e.message === 'string' && /invalid_grant|invalid credentials|insufficient.*(scope|permission)/i.test(e.message))
  );
}

/* ---------------------------------------------------------- MIME parsing -- */

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
}

/** Depth-first search for the first part with the given MIME type (skipping attachments). */
function findPart(part: gmail_v1.Schema$MessagePart | undefined, mimeType: string): gmail_v1.Schema$MessagePart | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data && !part.filename) return part;
  for (const child of part.parts ?? []) {
    const hit = findPart(child, mimeType);
    if (hit) return hit;
  }
  return null;
}

/** Drop quoted history ("> ..." lines and everything after "On ... wrote:") and squeeze whitespace. */
export function cleanEmailText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^(On .+wrote:|Vào .+đã viết:|-----\s*Original Message\s*-----|-{2,}\s*Forwarded message)/i.test(t)) break;
    if (t.startsWith('>')) continue;
    kept.push(line.trimEnd());
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractMessageBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  const plain = findPart(payload, 'text/plain');
  if (plain?.body?.data) return cleanEmailText(decodeBase64Url(plain.body.data));
  const html = findPart(payload, 'text/html');
  if (html?.body?.data) return cleanEmailText(htmlToText(decodeBase64Url(html.body.data)));
  return '';
}

function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string {
  return payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? '';
}

/** "Nguyễn Văn A <a@x.com>" → "a@x.com" */
export function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}

/* ------------------------------------------------------------------ Sync -- */

export interface GmailSyncResult {
  query: string;
  scanned: number;
  created: number;
  skippedExisting: number;
  failed: number;
  quotaExhausted: boolean;
  tasks: { _id: Types.ObjectId; title: string; from: string; priority: string }[];
  errors: string[];
}

const runningSyncs = new Set<string>();

function buildSearchQuery(colleagueEmails: string[]): string {
  const label = env.GMAIL_SYNC_LABEL.trim().replace(/\s+/g, '-');
  const sources: string[] = [];
  if (colleagueEmails.length > 0) sources.push(`from:(${colleagueEmails.slice(0, MAX_FROM_FILTERS).join(' OR ')})`);
  if (label) sources.push(`label:${label}`);
  return `{${sources.join(' ')}} newer_than:${env.GMAIL_SYNC_NEWER_THAN_DAYS}d -in:chats -in:sent`;
}

/**
 * Read the latest emails from the user's colleagues (or labelled `GMAIL_SYNC_LABEL`), summarise each
 * new one with AI and store it as a GMAIL task. Messages already imported are skipped via `externalMessageId`.
 */
export async function syncGmail(userId: Types.ObjectId): Promise<GmailSyncResult> {
  const key = userId.toString();
  if (runningSyncs.has(key)) {
    throw new ApiError(409, 'Đang đồng bộ Gmail, vui lòng đợi lượt hiện tại hoàn tất.', { code: 'SYNC_IN_PROGRESS' });
  }
  runningSyncs.add(key);
  try {
    return await runSync(userId);
  } finally {
    runningSyncs.delete(key);
  }
}

async function runSync(userId: Types.ObjectId): Promise<GmailSyncResult> {
  const client = await getAuthorizedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const colleagues = await Colleague.find({ userId, email: { $ne: '' } }).select('_id email');
  const colleagueByEmail = new Map(colleagues.map((c) => [c.email.toLowerCase(), c._id]));
  const query = buildSearchQuery([...colleagueByEmail.keys()]);

  const result: GmailSyncResult = {
    query,
    scanned: 0,
    created: 0,
    skippedExisting: 0,
    failed: 0,
    quotaExhausted: false,
    tasks: [],
    errors: [],
  };

  let messageIds: string[];
  try {
    const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: env.GMAIL_SYNC_MAX_MESSAGES });
    messageIds = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
  } catch (err) {
    if (isAuthGrantError(err)) {
      await clearGmailTokens(userId);
      throw new ApiError(400, 'Kết nối Gmail đã hết hiệu lực hoặc bị thu hồi. Vui lòng kết nối lại.', {
        code: 'GMAIL_RECONNECT_REQUIRED',
      });
    }
    console.error('❌ Gmail list failed:', err);
    throw new ApiError(502, 'Không đọc được hộp thư Gmail, vui lòng thử lại sau.');
  }
  result.scanned = messageIds.length;

  const existing = await Task.find({ userId, externalMessageId: { $in: messageIds } }).select('externalMessageId');
  const existingIds = new Set(existing.map((t) => t.externalMessageId));

  // Oldest first so tasks are created in the order the emails arrived.
  for (const messageId of [...messageIds].reverse()) {
    if (existingIds.has(messageId)) {
      result.skippedExisting++;
      continue;
    }
    try {
      const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      const subject = header(data.payload, 'Subject') || '(Không có tiêu đề)';
      const from = header(data.payload, 'From');
      const date = header(data.payload, 'Date');
      const body = extractMessageBody(data.payload) || data.snippet || '';

      const rawContent = [
        `Tiêu đề: ${subject}`,
        `Từ: ${from}`,
        ...(date ? [`Ngày: ${date}`] : []),
        '',
        body.slice(0, MAX_BODY_CHARS),
      ]
        .join('\n')
        .trim();

      const summary = await summarizeForUser(userId, rawContent, 'GMAIL');
      const fromEmail = extractEmailAddress(from);

      try {
        const task = await Task.create({
          userId,
          title: summary.title,
          rawContent,
          aiSummary: summary.aiSummary,
          checklist: summary.checklist,
          source: 'GMAIL',
          assignedBy: colleagueByEmail.get(fromEmail) ?? (await matchColleagueByEmail(userId, fromEmail)),
          priority: summary.suggestedPriority,
          status: 'IN_PROGRESS',
          deadline: null,
          externalMessageId: messageId,
        });
        result.created++;
        result.tasks.push({ _id: task._id, title: task.title, from, priority: task.priority });
        await logActivity({
          userId,
          taskId: task._id,
          action: 'GMAIL_TASK_CREATED',
          metadata: { messageId, subject, from, isMock: summary.isMock },
        });
      } catch (err) {
        // A concurrent request imported it first (unique index) — not an error.
        if ((err as { code?: number }).code === 11000) result.skippedExisting++;
        else throw err;
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        result.quotaExhausted = true;
        break;
      }
      if (isAuthGrantError(err)) {
        await clearGmailTokens(userId);
        throw new ApiError(400, 'Kết nối Gmail đã hết hiệu lực hoặc bị thu hồi. Vui lòng kết nối lại.', {
          code: 'GMAIL_RECONNECT_REQUIRED',
        });
      }
      result.failed++;
      result.errors.push(err instanceof Error ? err.message : String(err));
      console.error(`⚠️  Gmail message ${messageId} failed:`, err);
    }
  }

  await User.updateOne({ _id: userId }, { $set: { 'gmailIntegration.lastSyncedAt': new Date() } });
  await logActivity({
    userId,
    action: 'GMAIL_SYNCED',
    metadata: {
      scanned: result.scanned,
      created: result.created,
      skippedExisting: result.skippedExisting,
      failed: result.failed,
      quotaExhausted: result.quotaExhausted,
    },
  });
  return result;
}

async function matchColleagueByEmail(userId: Types.ObjectId, email: string): Promise<Types.ObjectId | null> {
  if (!email) return null;
  const hit = await Colleague.findOne({ userId, email: new RegExp(`^${escapeRegex(email)}$`, 'i') }).select('_id');
  return hit?._id ?? null;
}
