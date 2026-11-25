import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.middleware';
import { askAssistant, generateWeeklyReport } from '../services/aiFeatures.service';
import { extractMeetingTasks } from '../services/media.service';
import { sendSuccess } from '../utils/apiResponse';
import { assistantSchema, meetingSchema, weeklyReportSchema } from '../validators/ai.schema';

export async function weeklyReport(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { weekOffset } = weeklyReportSchema.parse(req.body ?? {});
  const result = await generateWeeklyReport(user._id, user.fullName, weekOffset);
  return sendSuccess(res, result, result.isMock ? 'Báo cáo mẫu (chưa cấu hình GEMINI_API_KEY)' : 'AI đã viết báo cáo tuần');
}

export async function assistant(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { question, history } = assistantSchema.parse(req.body);
  const result = await askAssistant(user._id, question, history);
  return sendSuccess(res, result, 'OK');
}

/** Meeting audio / minutes / notes → task drafts for the user to review. */
export async function meeting(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { file, text, note } = meetingSchema.parse(req.body);
  const result = await extractMeetingTasks(user._id, { media: file, text, note });
  return sendSuccess(res, result, `AI tìm thấy ${result.tasks.length} đầu việc`);
}
