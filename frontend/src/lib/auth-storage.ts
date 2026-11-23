import type { Tokens } from "./types";

const ACCESS_KEY = "wb_access_token";
const REFRESH_KEY = "wb_refresh_token";
const LOGOUT_REASON_KEY = "wb_logout_reason";

export interface LogoutReason {
  message: string;
  code: "ACCOUNT_SUSPENDED" | "TRIAL_EXPIRED" | "SESSION_EXPIRED";
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return typeof window === "undefined" ? fallback : fn();
  } catch {
    return fallback;
  }
}

/** Re-render subscribers when tokens change in another tab. */
export function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export const authStorage = {
  getAccessToken: () => safe(() => localStorage.getItem(ACCESS_KEY), null),
  getRefreshToken: () => safe(() => localStorage.getItem(REFRESH_KEY), null),
  setTokens: (tokens: Pick<Tokens, "accessToken" | "refreshToken">) =>
    safe(() => {
      localStorage.setItem(ACCESS_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    }, undefined),
  clear: () =>
    safe(() => {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    }, undefined),
  /** Message shown on /login after a forced logout (suspended / trial expired / session expired). */
  setLogoutReason: (reason: LogoutReason) =>
    safe(() => sessionStorage.setItem(LOGOUT_REASON_KEY, JSON.stringify(reason)), undefined),
  /** Raw JSON string (stable for useSyncExternalStore snapshots). */
  peekLogoutReasonRaw: (): string | null => safe(() => sessionStorage.getItem(LOGOUT_REASON_KEY), null),
  clearLogoutReason: () => safe(() => sessionStorage.removeItem(LOGOUT_REASON_KEY), undefined),
  parseLogoutReason: (raw: string | null): LogoutReason | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LogoutReason;
    } catch {
      return null;
    }
  },
};
