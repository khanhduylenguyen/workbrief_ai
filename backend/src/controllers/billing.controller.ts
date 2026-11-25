import type { Request, Response } from 'express';
import { env } from '../config/env';
import { getAuthUser } from '../middleware/auth.middleware';
import { adminListOrders, billingOverview, confirmVnpayPayment, createCheckout, ipnResponse, isBillingEnabled } from '../services/billing.service';
import { sendSuccess } from '../utils/apiResponse';
import { checkoutSchema } from '../validators/billing.schema';

export async function overview(req: Request, res: Response) {
  return sendSuccess(res, await billingOverview(getAuthUser(req)), 'OK');
}

export async function checkout(req: Request, res: Response) {
  const { plan } = checkoutSchema.parse(req.body);
  const { order, paymentUrl } = await createCheckout(getAuthUser(req), plan, req.ip ?? '127.0.0.1');
  return sendSuccess(res, { paymentUrl, txnRef: order.txnRef, amount: order.amount }, 'Chuyển tới cổng thanh toán VNPay', 201);
}

/** The customer's browser comes back here from VNPay; we confirm (idempotently) and redirect to the web app. */
export async function vnpayReturn(req: Request, res: Response) {
  const target = new URL('/billing', env.FRONTEND_URL);
  if (!isBillingEnabled()) {
    target.searchParams.set('payment', 'disabled');
    return res.redirect(target.toString());
  }
  const outcome = await confirmVnpayPayment(req.query as Record<string, unknown>);
  const status =
    outcome.kind === 'paid' || (outcome.kind === 'already_confirmed' && outcome.order.status === 'PAID')
      ? 'success'
      : outcome.kind === 'invalid_signature' || outcome.kind === 'not_found' || outcome.kind === 'invalid_amount'
        ? 'invalid'
        : 'failed';
  target.searchParams.set('payment', status);
  if ('order' in outcome) target.searchParams.set('order', outcome.order.txnRef);
  return res.redirect(target.toString());
}

/** VNPay server → our server (authoritative). Must answer with VNPay's JSON codes, not our envelope. */
export async function vnpayIpn(req: Request, res: Response) {
  if (!isBillingEnabled()) return res.status(200).json({ RspCode: '99', Message: 'Billing disabled' });
  try {
    const outcome = await confirmVnpayPayment(req.query as Record<string, unknown>);
    return res.status(200).json(ipnResponse(outcome));
  } catch (err) {
    console.error('❌ VNPay IPN failed:', err);
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
}

export async function adminOrders(_req: Request, res: Response) {
  return sendSuccess(res, await adminListOrders(), 'OK');
}

