import { Schema, model, type Types } from 'mongoose';

export const ACTIVITY_ACTIONS = [
  'LOGIN',
  'PASSWORD_CHANGED',
  'AI_SUMMARIZED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_DELETED',
  'TASK_STATUS_CHANGED',
  'CHECKLIST_TOGGLED',
  'ZALO_TASK_CREATED',
  'WEBHOOK_KEY_REGENERATED',
  'GMAIL_CONNECTED',
  'GMAIL_DISCONNECTED',
  'GMAIL_SYNCED',
  'GMAIL_TASK_CREATED',
  'PROFILE_UPDATED',
  'DIGEST_SENT',
  'AI_WEEKLY_REPORT',
  'AI_REPLY_DRAFTED',
  'AI_ASSISTANT_ASKED',
  'TASK_RESCHEDULED',
  'AI_FILE_SUMMARIZED',
  'AI_MEETING_EXTRACTED',
  'TASKS_BULK_CREATED',
  'TELEGRAM_LINKED',
  'TELEGRAM_UNLINKED',
  'TELEGRAM_TASK_CREATED',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface IActivityLog {
  userId: Types.ObjectId;
  taskId: Types.ObjectId | null;
  action: ActivityAction;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { versionKey: false }, minimize: false },
);

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ taskId: 1, createdAt: -1 });

export const ActivityLog = model<IActivityLog>('ActivityLog', activityLogSchema);
