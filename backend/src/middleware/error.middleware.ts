import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { sendError } from '../utils/apiResponse';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, `Không tìm thấy route ${req.method} ${req.originalUrl}`);
}

function isDuplicateKeyError(err: unknown): err is { code: number; keyValue?: Record<string, unknown> } {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

// Express recognises error handlers by their 4-argument signature.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    sendError(res, err.statusCode, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = details[0];
    sendError(res, 400, first ? `${first.field ? `${first.field}: ` : ''}${first.message}` : 'Dữ liệu không hợp lệ', details);
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    sendError(res, 400, `Giá trị không hợp lệ cho trường ${err.path}`);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    sendError(res, 400, 'Dữ liệu không hợp lệ', details);
    return;
  }

  if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    sendError(res, 409, `Giá trị ${field} đã tồn tại`);
    return;
  }

  // body-parser errors (malformed JSON, payload too large)
  if (typeof err === 'object' && err !== null && 'type' in err && 'status' in err) {
    const e = err as { type: string; status: number };
    if (e.type === 'entity.parse.failed') {
      sendError(res, 400, 'Body JSON không hợp lệ');
      return;
    }
    if (e.type === 'entity.too.large') {
      sendError(res, 413, 'Dữ liệu gửi lên quá lớn');
      return;
    }
  }

  console.error('💥 Unhandled error:', err);
  const message = !env.isProduction && err instanceof Error ? err.message : 'Lỗi máy chủ, vui lòng thử lại sau';
  sendError(res, 500, message);
}
