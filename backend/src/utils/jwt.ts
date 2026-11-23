import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../models/User';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  tokenVersion: number;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
  type: 'refresh';
}

interface TokenSubject {
  id: string;
  role: UserRole;
  tokenVersion: number;
}

export function signAccessToken(user: TokenSubject): string {
  const payload: AccessTokenPayload = {
    sub: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
    type: 'access',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function signRefreshToken(user: TokenSubject): string {
  const payload: RefreshTokenPayload = {
    sub: user.id,
    tokenVersion: user.tokenVersion,
    type: 'refresh',
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function issueTokenPair(user: TokenSubject) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    tokenType: 'Bearer' as const,
    accessTokenExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (!isObject(decoded) || decoded.type !== 'access' || typeof decoded.sub !== 'string') {
    throw new jwt.JsonWebTokenError('Invalid access token');
  }
  return decoded as unknown as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (!isObject(decoded) || decoded.type !== 'refresh' || typeof decoded.sub !== 'string') {
    throw new jwt.JsonWebTokenError('Invalid refresh token');
  }
  return decoded as unknown as RefreshTokenPayload;
}
