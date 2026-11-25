import crypto from 'node:crypto';
import { env } from '../config/env';
import { getPlan, getPlans, type PlanCode } from '../config/plans';
import { Order, type OrderDocument } from '../models/Order';
import { User, type UserDocument } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { addDays } from '../utils/helpers';
import { formatDateTimeVi } from '../utils/time';
import { logActivity } from './activityLog.service';
import { escapeTelegramHtml, notifyUserOnTelegram } from './telegram.service';
import { accessInfo, isBillingEnabled } from './access';
import { buildPaymentUrl, verifyCallback, type VnpParams } from './vnpay';

export { accessInfo, isBillingEnabled };

const apiBase = () => env.PUBLIC_API_URL.replace(/\/+$/, '');
export const vnpayReturnUrl = () => `${apiBase()}/api/billing/vnpay/return`;
export const vnpayIpnUrl = () => `${apiBase()}/api/billing/vnpay/ipn`;

/* ------------------------------------------------------------- Checkout -- */

function newTxnRef(): string {
  // ≤ 34 chars, alphanumeric; date prefix keeps it readable in VNPay's merchant portal.
  const d = new Date();
  return `WB${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export async function createCheckout(user: UserDocument, planCode: PlanCode, ipAddr: string) {
  if (!isBillingEnabled()) {
    throw new ApiError(503, 'Thanh toán trực tuyến chưa được bật. Vui lòng liên hệ quản trị viên.', { code: 'BILLING_DISABLED' });
  }
  if (user.role === 'ADMIN') throw ApiError.badRequest('Tài khoản quản trị không cần mua gói.');
  const plan = getPlan(planCode);
  if (!plan) throw ApiError.badRequest('Gói không hợp lệ');

  const order = await Order.create({
    userId: user._id,
    plan: plan.code,
    amount: plan.price,
    days: plan.days,
    aiQuota: plan.aiQuota,
    txnRef: newTxnRef(),
  });

  const paymentUrl = buildPaymentUrl({
    baseUrl: env.VNPAY_PAYMENT_URL,
    tmnCode: env.VNPAY_TMN_CODE,
    secret: env.VNPAY_HASH_SECRET,
    txnRef: order.txnRef,
    amount: order.amount,
    orderInfo: `WorkBrief AI goi ${plan.name} ${plan.days} ngay ${order.txnRef}`,
    returnUrl: vnpayReturnUrl(),
    ipAddr: ipAddr.replace(/^::ffff:/, '') || '127.0.0.1',
  });
  return { order, paymentUrl };
}

/* ---------------------------------------------------------- Confirmation -- */

export type ConfirmOutcome =
  | { kind: 'invalid_signature' }
  | { kind: 'not_found' }
  | { kind: 'invalid_amount'; order: OrderDocument }
  | { kind: 'already_confirmed'; order: OrderDocument }
  | { kind: 'paid'; order: OrderDocument }
  | { kind: 'failed'; order: OrderDocument };

/**
 * Verify a VNPay callback and apply it. Idempotent: only the first successful confirmation of an
 * order extends the subscription (atomic PENDING → PAID transition).
 */
export async function confirmVnpayPayment(query: Record<string, unknown>): Promise<ConfirmOutcome> {
  const { valid, params } = verifyCallback(query, env.VNPAY_HASH_SECRET);
  if (!valid) return { kind: 'invalid_signature' };

  const order = await Order.findOne({ txnRef: params.vnp_TxnRef });
  if (!order) return { kind: 'not_found' };
  if (Number(params.vnp_Amount) !== Math.round(order.amount * 100)) return { kind: 'invalid_amount', order };
  if (order.status !== 'PENDING') return { kind: 'already_confirmed', order };

  const success = params.vnp_ResponseCode === '00' && (params.vnp_TransactionStatus ?? '00') === '00';
  const meta = providerMeta(params);

  if (!success) {
    const failed = await Order.findOneAndUpdate(
      { _id: order._id, status: 'PENDING' },
      { $set: { status: 'FAILED', ...meta } },
      { returnDocument: 'after' },
    );
    return failed ? { kind: 'failed', order: failed } : { kind: 'already_confirmed', order };
  }

  // Claim the order first so concurrent IPN + return-URL calls can't both apply it.
  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, status: 'PENDING' },
    { $set: { status: 'PAID', paidAt: new Date(), ...meta } },
    { returnDocument: 'after' },
  );
  if (!claimed) return { kind: 'already_confirmed', order };

  const user = await User.findById(claimed.userId);
  if (user) {
    const now = new Date();
    const base = user.subscription?.currentPeriodEnd && user.subscription.currentPeriodEnd > now ? user.subscription.currentPeriodEnd : now;
    const periodEnd = addDays(base, claimed.days);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'subscription.plan': claimed.plan,
          'subscription.currentPeriodEnd': periodEnd,
          aiQuotaLimit: claimed.aiQuota,
          aiQuotaUsed: 0,
        },
      },
    );
    claimed.periodEnd = periodEnd;
    await claimed.save();
    await logActivity({
      userId: user._id,
      action: 'SUBSCRIPTION_ACTIVATED',
      metadata: { plan: claimed.plan, amount: claimed.amount, txnRef: claimed.txnRef, periodEnd },
    });
    const planName = getPlan(claimed.plan)?.name ?? claimed.plan;
    void notifyUserOnTelegram(
      user._id,
      `✅ Thanh toán thành công gói <b>${escapeTelegramHtml(planName)}</b>. Sử dụng đến ${formatDateTimeVi(periodEnd, env.APP_TIMEZONE)}.`,
    ).catch(() => undefined);
  }
  return { kind: 'paid', order: claimed };
}

function providerMeta(p: VnpParams) {
  return {
    providerTxnNo: p.vnp_TransactionNo ?? null,
    bankCode: p.vnp_BankCode ?? null,
    responseCode: p.vnp_ResponseCode ?? null,
  };
}

/** VNPay IPN response codes (their spec). */
export function ipnResponse(outcome: ConfirmOutcome): { RspCode: string; Message: string } {
  switch (outcome.kind) {
    case 'invalid_signature':
      return { RspCode: '97', Message: 'Invalid signature' };
    case 'not_found':
      return { RspCode: '01', Message: 'Order not found' };
    case 'invalid_amount':
      return { RspCode: '04', Message: 'Invalid amount' };
    case 'already_confirmed':
      return { RspCode: '02', Message: 'Order already confirmed' };
    default:
      return { RspCode: '00', Message: 'Confirm Success' };
  }
}

/* ---------------------------------------------------------------- Views -- */

export async function billingOverview(user: UserDocument) {
  const orders = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);
  return {
    enabled: isBillingEnabled(),
    access: accessInfo(user),
    subscription: user.subscription,
    plans: getPlans(),
    orders,
  };
}

export async function adminListOrders(limit = 100) {
  return Order.find().sort({ createdAt: -1 }).limit(limit).populate('userId', 'fullName email');
}

