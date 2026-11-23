import type { Types } from 'mongoose';
import { ActivityLog, type ActivityAction } from '../models/ActivityLog';

interface LogActivityInput {
  userId: Types.ObjectId;
  action: ActivityAction;
  taskId?: Types.ObjectId | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write an activity log entry. Logging must never break the main request,
 * so failures are reported to the console and swallowed.
 */
export async function logActivity({ userId, action, taskId = null, metadata = {} }: LogActivityInput): Promise<void> {
  try {
    await ActivityLog.create({ userId, action, taskId, metadata });
  } catch (err) {
    console.error(`⚠️  Failed to write activity log (${action}):`, err);
  }
}
