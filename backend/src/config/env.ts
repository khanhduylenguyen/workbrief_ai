import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const booleanString = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8081),
  CORS_ORIGINS: z.string().default('http://localhost:8080'),
  PUBLIC_API_URL: z.string().default('http://localhost:8081'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  ADMIN_EMAIL: z.email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  ADMIN_FULL_NAME: z.string().min(1).default('WorkBrief Admin'),

  // Where the browser is sent back to after the Google OAuth callback.
  FRONTEND_URL: z.string().default('http://localhost:8080'),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:8081/api/integrations/gmail/callback'),
  GMAIL_SYNC_LABEL: z.string().default('WorkBrief'),
  GMAIL_SYNC_MAX_MESSAGES: z.coerce.number().int().min(1).max(50).default(10),
  GMAIL_SYNC_NEWER_THAN_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  // Telegram bot (create with @BotFather). Leave TELEGRAM_BOT_TOKEN empty to disable.
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_BOT_USERNAME: z.string().optional().default(''),
  // Random string; Telegram echoes it in X-Telegram-Bot-Api-Secret-Token so we can verify webhook calls.
  TELEGRAM_WEBHOOK_SECRET: z.string().optional().default(''),
  TELEGRAM_API_BASE: z.string().default('https://api.telegram.org'),

  // Timezone used for "today", reminder emails and resolving relative deadlines ("chiều nay", "thứ 6").
  APP_TIMEZONE: z.string().default('Asia/Ho_Chi_Minh'),

  // Shared secret for /api/cron/* (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`).
  CRON_SECRET: z.string().optional().default(''),
  // Skip a user in scheduled Gmail sync if they synced less than this many minutes ago.
  GMAIL_AUTO_SYNC_MIN_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(25),

  // Outgoing email (reminder digests). Leave SMTP_HOST empty to disable.
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),

  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash'),
  // Comma-separated models tried in order when the primary one is overloaded / retired.
  GEMINI_FALLBACK_MODELS: z.string().default('gemini-3.8-flash,gemini-3.5-flash-lite'),
  AI_MOCK_FALLBACK: booleanString.default(true),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
  console.error('❌ JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
};
