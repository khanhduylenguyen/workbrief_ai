import { GoogleGenAI } from '@google/genai';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { TASK_PRIORITIES, type TaskPriority, type TaskSource } from '../models/Task';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { logActivity } from './activityLog.service';

export interface AiSummaryResult {
  title: string;
  aiSummary: string;
  checklist: { text: string; isDone: boolean }[];
  suggestedPriority: TaskPriority;
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
  },
  required: ['title', 'aiSummary', 'checklist', 'suggestedPriority'],
  propertyOrdering: ['title', 'aiSummary', 'checklist', 'suggestedPriority'],
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
});

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 45_000 } });
  }
  return geminiClient;
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
  const prompt = `Nguồn: ${SOURCE_LABEL[source]}\nNgày hiện tại: ${new Date().toISOString().slice(0, 10)}\n\nNội dung:\n"""\n${rawContent}\n"""`;

  let text: string | undefined;
  try {
    const response = await getGeminiClient().models.generateContent({
      model: env.GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        temperature: 0.3,
      },
    });
    text = response.text;
  } catch (err) {
    console.error('❌ Gemini request failed:', err);
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
    isMock: false,
  };
}

const URGENT_KEYWORDS = ['gấp', 'khẩn', 'ngay lập tức', 'ngay bây giờ', 'trong hôm nay', 'asap', 'urgent', 'immediately'];
const HIGH_KEYWORDS = ['quan trọng', 'deadline', 'hạn chót', 'hôm nay', 'ngày mai', 'sếp', 'giám đốc', 'important', 'today', 'tomorrow'];
const LOW_KEYWORDS = ['tham khảo', 'khi rảnh', 'không gấp', 'fyi', 'for your information'];

/** Deterministic sample summariser used when no GEMINI_API_KEY is configured. */
export function summarizeWithMock(rawContent: string, source: TaskSource): AiSummaryResult {
  // Drop metadata header lines the Zalo webhook prepends ("Nhóm: …", "Người gửi: …", "Thời gian: …").
  const content = rawContent
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^(Nhóm|Người gửi|Thời gian):/.test(l.trim()))
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

  return { title, aiSummary, checklist, suggestedPriority, isMock: true };
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
