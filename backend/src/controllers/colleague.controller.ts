import type { Request, Response } from 'express';
import type { QueryFilter } from 'mongoose';
import { getAuthUser } from '../middleware/auth.middleware';
import { Colleague, type IColleague } from '../models/Colleague';
import { Task } from '../models/Task';
import { ApiError } from '../utils/ApiError';
import { buildPagination, sendSuccess } from '../utils/apiResponse';
import { escapeRegex, toObjectId } from '../utils/helpers';
import {
  createColleagueSchema,
  listColleaguesQuerySchema,
  updateColleagueSchema,
} from '../validators/colleague.schema';

async function findOwnedColleague(req: Request) {
  const user = getAuthUser(req);
  const colleague = await Colleague.findOne({ _id: toObjectId(req.params.id as string, 'Colleague ID'), userId: user._id });
  if (!colleague) throw ApiError.notFound('Không tìm thấy đồng nghiệp');
  return colleague;
}

export async function listColleagues(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { page, limit, search, department } = listColleaguesQuerySchema.parse(req.query);

  const filter: QueryFilter<IColleague> = { userId: user._id };
  if (department) filter.department = new RegExp(`^${escapeRegex(department)}$`, 'i');
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { zaloPhone: rx }, { position: rx }, { department: rx }];
  }

  const [colleagues, total] = await Promise.all([
    Colleague.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Colleague.countDocuments(filter),
  ]);

  // Number of tasks each colleague has assigned to this user.
  const counts = await Task.aggregate<{ _id: unknown; count: number }>([
    { $match: { userId: user._id, assignedBy: { $in: colleagues.map((c) => c._id) } } },
    { $group: { _id: '$assignedBy', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
  const items = colleagues.map((c) => ({ ...c.toJSON(), taskCount: countMap.get(c._id.toString()) ?? 0 }));

  return sendSuccess(res, { items, pagination: buildPagination(page, limit, total) }, 'Lấy danh sách đồng nghiệp thành công');
}

export async function getColleague(req: Request, res: Response) {
  const colleague = await findOwnedColleague(req);
  const taskCount = await Task.countDocuments({ userId: colleague.userId, assignedBy: colleague._id });
  return sendSuccess(res, { ...colleague.toJSON(), taskCount }, 'OK');
}

export async function createColleague(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = createColleagueSchema.parse(req.body);
  const colleague = await Colleague.create({ ...input, userId: user._id });
  return sendSuccess(res, { ...colleague.toJSON(), taskCount: 0 }, 'Đã thêm đồng nghiệp', 201);
}

export async function updateColleague(req: Request, res: Response) {
  const input = updateColleagueSchema.parse(req.body);
  const colleague = await findOwnedColleague(req);
  colleague.set(input);
  await colleague.save();
  return sendSuccess(res, colleague, 'Đã cập nhật đồng nghiệp');
}

export async function deleteColleague(req: Request, res: Response) {
  const colleague = await findOwnedColleague(req);
  // Keep the tasks, just detach the deleted colleague.
  const { modifiedCount } = await Task.updateMany(
    { userId: colleague.userId, assignedBy: colleague._id },
    { $set: { assignedBy: null } },
  );
  await colleague.deleteOne();
  return sendSuccess(res, { _id: colleague._id, detachedTasks: modifiedCount }, 'Đã xoá đồng nghiệp');
}
