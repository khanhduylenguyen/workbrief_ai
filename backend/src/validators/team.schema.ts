import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '../models/Task';
import { nullableDateSchema, objectIdSchema } from './common.schema';

export const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Vui lòng nhập tên nhóm').max(120),
  leaderEmail: z.email('Email trưởng nhóm không hợp lệ').trim().toLowerCase(),
});

export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    leaderEmail: z.email('Email trưởng nhóm không hợp lệ').trim().toLowerCase().optional(),
  })
  .refine((d) => d.name || d.leaderEmail, 'Không có dữ liệu cần cập nhật');

export const addMemberSchema = z.object({
  email: z.email('Email không hợp lệ').trim().toLowerCase(),
});

export const teamTaskSchema = z.object({
  memberIds: z.array(objectIdSchema).min(1, 'Chọn ít nhất một thành viên').max(50),
  title: z.string().trim().min(1, 'Vui lòng nhập tiêu đề').max(200),
  aiSummary: z.string().max(5_000).optional(),
  rawContent: z.string().max(20_000).optional(),
  checklist: z
    .array(z.object({ text: z.string().trim().min(1).max(500), isDone: z.boolean().default(false) }))
    .max(50)
    .optional(),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  deadline: nullableDateSchema.optional(),
});

export const teamTasksQuerySchema = z.object({
  memberId: objectIdSchema.optional(),
  status: z.enum(TASK_STATUSES).optional(),
});
