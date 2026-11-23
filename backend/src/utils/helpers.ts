import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { ApiError } from './ApiError';

/** Escape user input before using it inside a RegExp (prevents ReDoS / regex injection). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function generateWebhookApiKey(): string {
  return `wb_${crypto.randomBytes(24).toString('hex')}`;
}

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Validate a route param as a Mongo ObjectId and return it typed. */
export function toObjectId(value: string | undefined, label = 'ID'): Types.ObjectId {
  if (!value || !Types.ObjectId.isValid(value)) {
    throw ApiError.badRequest(`${label} không hợp lệ`);
  }
  return new Types.ObjectId(value);
}
