import type { Types } from 'mongoose';
import { env } from '../config/env';
import { Task, type TaskPriority } from '../models/Task';
import { Team, type TeamDocument } from '../models/Team';
import { User, type UserDocument } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { escapeRegex } from '../utils/helpers';
import { formatDateTimeVi } from '../utils/time';
import { logActivity } from './activityLog.service';
import { escapeTelegramHtml, notifyUserOnTelegram } from './telegram.service';

const MEMBER_FIELDS = 'fullName email status';
const PRIORITY_VI = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' } as const;

export async function findTeamOfUser(userId: Types.ObjectId): Promise<TeamDocument | null> {
  return Team.findOne({ memberIds: userId });
}

export function isLeader(team: TeamDocument, userId: Types.ObjectId): boolean {
  return team.leaderId.equals(userId);
}

async function findUserByEmail(email: string): Promise<UserDocument> {
  const user = await User.findOne({ email: new RegExp(`^${escapeRegex(email.trim())}$`, 'i') });
  if (!user) throw ApiError.notFound(`Không tìm thấy tài khoản ${email}`);
  return user;
}

async function assertNotInAnotherTeam(userId: Types.ObjectId, exceptTeamId?: Types.ObjectId): Promise<void> {
  const other = await Team.findOne({ memberIds: userId, ...(exceptTeamId && { _id: { $ne: exceptTeamId } }) }).select('name');
  if (other) throw ApiError.conflict(`Tài khoản này đang ở nhóm "${other.name}". Mỗi người chỉ thuộc một nhóm.`);
}

/* ---------------------------------------------------------------- Admin -- */

export async function adminListTeams() {
  const teams = await Team.find().sort({ createdAt: -1 }).populate('leaderId', MEMBER_FIELDS).populate('memberIds', MEMBER_FIELDS);
  const counts = await Task.aggregate<{ _id: Types.ObjectId; total: number; open: number }>([
    { $match: { teamId: { $in: teams.map((t) => t._id) } } },
    { $group: { _id: '$teamId', total: { $sum: 1 }, open: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } } } },
  ]);
  const byTeam = new Map(counts.map((c) => [c._id.toString(), c]));
  return teams.map((t) => ({
    ...t.toJSON(),
    taskCount: byTeam.get(t._id.toString())?.total ?? 0,
    openTaskCount: byTeam.get(t._id.toString())?.open ?? 0,
  }));
}

export async function adminCreateTeam(adminId: Types.ObjectId, name: string, leaderEmail: string) {
  const leader = await findUserByEmail(leaderEmail);
  await assertNotInAnotherTeam(leader._id);
  return Team.create({ name, leaderId: leader._id, memberIds: [leader._id], createdBy: adminId });
}

async function loadTeam(teamId: Types.ObjectId): Promise<TeamDocument> {
  const team = await Team.findById(teamId);
  if (!team) throw ApiError.notFound('Không tìm thấy nhóm');
  return team;
}

export async function adminUpdateTeam(teamId: Types.ObjectId, input: { name?: string; leaderEmail?: string }) {
  const team = await loadTeam(teamId);
  if (input.name) team.name = input.name;
  if (input.leaderEmail) {
    const leader = await findUserByEmail(input.leaderEmail);
    await assertNotInAnotherTeam(leader._id, team._id);
    team.leaderId = leader._id;
    if (!team.memberIds.some((m) => m.equals(leader._id))) team.memberIds.push(leader._id);
  }
  await team.save();
  return team;
}

export async function adminAddMember(teamId: Types.ObjectId, email: string) {
  const team = await loadTeam(teamId);
  const user = await findUserByEmail(email);
  if (team.memberIds.some((m) => m.equals(user._id))) throw ApiError.conflict('Người này đã ở trong nhóm.');
  await assertNotInAnotherTeam(user._id);
  team.memberIds.push(user._id);
  await team.save();
  return team;
}

export async function adminRemoveMember(teamId: Types.ObjectId, userId: Types.ObjectId) {
  const team = await loadTeam(teamId);
  if (team.leaderId.equals(userId)) throw ApiError.badRequest('Không thể xoá trưởng nhóm — hãy đổi trưởng nhóm trước.');
  team.memberIds = team.memberIds.filter((m) => !m.equals(userId));
  await team.save();
  return team;
}

/** Deletes the team. Tasks already assigned stay with their owners (teamId is cleared). */
export async function adminDeleteTeam(teamId: Types.ObjectId) {
  const team = await loadTeam(teamId);
  await Task.updateMany({ teamId: team._id }, { $set: { teamId: null } });
  await team.deleteOne();
}

/* ------------------------------------------------------------ Team view -- */

export interface MemberStats {
  _id: string;
  fullName: string;
  email: string;
  isLeader: boolean;
  total: number;
  open: number;
  completed: number;
  incomplete: number;
  overdue: number;
  completionRate: number | null;
  lastActivityAt: Date | null;
}

/** Team overview for the current user. Stats only cover tasks assigned inside the team (privacy). */
export async function getMyTeam(user: UserDocument) {
  const team = await findTeamOfUser(user._id);
  if (!team) return null;
  await team.populate('memberIds', MEMBER_FIELDS);
  const leader = isLeader(team, user._id);
  const members = team.memberIds as unknown as { _id: Types.ObjectId; fullName: string; email: string; status: string }[];
  const leaderDoc = members.find((m) => m._id.equals(team.leaderId));

  let stats: MemberStats[] | null = null;
  if (leader) {
    const now = new Date();
    const rows = await Task.aggregate<{
      _id: Types.ObjectId;
      total: number;
      open: number;
      completed: number;
      incomplete: number;
      overdue: number;
      last: Date;
    }>([
      { $match: { teamId: team._id } },
      {
        $group: {
          _id: '$userId',
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          incomplete: { $sum: { $cond: [{ $eq: ['$status', 'INCOMPLETE'] }, 1, 0] } },
          overdue: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'IN_PROGRESS'] }, { $ne: ['$deadline', null] }, { $lt: ['$deadline', now] }] }, 1, 0] },
          },
          last: { $max: '$updatedAt' },
        },
      },
    ]);
    const byUser = new Map(rows.map((r) => [r._id.toString(), r]));
    stats = members.map((m) => {
      const r = byUser.get(m._id.toString());
      const closed = (r?.completed ?? 0) + (r?.incomplete ?? 0);
      return {
        _id: m._id.toString(),
        fullName: m.fullName,
        email: m.email,
        isLeader: m._id.equals(team.leaderId),
        total: r?.total ?? 0,
        open: r?.open ?? 0,
        completed: r?.completed ?? 0,
        incomplete: r?.incomplete ?? 0,
        overdue: r?.overdue ?? 0,
        completionRate: closed === 0 ? null : Math.round(((r?.completed ?? 0) / closed) * 1000) / 10,
        lastActivityAt: r?.last ?? null,
      };
    });
  }

  return {
    team: { _id: team._id, name: team.name },
    role: leader ? ('LEADER' as const) : ('MEMBER' as const),
    leader: leaderDoc ? { _id: leaderDoc._id, fullName: leaderDoc.fullName, email: leaderDoc.email } : null,
    members: members.map((m) => ({ _id: m._id, fullName: m.fullName, email: m.email, isLeader: m._id.equals(team.leaderId) })),
    memberStats: stats,
  };
}

async function requireLeaderTeam(user: UserDocument): Promise<TeamDocument> {
  const team = await findTeamOfUser(user._id);
  if (!team) throw ApiError.forbidden('Bạn chưa thuộc nhóm nào.');
  if (!isLeader(team, user._id)) throw ApiError.forbidden('Chỉ trưởng nhóm mới thực hiện được thao tác này.');
  return team;
}

export interface TeamTaskInput {
  memberIds: string[];
  title: string;
  aiSummary?: string;
  rawContent?: string;
  checklist?: { text: string; isDone: boolean }[];
  priority: TaskPriority;
  deadline?: Date | null;
}

/** Leader assigns one task to each selected member (each gets their own copy to track). */
export async function assignTeamTask(leader: UserDocument, input: TeamTaskInput) {
  const team = await requireLeaderTeam(leader);
  const memberSet = new Set(team.memberIds.map((m) => m.toString()));
  const targets = [...new Set(input.memberIds)];
  const outsider = targets.find((id) => !memberSet.has(id));
  if (outsider) throw ApiError.badRequest('Có người được chọn không thuộc nhóm của bạn.');

  const created = [];
  for (const memberId of targets) {
    const task = await Task.create({
      userId: memberId,
      title: input.title,
      aiSummary: input.aiSummary ?? '',
      rawContent: input.rawContent ?? '',
      checklist: input.checklist ?? [],
      source: 'TEAM',
      assignedByUser: leader._id,
      teamId: team._id,
      priority: input.priority,
      deadline: input.deadline ?? null,
      status: 'IN_PROGRESS',
    });
    created.push(task);
    await logActivity({ userId: task.userId, taskId: task._id, action: 'TEAM_TASK_ASSIGNED', metadata: { by: leader._id, team: team.name } });

    if (!task.userId.equals(leader._id)) {
      const lines = [
        `📌 <b>${escapeTelegramHtml(leader.fullName)}</b> (trưởng nhóm ${escapeTelegramHtml(team.name)}) giao việc mới:`,
        `<b>${escapeTelegramHtml(task.title)}</b>`,
        `Ưu tiên: ${PRIORITY_VI[task.priority]}${task.deadline ? ` · Hạn: ${formatDateTimeVi(task.deadline, env.APP_TIMEZONE)}` : ''}`,
        `👉 ${escapeTelegramHtml(env.FRONTEND_URL.replace(/\/+$/, ''))}/tasks`,
      ];
      void notifyUserOnTelegram(task.userId, lines.join('\n')).catch(() => undefined);
    }
  }
  return created;
}

export async function listTeamTasks(leader: UserDocument, { memberId, status }: { memberId?: string; status?: string }) {
  const team = await requireLeaderTeam(leader);
  const filter: Record<string, unknown> = { teamId: team._id };
  if (memberId) filter.userId = memberId;
  if (status) filter.status = status;
  return Task.find(filter)
    .sort({ status: 1, deadline: 1, createdAt: -1 })
    .limit(300)
    .select('userId title status priority deadline checklist completedAt incompleteReason createdAt updatedAt assignedByUser')
    .populate('userId', 'fullName email')
    .populate('assignedByUser', 'fullName');
}

/** Leader withdraws a task they assigned (deletes the member's copy). */
export async function recallTeamTask(leader: UserDocument, taskId: Types.ObjectId) {
  const team = await requireLeaderTeam(leader);
  const task = await Task.findOne({ _id: taskId, teamId: team._id });
  if (!task) throw ApiError.notFound('Không tìm thấy việc trong nhóm');
  await task.deleteOne();
  await logActivity({ userId: task.userId, taskId: task._id, action: 'TEAM_TASK_RECALLED', metadata: { by: leader._id, title: task.title } });
  if (!task.userId.equals(leader._id)) {
    void notifyUserOnTelegram(task.userId, `↩️ Trưởng nhóm đã thu hồi việc: <b>${escapeTelegramHtml(task.title)}</b>`).catch(() => undefined);
  }
}
