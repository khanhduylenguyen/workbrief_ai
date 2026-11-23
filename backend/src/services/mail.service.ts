import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return !!env.SMTP_HOST.trim();
}

function getTransporter(): Transporter {
  if (!isMailConfigured()) {
    throw new ApiError(503, 'Máy chủ chưa cấu hình gửi email (SMTP_HOST).', { code: 'MAIL_NOT_CONFIGURED' });
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail({ to, subject, text, html }: MailInput): Promise<void> {
  const from = env.MAIL_FROM || env.SMTP_USER;
  if (!from) throw new ApiError(503, 'Thiếu MAIL_FROM hoặc SMTP_USER để gửi email.', { code: 'MAIL_NOT_CONFIGURED' });
  try {
    await getTransporter().sendMail({ from, to, subject, text, html });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('❌ Send mail failed:', err);
    throw new ApiError(502, 'Không gửi được email, kiểm tra cấu hình SMTP.');
  }
}
