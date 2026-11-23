import { z } from 'zod';
import { Types } from 'mongoose';

export const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v), 'ID không hợp lệ');

/** Accepts ISO strings / timestamps; `null` or "" clears the value. */
export const nullableDateSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  z.union([z.null(), z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), 'Ngày không hợp lệ')]),
);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Optional free-text search param; empty string is treated as absent. */
export const searchSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(200).optional(),
);
