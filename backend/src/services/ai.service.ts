import { GoogleGenAI } from '@google/genai';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { TASK_PRIORITIES, type TaskPriority, type TaskSource } from '../models/Task';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { describeNow, zonedParts, zonedTimeToUtc } from '../utils/time';
import { logActivity } from './activityLog.service';

export interface AiSummaryResult {
  title: string;
  aiSummary: string;
  checklist: { text: string; isDone: boolean }[];
  suggestedPriority: TaskPriority;
  /** Deadline mentioned in the content ("trước 3h chiều nay", "thứ 6"…), resolved in APP_TIMEZONE. */
  suggestedDeadline: Date | null;
  /** true when the sample (non-Gemini) summariser was used. */
  isMock: boolean;
}

const MAX_CHECKLIST_ITEMS = 10;

const SOURCE_LABEL: Record<TaskSource, string> = {
  MANUAL: 'ghi chú nhập tay',
  GMAIL: 'email (Gmail)',
  ZALO: 'tin nhắn Zalo',
};

const SYSTEM_INSTRUCTION = `Bạn là trợ lý tóm tắt công việc cho nhân viên văn phòng Việt Nam.
Nhiệm vụ: đọc nội dung (email, tin nhắn Zalo hoặc ghi chú) và trích xuất ĐẦU VIỆC người nhận cần làm.
Quy tắc:
- Trả lời bằng cùng ngôn ngữ với nội dung gốc (mặc định tiếng Việt).
- "title": tiêu đề ngắn gọn dạng hành động, tối đa 100 ký tự.
- "aiSummary": tóm tắt 2-4 câu: việc gì, ai yêu cầu, hạn chót (nếu có), lưu ý quan trọng.
- "checklist": 1-${MAX_CHECKLIST_ITEMS} bước cụ thể, mỗi bước bắt đầu bằng động từ, không trùng lặp.
- "suggestedPriority": một trong LOW | MEDIUM | HIGH | URGENT. URGENT nếu yêu cầu gấp/trong ngày/khẩn; HIGH nếu có hạn chót gần hoặc từ cấp trên; LOW nếu chỉ để tham khảo; còn lại MEDIUM.
- "suggestedDeadline": hạn chót nếu nội dung có nhắc ("trước 3h chiều nay", "mai", "thứ 6", "cuối tuần", "25/11"…), tính dựa trên "Thời điểm hiện tại" được cung cấp, ghi theo GIỜ ĐỊA PHƯƠNG dạng YYYY-MM-DDTHH:mm. Chỉ có ngày thì lấy 17:00; "sáng" 09:00, "trưa" 12:00, "chiều" 17:00, "tối" 20:00; "cuối tuần" là thứ Sáu 17:00 của tuần này. Không có hạn chót thì trả chuỗi rỗng "".
- Không bịa thông tin không có trong nội dung.`;

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Tiêu đề đầu việc ngắn gọn' },
    aiSummary: { type: 'string', description: 'Tóm tắt 2-4 câu' },
    checklist: {
      type: 'array',
      items: { type: 'string' },
      description: 'Các bước cần làm',
    },
    suggestedPriority: { type: 'string', enum: [...TASK_PRIORITIES] },
    suggestedDeadline: {
      type: 'string',
      description: 'Hạn chót theo giờ địa phương, dạng YYYY-MM-DDTHH:mm; chuỗi rỗng nếu không có',
    },
  },
  required: ['title', 'aiSummary', 'checklist', 'suggestedPriority', 'suggestedDeadline'],
  propertyOrdering: ['title', 'aiSummary', 'checklist', 'suggestedPriority', 'suggestedDeadline'],
};

const geminiOutputSchema = z.object({
  title: z.string().trim().min(1),
  aiSummary: z.string().trim().default(''),
  checklist: z.array(z.string()).default([]),
  suggestedPriority: z
    .string()
    .transform((p) => p.toUpperCase())
    .pipe(z.enum(TASK_PRIORITIES))
    .catch('MEDIUM'),
  suggestedDeadline: z.string().nullish().catch(null),
});

/** "2026-11-23T15:00" (wall time in APP_TIMEZONE) → Date. Ignores garbage and absurd dates. */
export function parseLocalDeadline(value: string | null | undefined, now = new Date()): Date | null {
  const m = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = '17', mi = '00'] = m;
  const date = zonedTimeToUtc(Number(y), Number(mo), Number(d), Number(h), Number(mi), env.APP_TIMEZONE);
  if (Number.isNaN(date.getTime())) return null;
  const day = 86_400_000;
  // Allow slightly-past deadlines ("sáng nay" read in the afternoon) but drop obvious mistakes.
  if (date.getTime() < now.getTime() - 2 * day || date.getTime() > now.getTime() + 730 * day) return null;
  return date;
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 45_000 } });
  }
  return geminiClient;
}

/** Primary model first, then GEMINI_FALLBACK_MODELS (deduplicated). */
export function geminiModels(): string[] {
  const list = [env.GEMINI_MODEL, ...env.GEMINI_FALLBACK_MODELS.split(',')].map((m) => m.trim()).filter(Boolean);
  return [...new Set(list)];
}

function geminiErrorStatus(err: unknown): number | null {
  const e = err as { status?: unknown; code?: unknown };
  if (typeof e?.status === 'number') return e.status;
  if (typeof e?.code === 'number') return e.code;
  return null;
}

/** Overloaded (503), rate limited (429), model retired / unknown (404), 500, or our own timeout. */
function isRetryableGeminiError(err: unknown): boolean {
  const status = geminiErrorStatus(err);
  if (status !== null) return [404, 429, 500, 503].includes(status);
  return (err as { name?: string })?.name === 'AbortError';
}

function describeGeminiError(err: unknown): string {
  const status = geminiErrorStatus(err);
  if ((err as { name?: string })?.name === 'AbortError') return 'timeout';
  const msg = err instanceof Error ? err.message : String(err);
  return `${status ?? '?'} ${msg.slice(0, 160)}`;
}

export function isGeminiConfigured(): boolean {
  return env.GEMINI_API_KEY.trim().length > 0;
}

export function isAiAvailable(): boolean {
  return isGeminiConfigured() || env.AI_MOCK_FALLBACK;
}

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function normaliseChecklist(items: string[]): { text: string; isDone: boolean }[] {
  const seen = new Set<string>();
  const result: { text: string; isDone: boolean }[] = [];
  for (const raw of items) {
    const text = truncate(raw.replace(/^\s*(?:[-*•+]|\d+[.)])\s*/, ''), 500);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push({ text, isDone: false });
    if (result.length >= MAX_CHECKLIST_ITEMS) break;
  }
  return result;
}

async function summarizeWithGemini(rawContent: string, source: TaskSource): Promise<AiSummaryResult> {
  const prompt = `Nguồn: ${SOURCE_LABEL[source]}\nThời điểm hiện tại: ${describeNow(env.APP_TIMEZONE)}\n\nNội dung:\n"""\n${rawContent}\n"""`;

  // Try the primary model, then each fallback, when Google reports the model as overloaded,
  // rate-limited, retired (404) or the request times out.
  let text: string | undefined;
  let lastError: unknown = null;
  for (const model of geminiModels()) {
    try {
      const response = await getGeminiClient().models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_JSON_SCHEMA,
          temperature: 0.3,
        },
      });
      text = response.text;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err)) break;
      console.warn(`⚠️  Gemini model ${model} unavailable (${describeGeminiError(err)}), trying next model…`);
    }
  }
  if (lastError) {
    console.error('❌ Gemini request failed:', describeGeminiError(lastError));
    throw new ApiError(502, 'Dịch vụ AI đang gặp sự cố, vui lòng thử lại sau');
  }

  if (!text) throw new ApiError(502, 'AI không trả về kết quả');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'AI trả về dữ liệu không đúng định dạng');
  }

  const parsed = geminiOutputSchema.safeParse(json);
  if (!parsed.success) throw new ApiError(502, 'AI trả về dữ liệu không đúng định dạng');

  return {
    title: truncate(parsed.data.title, 200),
    aiSummary: truncate(parsed.data.aiSummary, 5_000),
    checklist: normaliseChecklist(parsed.data.checklist),
    suggestedPriority: parsed.data.suggestedPriority,
    suggestedDeadline: parseLocalDeadline(parsed.data.suggestedDeadline),
    isMock: false,
  };
}

const URGENT_KEYWORDS = ['gấp', 'khẩn', 'ngay lập tức', 'ngay bây giờ', 'trong hôm nay', 'asap', 'urgent', 'immediately'];
const HIGH_KEYWORDS = ['quan trọng', 'deadline', 'hạn chót', 'hôm nay', 'ngày mai', 'sếp', 'giám đốc', 'important', 'today', 'tomorrow'];
const LOW_KEYWORDS = ['tham khảo', 'khi rảnh', 'không gấp', 'fyi', 'for your information'];

/** Deterministic sample summariser used when no GEMINI_API_KEY is configured. */
export function summarizeWithMock(rawContent: string, source: TaskSource): AiSummaryResult {
  // Drop metadata header lines added by the Zalo webhook ("Nhóm:", "Người gửi:", "Thời gian:") and
  // Gmail sync ("Từ:", "Ngày:"); keep the email subject ("Tiêu đề: …") as plain text so it becomes the title.
  const content = rawContent
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^(Nhóm|Người gửi|Thời gian|Từ|Ngày):/.test(l.trim()))
    .map((l) => l.replace(/^\s*Tiêu đề:\s*/, ''))
    .join('\n')
    .trim();
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const lower = content.toLowerCase();

  const firstLine = lines[0] ?? content;
  const title = truncate(firstLine.replace(/^(re|fw|fwd)\s*:\s*/i, ''), 100) || 'Công việc mới';

  const sentences = content
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const summaryBody = truncate(sentences.slice(0, 3).join(' '), 600);
  const aiSummary = `[Tóm tắt mẫu – chưa cấu hình GEMINI_API_KEY] Từ ${SOURCE_LABEL[source]}: ${summaryBody}`;

  const bulletLines = lines.filter((l) => /^\s*(?:[-*•+]|\d+[.)])\s+/.test(l));
  const checklistSource = bulletLines.length > 0 ? bulletLines : sentences.length > 1 ? sentences : lines;
  let checklist = normaliseChecklist(checklistSource);
  if (checklist.length === 0) {
    checklist = [
      { text: 'Đọc kỹ nội dung yêu cầu', isDone: false },
      { text: 'Thực hiện công việc', isDone: false },
      { text: 'Phản hồi kết quả cho người giao việc', isDone: false },
    ];
  }

  let suggestedPriority: TaskPriority = 'MEDIUM';
  if (URGENT_KEYWORDS.some((k) => lower.includes(k))) suggestedPriority = 'URGENT';
  else if (HIGH_KEYWORDS.some((k) => lower.includes(k))) suggestedPriority = 'HIGH';
  else if (LOW_KEYWORDS.some((k) => lower.includes(k))) suggestedPriority = 'LOW';

  return { title, aiSummary, checklist, suggestedPriority, suggestedDeadline: guessDeadline(content), isMock: true };
}

const WEEKDAY_WORDS: [string, number][] = [
  ['chủ nhật', 0], ['thứ hai', 1], ['thứ ba', 2], ['thứ tư', 3], ['thứ năm', 4], ['thứ sáu', 5], ['thứ bảy', 6],
  ['thứ 2', 1], ['thứ 3', 2], ['thứ 4', 3], ['thứ 5', 4], ['thứ 6', 5], ['thứ 7', 6],
  ['cn', 0], ['t2', 1], ['t3', 2], ['t4', 3], ['t5', 4], ['t6', 5], ['t7', 6],
];

/** Rough Vietnamese deadline detection for the sample (no-Gemini) summariser. */
export function guessDeadline(text: string, now = new Date()): Date | null {
  const lower = text.toLowerCase();
  const tz = env.APP_TIMEZONE;
  const today = zonedParts(now, tz);
  const hasWord = (w: string) => new RegExp(`(^|[^\\p{L}\\d])${w}(?![\\p{L}\\d])`, 'u').test(lower);

  let dayOffset: number | null = null;
  let explicit: { d: number; m: number; y: number } | null = null;

  const dm = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (dm) explicit = { d: Number(dm[1]), m: Number(dm[2]), y: dm[3] ? Number(dm[3]) : today.year };
  else if (/(hôm nay|trong ngày|sáng nay|trưa nay|chiều nay|tối nay)/.test(lower)) dayOffset = 0;
  else if (/ngày mai/.test(lower) || hasWord('mai')) dayOffset = 1;
  else if (/cuối tuần/.test(lower)) dayOffset = (5 - today.weekday + 7) % 7;
  else {
    const hit = WEEKDAY_WORDS.find(([w]) => hasWord(w));
    if (hit) dayOffset = (hit[1] - today.weekday + 7) % 7;
  }

  const tm = lower.match(/\b(\d{1,2})\s*(?:h|giờ|:)\s*(\d{2})?/);
  let hour = 17;
  let minute = 0;
  if (tm) {
    hour = Number(tm[1]);
    minute = tm[2] ? Number(tm[2]) : 0;
    if (hour < 12 && /(chiều|tối)/.test(lower)) hour += 12;
    if (dayOffset === null && !explicit) dayOffset = 0;
  } else if (/sáng/.test(lower)) hour = 9;
  else if (/trưa/.test(lower)) hour = 12;
  else if (/tối/.test(lower)) hour = 20;

  if (hour > 23 || minute > 59) return null;
  if (explicit) {
    if (explicit.m < 1 || explicit.m > 12 || explicit.d < 1 || explicit.d > 31) return null;
    return zonedTimeToUtc(explicit.y, explicit.m, explicit.d, hour, minute, tz);
  }
  if (dayOffset === null) return null;
  return zonedTimeToUtc(today.year, today.month, today.day + dayOffset, hour, minute, tz);
}

export async function summarizeContent(rawContent: string, source: TaskSource): Promise<AiSummaryResult> {
  if (isGeminiConfigured()) return summarizeWithGemini(rawContent, source);
  if (env.AI_MOCK_FALLBACK) return summarizeWithMock(rawContent, source);
  throw new ApiError(503, 'Chưa cấu hình GEMINI_API_KEY cho dịch vụ AI');
}

/**
 * Atomically reserve one AI call from the user's quota.
 * Returns the updated usage, or throws 429 when the quota is exhausted.
 */
async function reserveQuota(userId: Types.ObjectId): Promise<{ aiQuotaUsed: number; aiQuotaLimit: number }> {
  const updated = await User.findOneAndUpdate(
    { _id: userId, $expr: { $lt: ['$aiQuotaUsed', '$aiQuotaLimit'] } },
    { $inc: { aiQuotaUsed: 1 } },
    { returnDocument: 'after', projection: { aiQuotaUsed: 1, aiQuotaLimit: 1 } },
  );
  if (!updated) {
    throw ApiError.tooManyRequests('Bạn đã dùng hết lượt AI. Vui lòng liên hệ quản trị viên để được cấp thêm.');
  }
  return { aiQuotaUsed: updated.aiQuotaUsed, aiQuotaLimit: updated.aiQuotaLimit };
}

async function refundQuota(userId: Types.ObjectId): Promise<void> {
  await User.updateOne({ _id: userId, aiQuotaUsed: { $gt: 0 } }, { $inc: { aiQuotaUsed: -1 } });
}

export interface QuotaSummaryResult extends AiSummaryResult {
  quota: { used: number; limit: number; remaining: number };
}

/** Summarise content on behalf of a user: checks + consumes quota, refunds on failure, logs activity. */
export async function summarizeForUser(
  userId: Types.ObjectId,
  rawContent: string,
  source: TaskSource,
): Promise<QuotaSummaryResult> {
  if (!isAiAvailable()) throw new ApiError(503, 'Chưa cấu hình GEMINI_API_KEY cho dịch vụ AI');

  const { aiQuotaUsed, aiQuotaLimit } = await reserveQuota(userId);

  let result: AiSummaryResult;
  try {
    result = await summarizeContent(rawContent, source);
  } catch (err) {
    await refundQuota(userId);
    throw err;
  }

  await logActivity({
    userId,
    action: 'AI_SUMMARIZED',
    metadata: { source, isMock: result.isMock, contentLength: rawContent.length },
  });

  return {
    ...result,
    quota: { used: aiQuotaUsed, limit: aiQuotaLimit, remaining: Math.max(0, aiQuotaLimit - aiQuotaUsed) },
  };
}
