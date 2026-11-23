import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu tối thiểu 8 ký tự')
  .max(128, 'Mật khẩu tối đa 128 ký tự');

export const loginSchema = z.object({
  email: z.email('Email không hợp lệ').trim().toLowerCase(),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Thiếu refresh token'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });
