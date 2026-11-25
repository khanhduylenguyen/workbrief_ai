import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.middleware';
import {
  adminAddMember,
  adminCreateTeam,
  adminDeleteTeam,
  adminListTeams,
  adminRemoveMember,
  adminUpdateTeam,
  assignTeamTask,
  getMyTeam,
  listTeamTasks,
  recallTeamTask,
} from '../services/team.service';
import { sendSuccess } from '../utils/apiResponse';
import { toObjectId } from '../utils/helpers';
import { addMemberSchema, createTeamSchema, teamTaskSchema, teamTasksQuerySchema, updateTeamSchema } from '../validators/team.schema';

/* -------------------------------------------------------------- Members -- */

export async function myTeam(req: Request, res: Response) {
  const data = await getMyTeam(getAuthUser(req));
  return sendSuccess(res, data, data ? 'OK' : 'Bạn chưa thuộc nhóm nào');
}

export async function assignTask(req: Request, res: Response) {
  const input = teamTaskSchema.parse(req.body);
  const created = await assignTeamTask(getAuthUser(req), input);
  return sendSuccess(res, { items: created, count: created.length }, `Đã giao việc cho ${created.length} thành viên`, 201);
}

export async function teamTasks(req: Request, res: Response) {
  const query = teamTasksQuerySchema.parse(req.query);
  return sendSuccess(res, await listTeamTasks(getAuthUser(req), query), 'OK');
}

export async function recallTask(req: Request, res: Response) {
  await recallTeamTask(getAuthUser(req), toObjectId(req.params.id as string, 'Task ID'));
  return sendSuccess(res, null, 'Đã thu hồi việc');
}

/* ---------------------------------------------------------------- Admin -- */

export async function adminTeams(_req: Request, res: Response) {
  return sendSuccess(res, await adminListTeams(), 'OK');
}

export async function adminCreate(req: Request, res: Response) {
  const { name, leaderEmail } = createTeamSchema.parse(req.body);
  const team = await adminCreateTeam(getAuthUser(req)._id, name, leaderEmail);
  return sendSuccess(res, team, `Đã tạo nhóm ${team.name}`, 201);
}

export async function adminUpdate(req: Request, res: Response) {
  const input = updateTeamSchema.parse(req.body);
  return sendSuccess(res, await adminUpdateTeam(toObjectId(req.params.id as string, 'Team ID'), input), 'Đã cập nhật nhóm');
}

export async function adminAdd(req: Request, res: Response) {
  const { email } = addMemberSchema.parse(req.body);
  return sendSuccess(res, await adminAddMember(toObjectId(req.params.id as string, 'Team ID'), email), `Đã thêm ${email} vào nhóm`);
}

export async function adminRemove(req: Request, res: Response) {
  const team = await adminRemoveMember(toObjectId(req.params.id as string, 'Team ID'), toObjectId(req.params.userId as string, 'User ID'));
  return sendSuccess(res, team, 'Đã xoá thành viên khỏi nhóm');
}

export async function adminDelete(req: Request, res: Response) {
  await adminDeleteTeam(toObjectId(req.params.id as string, 'Team ID'));
  return sendSuccess(res, null, 'Đã xoá nhóm');
}
