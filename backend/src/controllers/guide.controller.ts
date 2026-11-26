import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.middleware';
import { Guide } from '../models/Guide';
import { logActivity } from '../services/activityLog.service';
import {
  createTasksFromTodos,
  extractGuide,
  findOwnedGuide,
  listGuides,
  resolveOwnColleague,
  sanitizeTodoTaskIds,
} from '../services/guide.service';
import { buildPagination, sendSuccess } from '../utils/apiResponse';
import { toObjectId } from '../utils/helpers';
import { createGuideSchema, guideExtractSchema, guideTasksSchema, listGuidesQuerySchema, updateGuideSchema } from '../validators/guide.schema';

const guideId = (req: Request) => toObjectId(req.params.id as string, 'Guide ID');
const COLLEAGUE_FIELDS = 'name position';

/** Recording / photo / quick note → structured how-to draft (not saved). */
export async function extract(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { file, text, note } = guideExtractSchema.parse(req.body);
  const draft = await extractGuide(user._id, { media: file, text, note });
  return sendSuccess(res, draft, `AI đã sắp xếp thành ${draft.steps.length} bước`);
}

export async function list(req: Request, res: Response) {
  const user = getAuthUser(req);
  const query = listGuidesQuerySchema.parse(req.query);
  const { items, total, topics } = await listGuides(user._id, query);
  return sendSuccess(res, { items, topics, pagination: buildPagination(query.page, query.limit, total) }, 'OK');
}

export async function get(req: Request, res: Response) {
  const user = getAuthUser(req);
  const guide = await findOwnedGuide(user._id, guideId(req));
  await guide.populate([
    { path: 'colleagueId', select: COLLEAGUE_FIELDS },
    { path: 'todos.taskId', select: 'title status deadline' },
  ]);
  return sendSuccess(res, guide, 'OK');
}

export async function create(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = createGuideSchema.parse(req.body);
  const guide = await Guide.create({
    ...input,
    userId: user._id,
    colleagueId: await resolveOwnColleague(user._id, input.colleagueId),
    todos: (await sanitizeTodoTaskIds(user._id, input.todos)).map(({ _id: _ignored, ...t }) => t),
  });
  await logActivity({ userId: user._id, action: 'GUIDE_CREATED', metadata: { guideId: guide._id.toString(), inputKind: guide.inputKind } });
  await guide.populate('colleagueId', COLLEAGUE_FIELDS);
  return sendSuccess(res, guide, 'Đã lưu vào sổ tay', 201);
}

export async function update(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = updateGuideSchema.parse(req.body);
  const guide = await findOwnedGuide(user._id, guideId(req));
  const { colleagueId, todos, ...rest } = input;
  guide.set(rest);
  if (colleagueId !== undefined) guide.colleagueId = await resolveOwnColleague(user._id, colleagueId);
  if (todos) guide.set('todos', await sanitizeTodoTaskIds(user._id, todos));
  await guide.save();
  await guide.populate([
    { path: 'colleagueId', select: COLLEAGUE_FIELDS },
    { path: 'todos.taskId', select: 'title status deadline' },
  ]);
  return sendSuccess(res, guide, 'Đã cập nhật hướng dẫn');
}

export async function remove(req: Request, res: Response) {
  const user = getAuthUser(req);
  const guide = await findOwnedGuide(user._id, guideId(req));
  await guide.deleteOne();
  return sendSuccess(res, null, 'Đã xoá hướng dẫn (các công việc đã tạo vẫn được giữ)');
}

/** Selected to-dos → tasks. */
export async function createTasks(req: Request, res: Response) {
  const user = getAuthUser(req);
  const input = guideTasksSchema.parse(req.body);
  const { guide, tasks } = await createTasksFromTodos(user._id, guideId(req), input);
  await guide.populate([
    { path: 'colleagueId', select: COLLEAGUE_FIELDS },
    { path: 'todos.taskId', select: 'title status deadline' },
  ]);
  return sendSuccess(res, { guide, count: tasks.length }, `Đã tạo ${tasks.length} công việc`, 201);
}
