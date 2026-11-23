import type { Types } from 'mongoose';
import { env } from '../config/env';
import { Task, type TaskDocument } from '../models/Task';
import { User, type UserDocument } from '../models/User';
import { formatDateTimeVi, zonedDayRange } from '../utils/time';
import { logActivity } from './activityLog.service';
import { sendMail } from './mail.service';

const PRIORITY_VI: Record<string, string> = { LOW: 'Thấp', MEDIUM: 'Trung bình', HIGH: 'Cao', URGENT: 'Khẩn cấp' };
const MAX_PER_SECTION = 15;

export interface Digest {
  overdue: TaskDocument[];
  dueToday: TaskDocument[];
  dueTomorrow: TaskDocument[];
}

/** Open tasks that are overdue, due today or due tomorrow (in APP_TIMEZONE). */
export async function buildDigest(userId: Types.ObjectId, now = new Date()): Promise<Digest> {
  const today = zonedDayRange(now, env.APP_TIMEZONE);
  const tomorrow = zonedDayRange(now, env.APP_TIMEZONE, 1);
  const base = { userId, status: 'IN_PROGRESS' as const };
  const find = (deadline: Record<string, Date>) =>
    Task.find({ ...base, deadline }).sort({ deadline: 1 }).limit(MAX_PER_SECTION).populate('assignedBy', 'name');

  const [overdue, dueToday, dueTomorrow] = await Promise.all([
    find({ $lt: now }),
    find({ $gte: now, $lt: today.end }),
    find({ $gte: tomorrow.start, $lt: tomorrow.end }),
  ]);
  return { overdue, dueToday, dueTomorrow };
}

export function digestIsEmpty(d: Digest): boolean {
  return d.overdue.length + d.dueToday.length + d.dueTomorrow.length === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function assignerName(t: TaskDocument): string | null {
  const a = t.assignedBy as unknown as { name?: string } | null;
  return a && typeof a === 'object' && a.name ? a.name : null;
}

export function renderDigestEmail(user: Pick<UserDocument, 'fullName'>, d: Digest) {
  const tasksUrl = `${env.FRONTEND_URL.replace(/\/+$/, '')}/tasks`;
  const sections: { title: string; color: string; items: TaskDocument[] }[] = [
    { title: '⚠️ Quá hạn', color: '#e11d48', items: d.overdue },
    { title: '📌 Đến hạn hôm nay', color: '#d97706', items: d.dueToday },
    { title: '🗓️ Đến hạn ngày mai', color: '#4f46e5', items: d.dueTomorrow },
  ].filter((s) => s.items.length > 0);

  const line = (t: TaskDocument) => {
    const who = assignerName(t);
    return `${t.title} — hạn ${formatDateTimeVi(t.deadline!, env.APP_TIMEZONE)} · ${PRIORITY_VI[t.priority]}${who ? ` · giao bởi ${who}` : ''}`;
  };

  const counts = `${d.overdue.length} quá hạn, ${d.dueToday.length} đến hạn hôm nay, ${d.dueTomorrow.length} đến hạn ngày mai`;
  const subject = d.overdue.length
    ? `[WorkBrief AI] ${d.overdue.length} việc quá hạn, ${d.dueToday.length} việc đến hạn hôm nay`
    : `[WorkBrief AI] ${d.dueToday.length} việc đến hạn hôm nay, ${d.dueTomorrow.length} việc ngày mai`;

  const text = [
    `Chào ${user.fullName},`,
    '',
    `Bạn có ${counts}.`,
    '',
    ...sections.flatMap((s) => [s.title, ...s.items.map((t) => `  - ${line(t)}`), '']),
    `Xem và cập nhật tại: ${tasksUrl}`,
    '',
    'Bạn có thể tắt email nhắc việc trong trang Hồ sơ.',
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border-radius:12px 12px 0 0;padding:18px 22px;font-weight:600;font-size:16px">WorkBrief AI · Nhắc việc</div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:22px">
    <p style="margin:0 0 6px">Chào <b>${escapeHtml(user.fullName)}</b>,</p>
    <p style="margin:0 0 18px;color:#475569">Bạn có ${escapeHtml(counts)}.</p>
    ${sections
      .map(
        (s) => `<h3 style="margin:18px 0 8px;font-size:14px;color:${s.color}">${s.title} (${s.items.length})</h3>
    <ul style="margin:0;padding-left:18px">${s.items
      .map((t) => {
        const who = assignerName(t);
        return `<li style="margin-bottom:8px"><b>${escapeHtml(t.title)}</b><br><span style="font-size:12px;color:#64748b">Hạn ${formatDateTimeVi(t.deadline!, env.APP_TIMEZONE)} · ${PRIORITY_VI[t.priority]}${who ? ` · giao bởi ${escapeHtml(who)}` : ''}</span></li>`;
      })
      .join('')}</ul>`,
      )
      .join('')}
    <p style="margin:22px 0 0"><a href="${tasksUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Mở danh sách công việc</a></p>
    <p style="margin:18px 0 0;font-size:11px;color:#94a3b8">Bạn có thể tắt email nhắc việc trong trang Hồ sơ của WorkBrief AI.</p>
  </div>
</div></body></html>`;

  return { subject, text, html };
}

/**
 * Send the digest to one user. Returns false when there is nothing to remind about
 * (unless `force`, used by the "send test email" button).
 */
export async function sendDigest(user: UserDocument, { force = false } = {}): Promise<{ sent: boolean; digest: Digest }> {
  const digest = await buildDigest(user._id);
  if (digestIsEmpty(digest) && !force) return { sent: false, digest };

  const { subject, text, html } = digestIsEmpty(digest)
    ? {
        subject: '[WorkBrief AI] Email thử: không có việc nào sắp đến hạn',
        text: `Chào ${user.fullName},\n\nĐây là email thử. Hiện bạn không có việc nào quá hạn hoặc đến hạn trong hôm nay / ngày mai.\n\nEmail nhắc việc sẽ được gửi mỗi sáng khi có việc cần chú ý.`,
        html: `<p>Chào <b>${escapeHtml(user.fullName)}</b>,</p><p>Đây là email thử. Hiện bạn không có việc nào quá hạn hoặc đến hạn trong hôm nay / ngày mai.</p><p>Email nhắc việc sẽ được gửi mỗi sáng khi có việc cần chú ý.</p>`,
      }
    : renderDigestEmail(user, digest);

  await sendMail({ to: user.email, subject, text, html });
  await User.updateOne({ _id: user._id }, { $set: { lastDigestAt: new Date() } });
  await logActivity({
    userId: user._id,
    action: 'DIGEST_SENT',
    metadata: { overdue: digest.overdue.length, dueToday: digest.dueToday.length, dueTomorrow: digest.dueTomorrow.length, test: force },
  });
  return { sent: true, digest };
}
