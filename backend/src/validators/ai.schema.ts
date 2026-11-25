import { z } from 'zod';
import { REPLY_CHANNELS, REPLY_TONES } from '../services/aiFeatures.service';

export const weeklyReportSchema = z.object({
  // 0 = this week, -1 = last week, ...
  weekOffset: z.coerce.number().int().min(-12).max(0).default(0),
});

export const draftReplySchema = z.object({
  tone: z.enum(REPLY_TONES).default('CONFIRM'),
  channel: z.enum(REPLY_CHANNELS).default('EMAIL'),
  note: z.string().trim().max(1_000).optional(),
});

export const assistantSchema = z.object({
  question: z.string().trim().min(2, 'Vui lòng nhập câu hỏi').max(1_000),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(6_000) }))
    .max(12)
    .default([]),
});

export const calendarQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((d) => d.to > d.from, { message: '"to" phải sau "from"', path: ['to'] })
  .refine((d) => d.to.getTime() - d.from.getTime() <= 62 * 86_400_000, { message: 'Khoảng thời gian tối đa 62 ngày', path: ['to'] });

/** A file sent as base64 JSON (images are resized in the browser to stay under the platform body limit). */
export const fileInputSchema = z.object({
  mimeType: z.string().trim().min(3).max(100),
  data: z.string().min(16, 'File rỗng').max(9_000_000, 'File quá lớn'),
  filename: z.string().trim().max(200).optional(),
});

export const summarizeFileSchema = z.object({
  file: fileInputSchema,
  source: z.enum(['MANUAL', 'GMAIL', 'ZALO', 'TELEGRAM', 'MEETING']).default('MANUAL'),
  note: z.string().trim().max(1_000).optional(),
});

export const meetingSchema = z
  .object({
    file: fileInputSchema.optional(),
    text: z.string().max(30_000).optional(),
    note: z.string().trim().max(1_000).optional(),
  })
  .refine((d) => !!d.file || (d.text?.trim().length ?? 0) >= 10, {
    message: 'Hãy ghi âm, tải file hoặc dán nội dung cuộc họp (tối thiểu 10 ký tự).',
    path: ['text'],
  });
