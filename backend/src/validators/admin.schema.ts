import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '../models/User';
import { paginationSchema, searchSchema } from './common.schema';
import { passwordSchema } from './auth.schema';

export const listUsersQuerySchema = paginationSchema.extend({
  search: searchSchema,
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export const createTrialUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(120),
  email: z.email('Email không hợp lệ').trim().toLowerCase(),
  password: passwordSchema,
  trialDays: z.coerce.number().int().min(1, 'Số ngày dùng thử tối thiểu 1').max(365, 'Tối đa 365 ngày'),
  aiQuotaLimit: z.coerce.number().int().min(0).max(100_000).default(50),
});

export const extendTrialSchema = z.object({
  days: z.coerce.number().int().min(1, 'Số ngày gia hạn tối thiểu 1').max(365, 'Tối đa 365 ngày'),
});

export const resetQuotaSchema = z.object({
  aiQuotaLimit: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
});
