import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export const TASK_SOURCES = ['MANUAL', 'GMAIL', 'ZALO', 'TELEGRAM', 'MEETING'] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'INCOMPLETE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface IChecklistItem {
  _id: Types.ObjectId;
  text: string;
  isDone: boolean;
}

export interface ITask {
  userId: Types.ObjectId;
  title: string;
  rawContent: string;
  aiSummary: string;
  checklist: Types.DocumentArray<IChecklistItem>;
  source: TaskSource;
  assignedBy: Types.ObjectId | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date | null;
  completedAt: Date | null;
  incompleteReason: string | null;
  /** Source message id (e.g. Gmail message id) — prevents importing the same message twice. */
  externalMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<ITask>;

const checklistItemSchema = new Schema<IChecklistItem>({
  text: { type: String, required: true, trim: true, maxlength: 500 },
  isDone: { type: Boolean, default: false },
});

const taskSchema = new Schema<ITask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    rawContent: { type: String, default: '', maxlength: 20_000 },
    aiSummary: { type: String, default: '', maxlength: 5_000 },
    checklist: { type: [checklistItemSchema], default: [] },
    source: { type: String, enum: TASK_SOURCES, default: 'MANUAL' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'Colleague', default: null },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'MEDIUM' },
    status: { type: String, enum: TASK_STATUSES, default: 'IN_PROGRESS' },
    deadline: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    incompleteReason: { type: String, default: null, trim: true, maxlength: 1_000 },
    externalMessageId: { type: String, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

taskSchema.index({ userId: 1, status: 1, deadline: 1 });
taskSchema.index({ userId: 1, createdAt: -1 });
taskSchema.index({ userId: 1, source: 1 });
// One task per external message per user (null ids — manual tasks — are not indexed).
taskSchema.index(
  { userId: 1, externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $type: 'string' } } },
);

export const Task = model<ITask>('Task', taskSchema);
