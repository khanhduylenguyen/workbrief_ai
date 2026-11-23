import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import type { QueryFilter, Types } from 'mongoose';
import { getAuthUser } from '../middleware/auth.middleware';
import { Task } from '../models/Task';
import { User, type IUser, type UserDocument } from '../models/User';
import { BCRYPT_ROUNDS } from '../seed/seedAdmin';
import { ApiError } from '../utils/ApiError';
import { buildPagination, sendSuccess } from '../utils/apiResponse';
import { addDays, escapeRegex, toObjectId } from '../utils/helpers';
import {
  createTrialUserSchema,
  extendTrialSchema,
  listUsersQuerySchema,
  resetQuotaSchema,
  updateStatusSchema,
} from '../validators/admin.schema';

interface TaskCounts {
  total: number;
  inProgress: number;
  completed: number;
  incomplete: number;
}

const EMPTY_COUNTS: TaskCounts = { total: 0, inProgress: 0, completed: 0, incomplete: 0 };

async function getTaskCounts(userIds: Types.ObjectId[]): Promise<Map<string, TaskCounts>> {
  if (userIds.length === 0) return new Map();
  const rows = await Task.aggregate<{ _id: Types.ObjectId } & TaskCounts>([
    { $match: { userId: { $in: userIds } } },
    {
      $group: {
        _id: '$userId',
        total: { $sum: 1 },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        incomplete: { $sum: { $cond: [{ $eq: ['$status', 'INCOMPLETE'] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map(({ _id, ...counts }) => [_id.toString(), counts]));
}

function serializeAdminUser(user: UserDocument, counts: TaskCounts = EMPTY_COUNTS) {
  const now = Date.now();
  const trialExpired = !!user.trialExpiresAt && user.trialExpiresAt.getTime() <= now;
  return {
    ...user.toJSON(),
    aiQuotaRemaining: Math.max(0, user.aiQuotaLimit - user.aiQuotaUsed),
    trialExpired,
    trialDaysLeft: user.trialExpiresAt
      ? Math.max(0, Math.ceil((user.trialExpiresAt.getTime() - now) / 86_400_000))
      : null,
    taskCount: counts.total,
    taskStats: counts,
  };
}

async function findUserOr404(id: string | undefined): Promise<UserDocument> {
  const user = await User.findById(toObjectId(id, 'User ID'));
  if (!user) throw ApiError.notFound('Không tìm thấy tài khoản');
  return user;
}

export async function listUsers(req: Request, res: Response) {
  const { page, limit, search, role, status } = listUsersQuerySchema.parse(req.query);

  const filter: QueryFilter<IUser> = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ fullName: rx }, { email: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const counts = await getTaskCounts(users.map((u) => u._id));
  const items = users.map((u) => serializeAdminUser(u, counts.get(u._id.toString())));

  return sendSuccess(res, { items, pagination: buildPagination(page, limit, total) }, 'Lấy danh sách tài khoản thành công');
}

export async function getUser(req: Request, res: Response) {
  const user = await findUserOr404(req.params.id as string);
  const counts = await getTaskCounts([user._id]);
  return sendSuccess(res, serializeAdminUser(user, counts.get(user._id.toString())), 'OK');
}

export async function createTrialUser(req: Request, res: Response) {
  const input = createTrialUserSchema.parse(req.body);

  const exists = await User.exists({ email: input.email });
  if (exists) throw ApiError.conflict('Email này đã được sử dụng');

  const user = await User.create({
    fullName: input.fullName,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    role: 'USER',
    status: 'ACTIVE',
    trialExpiresAt: addDays(new Date(), input.trialDays),
    aiQuotaLimit: input.aiQuotaLimit,
    aiQuotaUsed: 0,
  });

  return sendSuccess(
    res,
    serializeAdminUser(user),
    `Đã tạo tài khoản dùng thử ${input.trialDays} ngày cho ${user.email}`,
    201,
  );
}

export async function extendTrial(req: Request, res: Response) {
  const { days } = extendTrialSchema.parse(req.body);
  const user = await findUserOr404(req.params.id as string);

  if (user.role === 'ADMIN') throw ApiError.badRequest('Tài khoản Admin không có thời hạn dùng thử');

  // Extend from the current expiry if still valid, otherwise from now.
  const now = new Date();
  const base = user.trialExpiresAt && user.trialExpiresAt > now ? user.trialExpiresAt : now;
  user.trialExpiresAt = addDays(base, days);
  await user.save();

  const counts = await getTaskCounts([user._id]);
  return sendSuccess(
    res,
    serializeAdminUser(user, counts.get(user._id.toString())),
    `Đã gia hạn thêm ${days} ngày`,
  );
}

export async function resetQuota(req: Request, res: Response) {
  const { aiQuotaLimit } = resetQuotaSchema.parse(req.body ?? {});
  const user = await findUserOr404(req.params.id as string);

  user.aiQuotaUsed = 0;
  if (aiQuotaLimit !== undefined) user.aiQuotaLimit = aiQuotaLimit;
  await user.save();

  const counts = await getTaskCounts([user._id]);
  return sendSuccess(res, serializeAdminUser(user, counts.get(user._id.toString())), 'Đã reset AI quota');
}

export async function updateUserStatus(req: Request, res: Response) {
  const { status } = updateStatusSchema.parse(req.body);
  const admin = getAuthUser(req);
  const user = await findUserOr404(req.params.id as string);

  if (user._id.equals(admin._id)) throw ApiError.badRequest('Bạn không thể tự khoá tài khoản của mình');

  if (user.status !== status) {
    user.status = status;
    // Revoke all sessions immediately when suspending.
    if (status === 'SUSPENDED') user.tokenVersion += 1;
    await user.save();
  }

  const counts = await getTaskCounts([user._id]);
  return sendSuccess(
    res,
    serializeAdminUser(user, counts.get(user._id.toString())),
    status === 'SUSPENDED' ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản',
  );
}
