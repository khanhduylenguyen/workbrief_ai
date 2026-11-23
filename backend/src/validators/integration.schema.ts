import { z } from 'zod';

/** Payload sent by the Zalo browser extension. `message` and `rawContent` are aliases. */
export const zaloWebhookSchema = z
  .object({
    message: z.string().trim().max(20_000).optional(),
    rawContent: z.string().trim().max(20_000).optional(),
    senderName: z.string().trim().max(120).optional(),
    senderPhone: z.string().trim().max(20).optional(),
    groupName: z.string().trim().max(200).optional(),
    sentAt: z.coerce.date().optional(),
  })
  .transform((d) => ({ ...d, content: (d.message || d.rawContent || '').trim() }))
  .refine((d) => d.content.length >= 10, {
    message: 'Nội dung tin nhắn quá ngắn (tối thiểu 10 ký tự)',
    path: ['message'],
  });
