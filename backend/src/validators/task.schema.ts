import { z } from 'zod';
import { TASK_PRIORITIES, TASK_SOURCES, TASK_STATUSES } from '../models/Task';
import { nullableDateSchema, objectIdSchema, paginationSchema, searchSchema } from './common.schema';

const checklistItemInput = z.object({
  text: z.string().trim().min(1, 'Nội dung checklist không được trống').max(500),
  isDone: z.boolean().default(false),
});

export const aiSummarizeSchema = z.object({
  rawContent: z.string().trim().min(10, 'Nội dung cần tóm tắt quá ngắn (tối thiểu 10 ký tự)').max(20_000),
  source: z.enum(TASK_SOURCES).default('MANUAL'),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Vui lòng nhập tiêu đề').max(200),
  rawContent: z.string().max(20_000).default(''),
  aiSummary: z.string().max(5_000).default(''),
  checklist: z.array(checklistItemInput).max(50).default([]),
  source: z.enum(TASK_SOURCES).default('MANUAL'),
  assignedBy: objectIdSchema.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  deadline: nullableDateSchema.optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    rawContent: z.string().max(20_000),
    aiSummary: z.string().max(5_000),
    checklist: z
      .array(checklistItemInput.extend({ _id: objectIdSchema.optional() }))
      .max(50),
    source: z.enum(TASK_SOURCES),
    assignedBy: objectIdSchema.nullable(),
    priority: z.enum(TASK_PRIORITIES),
    deadline: nullableDateSchema,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Không có dữ liệu cần cập nhật');

export const toggleChecklistSchema = z.object({
  isDone: z.boolean().optional(),
});

export const updateTaskStatusSchema = z
  .object({
    status: z.enum(TASK_STATUSES),
    incompleteReason: z.string().trim().max(1_000).optional(),
    deadline: nullableDateSchema.optional(),
  })
  .superRefine((d, ctx) => {
    if (d.status === 'INCOMPLETE' && !d.incompleteReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['incompleteReason'],
        message: 'Vui lòng nhập lý do chưa hoàn thành',
      });
    }
  });

export const listTasksQuerySchema = paginationSchema.extend({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  source: z.enum(TASK_SOURCES).optional(),
  assignedBy: objectIdSchema.optional(),
  q: searchSchema,
  deadlineFrom: z.coerce.date().optional(),
  deadlineTo: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'deadline', 'priority']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const statsQuerySchema = z.object({
  upcomingDays: z.coerce.number().int().min(1).max(90).default(7),
  upcomingLimit: z.coerce.number().int().min(1).max(50).default(10),
});

export const bulkCreateTasksSchema = z.object({
  tasks: z
    .array(createTaskSchema)
    .min(1, 'Chọn ít nhất một công việc')
    .max(20, 'Tối đa 20 công việc mỗi lần'),
});
