import type { Response } from 'express';

export interface ApiResponseBody<T> {
  success: boolean;
  data: T;
  message: string;
}

export function sendSuccess<T>(res: Response, data: T, message = 'OK', statusCode = 200) {
  const body: ApiResponseBody<T> = { success: true, data, message };
  return res.status(statusCode).json(body);
}

export function sendError(res: Response, statusCode: number, message: string, data: unknown = null) {
  const body: ApiResponseBody<unknown> = { success: false, data, message };
  return res.status(statusCode).json(body);
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function buildPagination(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
