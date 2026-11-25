import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { PLAN_CODES, type PlanCode } from '../config/plans';

export const ORDER_STATUSES = ['PENDING', 'PAID', 'FAILED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface IOrder {
  userId: Types.ObjectId;
  plan: PlanCode;
  /** VND, as charged */
  amount: number;
  days: number;
  aiQuota: number;
  provider: 'VNPAY';
  /** vnp_TxnRef — our unique order reference sent to VNPay. */
  txnRef: string;
  status: OrderStatus;
  providerTxnNo: string | null;
  bankCode: string | null;
  responseCode: string | null;
  paidAt: Date | null;
  /** End of the subscription period this payment produced. */
  periodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = HydratedDocument<IOrder>;

const orderSchema = new Schema<IOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: String, enum: PLAN_CODES, required: true },
    amount: { type: Number, required: true, min: 1 },
    days: { type: Number, required: true },
    aiQuota: { type: Number, required: true },
    provider: { type: String, enum: ['VNPAY'], default: 'VNPAY' },
    txnRef: { type: String, required: true, unique: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING', index: true },
    providerTxnNo: { type: String, default: null },
    bankCode: { type: String, default: null },
    responseCode: { type: String, default: null },
    paidAt: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const Order = model<IOrder>('Order', orderSchema);
