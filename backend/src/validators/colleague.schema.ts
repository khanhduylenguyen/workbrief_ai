import { z } from 'zod';
import { paginationSchema, searchSchema } from './common.schema';

const optionalEmail = z.union([z.literal(''), z.email('Email không hợp lệ').trim().toLowerCase()]);

const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9+\-\s().]*$/, 'Số điện thoại không hợp lệ');

export const createColleagueSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên').max(120),
  position: z.string().trim().max(120).default(''),
  department: z.string().trim().max(120).default(''),
  email: optionalEmail.default(''),
  zaloPhone: phoneSchema.default(''),
});

export const updateColleagueSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    position: z.string().trim().max(120),
    department: z.string().trim().max(120),
    email: optionalEmail,
    zaloPhone: phoneSchema,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có dữ liệu cần cập nhật');

export const listColleaguesQuerySchema = paginationSchema.extend({
  search: searchSchema,
  department: searchSchema,
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
