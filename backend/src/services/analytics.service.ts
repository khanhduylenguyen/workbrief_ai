import type { Types } from 'mongoose';
import { env } from '../config/env';
import { Colleague } from '../models/Colleague';
import { Task, TASK_PRIORITIES, TASK_SOURCES, type TaskPriority, type TaskSource, type TaskStatus } from '../models/Task';
import { User } from '../models/User';
import { zonedParts, zonedWeekRange } from '../utils/time';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MAX_TASKS = 5_000;

interface LeanTask {
  _id: Types.ObjectId;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  deadline: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  assignedBy: Types.ObjectId | null;
  assignedByUser: Types.ObjectId | null;
}

export interface AssignerStats {
  key: string;
  kind: 'colleague' | 'leader' | 'none';
  name: string;
  position: string | null;
  total: number;
  completed: number;
  incomplete: number;
  open: number;
  overdueOpen: number;
  /** Tasks with a deadline that were finished late, closed as incomplete after it, or are open past it. */
  late: number;
  withDeadline: number;
  lateRate: number | null;
  avgCompletionHours: number | null;
}

export interface AnalyticsResult {
  rangeDays: number;
  from: Date;
  to: Date;
  truncated: boolean;
  summary: {
    created: number;
    completed: number;
    incomplete: number;
    completionRate: number | null;
    onTimeRate: number | null;
    completedWithDeadline: number;
    completedLate: number;
    avgCompletionHours: number | null;
    medianCompletionHours: number | null;
    overdueOpen: number;
  };
  byAssigner: AssignerStats[];
  byPriority: { priority: TaskPriority; total: number; completed: number; completionRate: number | null; avgCompletionHours: number | null }[];
  bySource: { source: TaskSource; total: number }[];
  weekly: { weekStart: Date; label: string; created: number; completed: number }[];
  byWeekday: { weekday: number; label: string; created: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 1000) / 10);
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round1(s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2);
}
const hoursToComplete = (t: LeanTask) => (t.completedAt ? Math.max(0, (t.completedAt.getTime() - t.createdAt.getTime()) / HOUR) : null);

function isLate(t: LeanTask, now: Date): boolean {
  if (!t.deadline) return false;
  if (t.status === 'COMPLETED') return !!t.completedAt && t.completedAt > t.deadline;
  return t.deadline < now; // open past deadline, or closed as incomplete after it
}

const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Personal analytics over tasks created or completed in the last `rangeDays` days. */
export async function getAnalytics(userId: Types.ObjectId, rangeDays: number, now = new Date()): Promise<AnalyticsResult> {
  const tz = env.APP_TIMEZONE;
  const from = new Date(now.getTime() - rangeDays * DAY);

  const tasks = (await Task.find({
    userId,
    $or: [{ createdAt: { $gte: from } }, { completedAt: { $gte: from } }],
  })
    .select('status priority source deadline completedAt createdAt assignedBy assignedByUser')
    .sort({ createdAt: -1 })
    .limit(MAX_TASKS)
    .lean()) as unknown as LeanTask[];

  const created = tasks.filter((t) => t.createdAt >= from);
  const completed = tasks.filter((t) => t.status === 'COMPLETED' && t.completedAt && t.completedAt >= from);
  const incomplete = created.filter((t) => t.status === 'INCOMPLETE');
  const completedWithDeadline = completed.filter((t) => t.deadline);
  const completedLate = completedWithDeadline.filter((t) => t.completedAt! > t.deadline!);
  const durations = completed.map(hoursToComplete).filter((h): h is number => h !== null);
  const overdueOpen = await Task.countDocuments({ userId, status: 'IN_PROGRESS', deadline: { $ne: null, $lt: now } });

  /* --- by assigner (tasks created in range) */
  const groups = new Map<string, LeanTask[]>();
  for (const t of created) {
    const key = t.assignedByUser ? `u:${t.assignedByUser}` : t.assignedBy ? `c:${t.assignedBy}` : 'none';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const colleagueIds = [...groups.keys()].filter((k) => k.startsWith('c:')).map((k) => k.slice(2));
  const leaderIds = [...groups.keys()].filter((k) => k.startsWith('u:')).map((k) => k.slice(2));
  const [colleagues, leaders] = await Promise.all([
    Colleague.find({ _id: { $in: colleagueIds }, userId }).select('name position').lean(),
    User.find({ _id: { $in: leaderIds } }).select('fullName').lean(),
  ]);
  const colleagueById = new Map(colleagues.map((c) => [c._id.toString(), c]));
  const leaderById = new Map(leaders.map((u) => [u._id.toString(), u]));

  const byAssigner: AssignerStats[] = [...groups.entries()].map(([key, list]) => {
    const kind: AssignerStats['kind'] = key.startsWith('u:') ? 'leader' : key.startsWith('c:') ? 'colleague' : 'none';
    const c = kind === 'colleague' ? colleagueById.get(key.slice(2)) : undefined;
    const l = kind === 'leader' ? leaderById.get(key.slice(2)) : undefined;
    const withDeadline = list.filter((t) => t.deadline).length;
    const late = list.filter((t) => isLate(t, now)).length;
    const done = list.filter((t) => t.status === 'COMPLETED');
    return {
      key,
      kind,
      name: kind === 'none' ? 'Tự tạo / không rõ người giao' : (c?.name ?? l?.fullName ?? '(đã xoá)'),
      position: kind === 'leader' ? 'Trưởng nhóm' : (c?.position || null),
      total: list.length,
      completed: done.length,
      incomplete: list.filter((t) => t.status === 'INCOMPLETE').length,
      open: list.filter((t) => t.status === 'IN_PROGRESS').length,
      overdueOpen: list.filter((t) => t.status === 'IN_PROGRESS' && t.deadline && t.deadline < now).length,
      late,
      withDeadline,
      lateRate: pct(late, withDeadline),
      avgCompletionHours: avg(done.map(hoursToComplete).filter((h): h is number => h !== null)),
    };
  });
  byAssigner.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));

  /* --- by priority / source (created in range) */
  const byPriority = TASK_PRIORITIES.map((priority) => {
    const list = created.filter((t) => t.priority === priority);
    const done = list.filter((t) => t.status === 'COMPLETED');
    return {
      priority,
      total: list.length,
      completed: done.length,
      completionRate: pct(done.length, list.filter((t) => t.status !== 'IN_PROGRESS').length),
      avgCompletionHours: avg(done.map(hoursToComplete).filter((h): h is number => h !== null)),
    };
  });
  const bySource = TASK_SOURCES.map((source) => ({ source, total: created.filter((t) => t.source === source).length })).filter((s) => s.total > 0);

  /* --- weekly trend (Monday-based weeks in APP_TIMEZONE) */
  const weeks = Math.min(13, Math.max(1, Math.ceil(rangeDays / 7)));
  const weekly = Array.from({ length: weeks }, (_, i) => {
    const { start, end } = zonedWeekRange(now, tz, i - (weeks - 1));
    const p = zonedParts(start, tz);
    return {
      weekStart: start,
      label: `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`,
      created: tasks.filter((t) => t.createdAt >= start && t.createdAt < end).length,
      completed: tasks.filter((t) => t.completedAt && t.completedAt >= start && t.completedAt < end).length,
    };
  });

  /* --- weekday distribution of new tasks (Mon → Sun) */
  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    label: WEEKDAY_VI[weekday]!,
    created: created.filter((t) => zonedParts(t.createdAt, tz).weekday === weekday).length,
  }));

  return {
    rangeDays,
    from,
    to: now,
    truncated: tasks.length >= MAX_TASKS,
    summary: {
      created: created.length,
      completed: completed.length,
      incomplete: incomplete.length,
      completionRate: pct(completed.length, completed.length + incomplete.length),
      onTimeRate: pct(completedWithDeadline.length - completedLate.length, completedWithDeadline.length),
      completedWithDeadline: completedWithDeadline.length,
      completedLate: completedLate.length,
      avgCompletionHours: avg(durations),
      medianCompletionHours: median(durations),
      overdueOpen,
    },
    byAssigner,
    byPriority,
    bySource,
    weekly,
    byWeekday,
  };
}
