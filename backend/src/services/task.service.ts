import type { Types } from 'mongoose';
import { Colleague } from '../models/Colleague';
import { Task, type TaskDocument } from '../models/Task';
import { ApiError } from '../utils/ApiError';
import { escapeRegex } from '../utils/helpers';

export const ASSIGNED_BY_FIELDS = 'name position department email zaloPhone';

/** Ensure the colleague belongs to the user; returns its id (or null to clear). */
export async function resolveColleagueId(
  userId: Types.ObjectId,
  colleagueId: string | null | undefined,
): Promise<Types.ObjectId | null | undefined> {
  if (colleagueId === undefined) return undefined;
  if (colleagueId === null) return null;
  const colleague = await Colleague.findOne({ _id: colleagueId, userId }).select('_id');
  if (!colleague) throw ApiError.badRequest('Người giao việc không tồn tại trong danh bạ của bạn');
  return colleague._id;
}

export async function findOwnedTask(userId: Types.ObjectId, taskId: Types.ObjectId): Promise<TaskDocument> {
  const task = await Task.findOne({ _id: taskId, userId });
  if (!task) throw ApiError.notFound('Không tìm thấy công việc');
  return task;
}

/** Find a colleague matching a Zalo sender by phone number first, then by exact name. */
export async function matchColleagueBySender(
  userId: Types.ObjectId,
  senderPhone?: string,
  senderName?: string,
): Promise<Types.ObjectId | null> {
  const digits = senderPhone?.replace(/\D/g, '');
  if (digits && digits.length >= 8) {
    // Compare by trailing 9 digits so "+84 912..." matches "0912...".
    const tail = digits.slice(-9);
    const candidates = await Colleague.find({ userId, zaloPhone: { $ne: '' } }).select('_id zaloPhone');
    const hit = candidates.find((c) => c.zaloPhone.replace(/\D/g, '').endsWith(tail));
    if (hit) return hit._id;
  }
  if (senderName) {
    const hit = await Colleague.findOne({
      userId,
      name: new RegExp(`^${escapeRegex(senderName.trim())}$`, 'i'),
    }).select('_id');
    if (hit) return hit._id;
  }
  return null;
}
