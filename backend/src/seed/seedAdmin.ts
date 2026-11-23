import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { User } from '../models/User';

export const BCRYPT_ROUNDS = 12;

/**
 * Ensure the default admin account exists.
 * Only CREATES the account when no user with ADMIN_EMAIL exists — it never deletes
 * or overwrites existing data (an existing account's password is left untouched).
 */
export async function seedAdmin(): Promise<void> {
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role !== 'ADMIN') {
      console.warn(`⚠️  ADMIN_EMAIL ${email} belongs to a non-admin account; it was NOT modified.`);
    } else {
      console.log(`👤 Admin account already exists: ${email}`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS);
  await User.create({
    fullName: env.ADMIN_FULL_NAME,
    email,
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
    trialExpiresAt: null,
    aiQuotaLimit: 1000,
  });
  console.log(`👤 Default admin account created: ${email}`);
}
