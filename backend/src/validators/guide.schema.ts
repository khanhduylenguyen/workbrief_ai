import { z } from 'zod';
import { GUIDE_INPUT_KINDS } from '../models/Guide';
import { TASK_PRIORITIES } from '../models/Task';
import { fileInputSchema } from './ai.schema';
import { nullableDateSchema, objectIdSchema, paginationSchema, searchSchema } from './common.schema';

export const guideExtractSchema = z
  .object({
    file: fileInputSchema.optional(),
    text: z.string().max(30_000).optional(),
    note: z.string().trim().max(1_000).optional(),
  })
  .refine((d) => !!d.file || (d.text?.trim().length ?? 0) >= 10, {
    message: 'Hãy ghi âm, chụp ảnh / tải file hoặc gõ nội dung được hướng dẫn (tối thiểu 10 ký tự).',
    path: ['text'],
  });

const stepSchema = z.object({
  text: z.string().trim().min(1, 'Bước không được để trống').max(1_000),
  detail: z.string().trim().max(2_000).default(''),
});

const todoSchema = z.object({
  _id: objectIdSchema.optional(),
  text: z.string().trim().min(1, 'Việc cần làm không được để trống').max(500),
  isDone: z.boolean().default(false),
  taskId: objectIdSchema.nullish(),
});

const guideFields = {
  title: z.string().trim().min(1, 'Vui lòng nhập tiêu đề').max(200),
  topic: z.string().trim().max(80).default(''),
  taughtBy: z.string().trim().max(120).default(''),
  colleagueId: objectIdSchema.nullish(),
  summary: z.string().trim().max(3_000).default(''),
  steps: z.array(stepSchema).max(50).default([]),
  tips: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  todos: z.array(todoSchema).max(30).default([]),
  rawNote: z.string().max(30_000).default(''),
  inputKind: z.enum(GUIDE_INPUT_KINDS).default('manual'),
  isMock: z.boolean().default(false),
  pinned: z.boolean().default(false),
};

export const createGuideSchema = z.object(guideFields);

/** Partial update: only the fields sent are changed (no defaults applied). */
export const updateGuideSchema = z
  .object({
    title: guideFields.title,
    topic: z.string().trim().max(80),
    taughtBy: z.string().trim().max(120),
    colleagueId: objectIdSchema.nullable(),
    summary: z.string().trim().max(3_000),
    steps: z.array(stepSchema).max(50),
    tips: z.array(z.string().trim().min(1).max(500)).max(30),
    todos: z.array(todoSchema).max(30),
    pinned: z.boolean(),
  })
  .partial();

export const listGuidesQuerySchema = paginationSchema.extend({
  search: searchSchema,
  topic: searchSchema,
});

export const guideTasksSchema = z.object({
  todoIds: z.array(objectIdSchema).min(1, 'Chọn ít nhất một việc').max(30),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  deadline: nullableDateSchema.optional(),
  /** Copy the guide's steps into each task's checklist. */
  includeSteps: z.boolean().default(true),
});
