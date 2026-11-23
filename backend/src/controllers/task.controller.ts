import type { Request, Response } from 'express';
import type { PipelineStage, Types } from 'mongoose';
import { getAuthUser } from '../middleware/auth.middleware';
import { ActivityLog } from '../models/ActivityLog';
import { Task, TASK_PRIORITIES, TASK_SOURCES, TASK_STATUSES } from '../models/Task';
import { logActivity } from '../services/activityLog.service';
import { summarizeForUser } from '../services/ai.service';
import { ASSIGNED_BY_FIELDS, findOwnedTask, resolveColleagueId } from '../services/task.service';
import { ApiError } from '../utils/ApiError';
import { buildPagination, sendSuccess } from '../utils/apiResponse';
import { addDays, escapeRegex, toObjectId } from '../utils/helpers';
import {
  aiSummarizeSchema,
  createTaskSchema,
  listTasksQuerySchema,
  statsQuerySchema,
  toggleChecklistSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from '../validators/task.schema';

const PRIORITY_RANK_EXPR = {
  $switch: {
    branches: TASK_PRIORITIES.map((p, i) => ({ case: { $eq: ['$priority', p] }, then: i })),
    default: 0,
  },
};

function taskIdParam(req: Request): Types.ObjectId {
  return toObjectId(req.params.id as string, 'Task ID');
}

/* ------------------------------------------------------------------ AI -- */

export async function aiSummarize(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { rawContent, source } = aiSummarizeSchema.parse(req.body);

  const result = await summarizeForUser(user._id, rawContent, source);
  const { quota, isMock, ...summary } = result;

  return sendSuccess(
    res,
    { ...summary, isMock, quota },
    isMock ? 'Tóm tắt mẫu (chưa cấu hình GEMINI_API_KEY)' : 'AI đã tóm tắt nội dung',
  );
}

/* --------------------------------------------------------------- Stats -- */

export async function getStats(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { upcomingDays, upcomingLimit } = statsQuerySchema.parse(req.query);
  const now = new Date();

  type CountRow = { _id: string; count: number };
  const [facet] = await Task.aggregate<{
    byStatus: CountRow[];
    bySource: CountRow[];
    byPriority: CountRow[];
    overdue: { count: number }[];
  }>([
    { $match: { userId: user._id } },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
        overdue: [
          { $match: { status: 'IN_PROGRESS', deadline: { $ne: null, $lt: now } } },
          { $count: 'count' },
        ],
      },
    },
  ]);

  const toRecord = <K extends string>(keys: readonly K[], rows: CountRow[] = []) =>
    Object.fromEntries(keys.map((k) => [k, rows.find((r) => r._id === k)?.count ?? 0])) as Record<K, number>;

  const byStatus = toRecord(TASK_STATUSES, facet?.byStatus);
  const total = byStatus.IN_PROGRESS + byStatus.COMPLETED + byStatus.INCOMPLETE;
  const completionRate = total === 0 ? 0 : Math.round((byStatus.COMPLETED / total) * 1000) / 10;

  const upcoming = await Task.find({
    userId: user._id,
    status: 'IN_PROGRESS',
    deadline: { $gte: now, $lte: addDays(now, upcomingDays) },
  })
    .sort({ deadline: 1 })
    .limit(upcomingLimit)
    .select('title priority status deadline source assignedBy checklist')
    .populate('assignedBy', ASSIGNED_BY_FIELDS);

  return sendSuccess(
    res,
    {
      total,
      inProgress: byStatus.IN_PROGRESS,
      completed: byStatus.COMPLETED,
      incomplete: byStatus.INCOMPLETE,
      overdue: facet?.overdue[0]?.count ?? 0,
      completionRate,
      bySource: toRecord(TASK_SOURCES, facet?.bySource),
      byPriority: toRecord(TASK_PRIORITIES, facet?.byPriority),
      upcomingDays,
      upcoming,
      aiQuota: {
        used: user.aiQuotaUsed,
        limit: user.aiQuotaLimit,
        remaining: Math.max(0, user.aiQuotaLimit - user.aiQuotaUsed),
      },
    },
    'Lấy thống kê thành công',
  );
}

/* ---------------------------------------------------------------- CRUD -- */

export async function listTasks(req: Request, res: Response) {
  const user = getAuthUser(req);
  const query = listTasksQuerySchema.parse(req.query);
  const { page, limit, sortBy, sortOrder } = query;

  const match: Record<string, unknown> = { userId: user._id };
  if (query.status) match.status = query.status;
  if (query.priority) match.priority = query.priority;
  if (query.source) match.source = query.source;
  if (query.assignedBy) match.assignedBy = toObjectId(query.assignedBy);
  if (query.deadlineFrom || query.deadlineTo) {
    match.deadline = {
      ...(query.deadlineFrom && { $gte: query.deadlineFrom }),
      ...(query.deadlineTo && { $lte: query.deadlineTo }),
    };
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    match.$or = [{ title: rx }, { aiSummary: rx }, { rawContent: rx }];
  }

  const dir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> =
    sortBy === 'priority'
      ? { priorityRank: dir, createdAt: -1 }
      : sortBy === 'deadline'
        ? { noDeadline: 1, deadline: dir, createdAt: -1 } // tasks without deadline always last
        : { [sortBy]: dir, _id: dir };

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        priorityRank: PRIORITY_RANK_EXPR,
        noDeadline: { $cond: [{ $eq: [{ $ifNull: ['$deadline', null] }, null] }, 1, 0] },
      },
    },
    { $sort: sort },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    { $project: { priorityRank: 0, noDeadline: 0, __v: 0 } },
  ];

  const [rows, total] = await Promise.all([Task.aggregate(pipeline), Task.countDocuments(match)]);
  const items = await Task.populate(rows, { path: 'assignedBy', select: ASSIGNED_BY_FIELDS });

  return sendSuccess(res, { items, pagination: buildPagination(page, limit, total) }, 'Lấy danh sách công việc thành công');
}

export async function getTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const task = await findOwnedTask(user._id, taskIdParam(req));
  await task.populate('assignedBy', ASSIGNED_BY_FIELDS);
  return sendSuccess(res, task, 'OK');
}

export async function createTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = createTaskSchema.parse(req.body);

  const task = await Task.create({
    userId: user._id,
    title: input.title,
    rawContent: input.rawContent,
    aiSummary: input.aiSummary,
    checklist: input.checklist,
    source: input.source,
    assignedBy: (await resolveColleagueId(user._id, input.assignedBy)) ?? null,
    priority: input.priority,
    deadline: input.deadline ?? null,
    status: 'IN_PROGRESS',
  });

  await logActivity({ userId: user._id, taskId: task._id, action: 'TASK_CREATED', metadata: { source: task.source } });
  await task.populate('assignedBy', ASSIGNED_BY_FIELDS);

  return sendSuccess(res, task, 'Đã tạo công việc', 201);
}

export async function updateTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = updateTaskSchema.parse(req.body);
  const task = await findOwnedTask(user._id, taskIdParam(req));

  const { assignedBy, checklist, ...rest } = input;
  task.set(rest);
  if (assignedBy !== undefined) task.assignedBy = (await resolveColleagueId(user._id, assignedBy)) ?? null;
  if (checklist !== undefined) task.set('checklist', checklist);

  await task.save();
  await logActivity({
    userId: user._id,
    taskId: task._id,
    action: 'TASK_UPDATED',
    metadata: { fields: Object.keys(input) },
  });
  await task.populate('assignedBy', ASSIGNED_BY_FIELDS);

  return sendSuccess(res, task, 'Đã cập nhật công việc');
}

export async function deleteTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const task = await findOwnedTask(user._id, taskIdParam(req));
  await task.deleteOne();
  await logActivity({ userId: user._id, taskId: task._id, action: 'TASK_DELETED', metadata: { title: task.title } });
  return sendSuccess(res, { _id: task._id }, 'Đã xoá công việc');
}

/* ----------------------------------------------------- Checklist/status -- */

export async function toggleChecklistItem(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { isDone } = toggleChecklistSchema.parse(req.body ?? {});
  const task = await findOwnedTask(user._id, taskIdParam(req));

  const item = task.checklist.id(toObjectId(req.params.itemId as string, 'Checklist item ID'));
  if (!item) throw ApiError.notFound('Không tìm thấy mục checklist');

  item.isDone = isDone ?? !item.isDone;
  await task.save();

  await logActivity({
    userId: user._id,
    taskId: task._id,
    action: 'CHECKLIST_TOGGLED',
    metadata: { itemId: item._id, text: item.text, isDone: item.isDone },
  });
  await task.populate('assignedBy', ASSIGNED_BY_FIELDS);

  const doneCount = task.checklist.filter((c) => c.isDone).length;
  return sendSuccess(
    res,
    task,
    `Đã ${item.isDone ? 'đánh dấu hoàn thành' : 'bỏ đánh dấu'} (${doneCount}/${task.checklist.length})`,
  );
}

export async function updateTaskStatus(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { status, incompleteReason, deadline } = updateTaskStatusSchema.parse(req.body);
  const task = await findOwnedTask(user._id, taskIdParam(req));

  const previousStatus = task.status;
  const previousDeadline = task.deadline;

  task.status = status;
  if (status === 'COMPLETED') {
    task.completedAt = new Date();
    task.incompleteReason = null;
  } else if (status === 'INCOMPLETE') {
    task.completedAt = null;
    task.incompleteReason = incompleteReason ?? null;
  } else {
    // Re-opened
    task.completedAt = null;
    task.incompleteReason = null;
  }
  if (deadline !== undefined) task.deadline = deadline;

  await task.save();
  await logActivity({
    userId: user._id,
    taskId: task._id,
    action: 'TASK_STATUS_CHANGED',
    metadata: {
      from: previousStatus,
      to: status,
      incompleteReason: task.incompleteReason,
      ...(deadline !== undefined && { previousDeadline, newDeadline: task.deadline }),
    },
  });
  await task.populate('assignedBy', ASSIGNED_BY_FIELDS);

  const messages = {
    COMPLETED: 'Đã chốt hoàn thành công việc',
    INCOMPLETE: 'Đã ghi nhận công việc chưa hoàn thành',
    IN_PROGRESS: 'Đã mở lại công việc',
  } as const;
  return sendSuccess(res, task, messages[status]);
}

export async function getTaskActivities(req: Request, res: Response) {
  const user = getAuthUser(req);
  const taskId = taskIdParam(req);
  // Verify ownership first (deleted tasks' logs remain but aren't exposed via this route).
  await findOwnedTask(user._id, taskId);

  const items = await ActivityLog.find({ userId: user._id, taskId }).sort({ createdAt: -1 }).limit(100);
  return sendSuccess(res, items, 'OK');
}
