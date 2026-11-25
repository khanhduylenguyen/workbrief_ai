import crypto from 'node:crypto';
import { zonedParts } from '../utils/time';

/**
 * VNPay 2.1.0 helpers (pure functions).
 * Signing follows VNPay's official Node.js sample: sort params by key, URL-encode each value
 * with encodeURIComponent (spaces as "+"), join as k=v&k=v, HMAC-SHA512 with the hash secret.
 */

export type VnpParams = Record<string, string>;

export function buildSignData(params: VnpParams): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!).replace(/%20/g, '+')}`)
    .join('&');
}

export function sign(params: VnpParams, secret: string): string {
  return crypto.createHmac('sha512', secret).update(Buffer.from(buildSignData(params), 'utf-8')).digest('hex');
}

/** yyyyMMddHHmmss in GMT+7 (VNPay's required format/timezone). */
export function vnpDate(date: Date): string {
  const p = zonedParts(date, 'Asia/Ho_Chi_Minh');
  const pad = (n: number) => String(n).padStart(2, '0');
  const sec = pad(date.getUTCSeconds());
  return `${p.year}${pad(p.month)}${pad(p.day)}${pad(p.hour)}${pad(p.minute)}${sec}`;
}

/** VNPay's OrderInfo should be plain ASCII without special characters. */
export function asciiOrderInfo(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}

export interface PaymentUrlInput {
  baseUrl: string;
  tmnCode: string;
  secret: string;
  txnRef: string;
  /** VND */
  amount: number;
  orderInfo: string;
  returnUrl: string;
  ipAddr: string;
  createdAt?: Date;
  expiresInMinutes?: number;
  bankCode?: string;
  locale?: 'vn' | 'en';
}

export function buildPaymentUrl(i: PaymentUrlInput): string {
  const created = i.createdAt ?? new Date();
  const params: VnpParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: i.tmnCode,
    vnp_Amount: String(Math.round(i.amount * 100)),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: i.txnRef,
    vnp_OrderInfo: asciiOrderInfo(i.orderInfo),
    vnp_OrderType: 'other',
    vnp_Locale: i.locale ?? 'vn',
    vnp_ReturnUrl: i.returnUrl,
    vnp_IpAddr: i.ipAddr,
    vnp_CreateDate: vnpDate(created),
    vnp_ExpireDate: vnpDate(new Date(created.getTime() + (i.expiresInMinutes ?? 15) * 60_000)),
    ...(i.bankCode && { vnp_BankCode: i.bankCode }),
  };
  return `${i.baseUrl}?${buildSignData(params)}&vnp_SecureHash=${sign(params, i.secret)}`;
}

/** Verify a VNPay callback (return URL or IPN query). Returns the vnp_* params when valid. */
export function verifyCallback(query: Record<string, unknown>, secret: string): { valid: boolean; params: VnpParams } {
  const params: VnpParams = {};
  for (const [k, v] of Object.entries(query)) {
    if (k.startsWith('vnp_') && k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && typeof v === 'string') params[k] = v;
  }
  const given = typeof query.vnp_SecureHash === 'string' ? query.vnp_SecureHash.toLowerCase() : '';
  const expected = sign(params, secret);
  const valid = given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  return { valid, params };
}
