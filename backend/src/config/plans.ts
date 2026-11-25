import { env } from './env';

export const PLAN_CODES = ['STARTER', 'PRO', 'PRO_YEAR'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export interface Plan {
  code: PlanCode;
  name: string;
  /** VND */
  price: number;
  days: number;
  /** AI calls available in each paid period (quota is reset on payment). */
  aiQuota: number;
  features: string[];
  highlight?: boolean;
}

export function getPlans(): Plan[] {
  return [
    {
      code: 'STARTER',
      name: 'Cá nhân',
      price: env.PLAN_STARTER_PRICE,
      days: 30,
      aiQuota: 300,
      features: ['300 lượt AI / tháng', 'Gmail, Zalo, Telegram', 'Lịch, báo cáo tuần, nhắc việc'],
    },
    {
      code: 'PRO',
      name: 'Chuyên nghiệp',
      price: env.PLAN_PRO_PRICE,
      days: 30,
      aiQuota: 1_000,
      features: ['1.000 lượt AI / tháng', 'Đọc ảnh, PDF, ghi âm cuộc họp', 'Trợ lý AI, thống kê nâng cao', 'Làm việc nhóm'],
      highlight: true,
    },
    {
      code: 'PRO_YEAR',
      name: 'Chuyên nghiệp (năm)',
      price: env.PLAN_PRO_YEAR_PRICE,
      days: 365,
      aiQuota: 12_000,
      features: ['Toàn bộ gói Chuyên nghiệp', '12.000 lượt AI / năm', 'Tiết kiệm ~2 tháng'],
    },
  ];
}

export function getPlan(code: string): Plan | undefined {
  return getPlans().find((p) => p.code === code);
}
