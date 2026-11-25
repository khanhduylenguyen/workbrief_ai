import type { Request, Response } from 'express';
import type { PipelineStage, Types } from 'mongoose';
import { env } from '../config/env';
import { getAuthUser } from '../middleware/auth.middleware';
import { zonedDayRange } from '../utils/time';
import { ActivityLog } from '../models/ActivityLog';
import { Task, TASK_PRIORITIES, TASK_SOURCES, TASK_STATUSES } from '../models/Task';
import { logActivity } from '../services/activityLog.service';
import { summarizeForUser } from '../services/ai.service';
import { draftReply } from '../services/aiFeatures.service';
import { summarizeMediaForUser } from '../services/media.service';
import { getAnalytics } from '../services/analytics.service';
import { calendarQuerySchema, draftReplySchema, summarizeFileSchema } from '../validators/ai.schema';
import { ASSIGNED_BY_FIELDS, findOwnedTask, resolveColleagueId } from '../services/task.service';
import { ApiError } from '../utils/ApiError';
import { buildPagination, sendSuccess } from '../utils/apiResponse';
import { addDays, escapeRegex, toObjectId } from '../utils/helpers';
import {
  aiSummarizeSchema,
  analyticsQuerySchema,
  bulkCreateTasksSchema,
  createTaskSchema,
  listTasksQuerySchema,
  statsQuerySchema,
  toggleChecklistSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from '../validators/task.schema';

const LEADER_FIELDS = 'fullName email';

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
    dueToday: { count: number }[];
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
        dueToday: [
          { $match: { status: 'IN_PROGRESS', deadline: { $gte: now, $lt: zonedDayRange(now, env.APP_TIMEZONE).end } } },
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
    .populate('assignedBy', ASSIGNED_BY_FIELDS).populate('assignedByUser', LEADER_FIELDS);

  return sendSuccess(
    res,
    {
      total,
      inProgress: byStatus.IN_PROGRESS,
      completed: byStatus.COMPLETED,
      incomplete: byStatus.INCOMPLETE,
      overdue: facet?.overdue[0]?.count ?? 0,
      dueToday: facet?.dueToday[0]?.count ?? 0,
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
  const items = await Task.populate(rows, [
    { path: 'assignedBy', select: ASSIGNED_BY_FIELDS },
    { path: 'assignedByUser', select: LEADER_FIELDS },
  ]);

  return sendSuccess(res, { items, pagination: buildPagination(page, limit, total) }, 'Lấy danh sách công việc thành công');
}

export async function getTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const task = await findOwnedTask(user._id, taskIdParam(req));
  await task.populate([{ path: 'assignedBy', select: ASSIGNED_BY_FIELDS }, { path: 'assignedByUser', select: LEADER_FIELDS }]);
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
  await task.populate([{ path: 'assignedBy', select: ASSIGNED_BY_FIELDS }, { path: 'assignedByUser', select: LEADER_FIELDS }]);

  return sendSuccess(res, task, 'Đã tạo công việc', 201);
}

export async function updateTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = updateTaskSchema.parse(req.body);
  const task = await findOwnedTask(user._id, taskIdParam(req));

  const previousDeadline = task.deadline;
  const { assignedBy, checklist, ...rest } = input;
  task.set(rest);
  if (assignedBy !== undefined) task.assignedBy = (await resolveColleagueId(user._id, assignedBy)) ?? null;
  if (checklist !== undefined) task.set('checklist', checklist);

  await task.save();
  const onlyDeadline = Object.keys(input).length === 1 && input.deadline !== undefined;
  await logActivity({
    userId: user._id,
    taskId: task._id,
    action: onlyDeadline ? 'TASK_RESCHEDULED' : 'TASK_UPDATED',
    metadata: onlyDeadline ? { previousDeadline, newDeadline: task.deadline } : { fields: Object.keys(input) },
  });
  await task.populate([{ path: 'assignedBy', select: ASSIGNED_BY_FIELDS }, { path: 'assignedByUser', select: LEADER_FIELDS }]);

  return sendSuccess(res, task, 'Đã cập nhật công việc');
}

export async function deleteTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const task = await findOwnedTask(user._id, taskIdParam(req));
  // Team tasks are tracked by the leader; only the leader can withdraw them (via /api/team/tasks/:id).
  if (task.teamId && task.assignedByUser && !task.assignedByUser.equals(user._id)) {
    throw ApiError.forbidden('Việc do trưởng nhóm giao — không thể xoá. Hãy chốt Hoàn thành / Chưa hoàn thành, hoặc nhờ trưởng nhóm thu hồi.');
  }
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
  await task.populate([{ path: 'assignedBy', select: ASSIGNED_BY_FIELDS }, { path: 'assignedByUser', select: LEADER_FIELDS }]);

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
  await task.populate([{ path: 'assignedBy', select: ASSIGNED_BY_FIELDS }, { path: 'assignedByUser', select: LEADER_FIELDS }]);

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

/* ------------------------------------------------------------- Calendar -- */

/** Tasks with a deadline inside [from, to) plus open tasks without a deadline (for drag-to-schedule). */
export async function getCalendar(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { from, to } = calendarQuerySchema.parse(req.query);
  const fields = 'title priority status deadline source assignedBy checklist completedAt';

  const [scheduled, unscheduled] = await Promise.all([
    Task.find({ userId: user._id, deadline: { $gte: from, $lt: to } })
      .sort({ deadline: 1 })
      .limit(500)
      .select(fields)
      .populate('assignedBy', ASSIGNED_BY_FIELDS).populate('assignedByUser', LEADER_FIELDS),
    Task.find({ userId: user._id, status: 'IN_PROGRESS', deadline: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .select(fields)
      .populate('assignedBy', ASSIGNED_BY_FIELDS).populate('assignedByUser', LEADER_FIELDS),
  ]);

  return sendSuccess(res, { scheduled, unscheduled }, 'OK');
}

/* ---------------------------------------------------------- Draft reply -- */

export async function draftReplyForTask(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = draftReplySchema.parse(req.body ?? {});
  const task = await findOwnedTask(user._id, taskIdParam(req));
  await task.populate([{ path: 'assignedBy', select: ASSIGNED_BY_FIELDS }, { path: 'assignedByUser', select: LEADER_FIELDS }]);

  const result = await draftReply(user._id, user.fullName, task, input);
  return sendSuccess(res, result, result.isMock ? 'Bản nháp mẫu (chưa cấu hình GEMINI_API_KEY)' : 'AI đã soạn bản nháp');
}

/* -------------------------------------------------- AI from file / bulk -- */

/** Image / PDF / audio → one task draft (not saved). */
export async function aiSummarizeFile(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { file, source, note } = summarizeFileSchema.parse(req.body);
  const result = await summarizeMediaForUser(user._id, file, { source, note });
  return sendSuccess(res, result, `AI đã đọc ${result.kind === 'audio' ? 'ghi âm' : result.kind === 'pdf' ? 'tài liệu PDF' : 'ảnh'}`);
}

/** Create several tasks at once (e.g. from a meeting). */
export async function bulkCreateTasks(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { tasks } = bulkCreateTasksSchema.parse(req.body);

  const created = [];
  for (const input of tasks) {
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
    created.push(task);
  }
  await logActivity({
    userId: user._id,
    action: 'TASKS_BULK_CREATED',
    metadata: { count: created.length, sources: [...new Set(created.map((t) => t.source))] },
  });
  return sendSuccess(res, { items: created, count: created.length }, `Đã tạo ${created.length} công việc`, 201);
}

/* ------------------------------------------------------------ Analytics -- */

export async function getTaskAnalytics(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { rangeDays } = analyticsQuerySchema.parse(req.query);
  return sendSuccess(res, await getAnalytics(user._id, rangeDays), 'OK');
}
