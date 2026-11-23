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
        return ret;
      },
    },
  },
);

export const User = model<IUser, Model<IUser>>('User', userSchema);
