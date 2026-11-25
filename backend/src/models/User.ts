import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { generateWebhookApiKey } from '../utils/helpers';

export const USER_ROLES = ['ADMIN', 'USER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface GmailIntegration {
  isConnected: boolean;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  connectedAt: Date | null;
  lastSyncedAt: Date | null;
}

export interface TelegramIntegration {
  chatId: string | null;
  username: string | null;
  firstName: string | null;
  linkedAt: Date | null;
  /** sha256 of the one-time code in the t.me/<bot>?start=<code> link. */
  linkCodeHash: string | null;
  linkCodeExpiresAt: Date | null;
}

export interface UserSettings {
  /** Daily email listing overdue / due-today / due-tomorrow tasks. */
  emailDigest: boolean;
  /** Include this user in the scheduled Gmail sync. */
  autoGmailSync: boolean;
}

export interface IUser {
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  trialExpiresAt: Date | null;
  aiQuotaLimit: number;
  aiQuotaUsed: number;
  webhookApiKey: string;
  gmailIntegration: GmailIntegration;
  telegramIntegration: TelegramIntegration;
  settings: UserSettings;
  lastDigestAt: Date | null;
  /** Incremented on logout / password change / suspension to revoke issued JWTs. */
  tokenVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const gmailIntegrationSchema = new Schema<GmailIntegration>(
  {
    isConnected: { type: Boolean, default: false },
    email: { type: String, default: null, trim: true, lowercase: true },
    accessToken: { type: String, default: null, select: false },
    refreshToken: { type: String, default: null, select: false },
    connectedAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'USER', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'ACTIVE', index: true },
    trialExpiresAt: { type: Date, default: null },
    aiQuotaLimit: { type: Number, default: 50, min: 0 },
    aiQuotaUsed: { type: Number, default: 0, min: 0 },
    webhookApiKey: { type: String, unique: true, default: generateWebhookApiKey },
    gmailIntegration: { type: gmailIntegrationSchema, default: () => ({}) },
    telegramIntegration: {
      type: new Schema<TelegramIntegration>(
        {
          chatId: { type: String, default: null },
          username: { type: String, default: null },
          firstName: { type: String, default: null },
          linkedAt: { type: Date, default: null },
          linkCodeHash: { type: String, default: null, select: false },
          linkCodeExpiresAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    settings: {
      type: new Schema<UserSettings>(
        {
          emailDigest: { type: Boolean, default: true },
          autoGmailSync: { type: Boolean, default: true },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    lastDigestAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.passwordHash;
        delete ret.tokenVersion;
        delete ret.webhookApiKey;
        const gmail = ret.gmailIntegration as Record<string, unknown> | undefined;
        if (gmail) {
          delete gmail.accessToken;
          delete gmail.refreshToken;
        }
        const tg = ret.telegramIntegration as Record<string, unknown> | undefined;
        if (tg) {
          delete tg.linkCodeHash;
          delete tg.chatId;
        }
        return ret;
      },
    },
  },
);

// One Telegram chat ↔ one WorkBrief account (unlinked users have chatId null and are not indexed).
userSchema.index(
  { 'telegramIntegration.chatId': 1 },
  { unique: true, partialFilterExpression: { 'telegramIntegration.chatId': { $type: 'string' } } },
);

export const User = model<IUser, Model<IUser>>('User', userSchema);
