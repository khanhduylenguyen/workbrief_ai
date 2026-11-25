import { z } from 'zod';
import { PLAN_CODES } from '../config/plans';

export const checkoutSchema = z.object({
  plan: z.enum(PLAN_CODES),
});
