import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { assertAccountUsable, getAuthUser } from '../middleware/auth.middleware';
import { User, type UserDocument } from '../models/User';
import { BCRYPT_ROUNDS } from '../seed/seedAdmin';
import { logActivity } from '../services/activityLog.service';
import { ApiError } from '../utils/ApiError';
import { sendSuccess } from '../utils/apiResponse';
import { issueTokenPair, verifyRefreshToken } from '../utils/jwt';
import { isMailConfigured } from '../services/mail.service';
import { sendDigest } from '../services/reminder.service';
import { changePasswordSchema, loginSchema, refreshSchema, updateProfileSchema } from '../validators/auth.schema';

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('workbrief-dummy-password', 10);

function tokenSubject(user: UserDocument) {
  return { id: user.id as string, role: user.role, tokenVersion: user.tokenVersion };
}

export function serializeAccount(user: UserDocument) {
  const trialDaysLeft = user.trialExpiresAt
    ? Math.max(0, Math.ceil((user.trialExpiresAt.getTime() - Date.now()) / 86_400_000))
    : null;
  return {
    ...user.toJSON(),
    aiQuotaRemaining: Math.max(0, user.aiQuotaLimit - user.aiQuotaUsed),
    trialDaysLeft,
    capabilities: { mail: isMailConfigured() },
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw ApiError.unauthorized('Email hoặc mật khẩu không đúng');

  assertAccountUsable(user);

  user.lastLoginAt = new Date();
  await user.save();
  await logActivity({ userId: user._id, action: 'LOGIN', metadata: { ip: req.ip ?? null } });

  return sendSuccess(
    res,
    { user: serializeAccount(user), tokens: issueTokenPair(tokenSubject(user)) },
    'Đăng nhập thành công',
  );
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Refresh token không hợp lệ hoặc đã hết hạn');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại');
  assertAccountUsable(user); // before tokenVersion so the client learns *why* it was signed out
  if (user.tokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized('Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại');
  }

  return sendSuccess(
    res,
    { user: serializeAccount(user), tokens: issueTokenPair(tokenSubject(user)) },
    'Làm mới token thành công',
  );
}

export async function logout(req: Request, res: Response) {
  const user = getAuthUser(req);
  await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
  return sendSuccess(res, null, 'Đăng xuất thành công');
}

export async function me(req: Request, res: Response) {
  return sendSuccess(res, serializeAccount(getAuthUser(req)), 'OK');
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const authUser = getAuthUser(req);

  const user = await User.findById(authUser._id).select('+passwordHash');
  if (!user) throw ApiError.unauthorized();

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw ApiError.badRequest('Mật khẩu hiện tại không đúng');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.tokenVersion += 1;
  await user.save();
  await logActivity({ userId: user._id, action: 'PASSWORD_CHANGED' });

  return sendSuccess(res, { tokens: issueTokenPair(tokenSubject(user)) }, 'Đổi mật khẩu thành công');
}

export async function updateMe(req: Request, res: Response) {
  const input = updateProfileSchema.parse(req.body);
  const user = getAuthUser(req);

  if (input.fullName !== undefined) user.fullName = input.fullName;
  if (input.settings?.emailDigest !== undefined) user.settings.emailDigest = input.settings.emailDigest;
  if (input.settings?.autoGmailSync !== undefined) user.settings.autoGmailSync = input.settings.autoGmailSync;
  await user.save();
  await logActivity({ userId: user._id, action: 'PROFILE_UPDATED', metadata: { fields: Object.keys(input) } });

  return sendSuccess(res, serializeAccount(user), 'Đã cập nhật hồ sơ');
}

/** Sends the reminder digest right now (even if empty) so the user can check their email setup. */
export async function sendTestReminder(req: Request, res: Response) {
  const user = getAuthUser(req);
  const { digest } = await sendDigest(user, { force: true });
  const total = digest.overdue.length + digest.dueToday.length + digest.dueTomorrow.length;
  return sendSuccess(res, { to: user.email, tasks: total }, `Đã gửi email nhắc việc tới ${user.email}`);
}
