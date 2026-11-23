import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { authStorage, type LogoutReason } from "./auth-storage";
import type { ApiResponse, Tokens, User } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8081/api";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60_000,
});

/** Error codes the backend puts in `data.code` for blocked accounts / expired tokens. */
export type ApiErrorCode = "ACCOUNT_SUSPENDED" | "TRIAL_EXPIRED" | "TOKEN_EXPIRED";

export class ApiRequestError extends Error {
  status: number;
  code: ApiErrorCode | null;
  details: unknown;
  constructor(message: string, status: number, code: ApiErrorCode | null, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type ErrorBody = Partial<ApiResponse<unknown>>;

function extractCode(data: unknown): ApiErrorCode | null {
  if (data && typeof data === "object" && "code" in data) {
    const code = (data as { code: unknown }).code;
    if (code === "ACCOUNT_SUSPENDED" || code === "TRIAL_EXPIRED" || code === "TOKEN_EXPIRED") return code;
  }
  return null;
}

export function toApiError(err: unknown): ApiRequestError {
  if (err instanceof ApiRequestError) return err;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ErrorBody | undefined;
    if (!err.response) {
      return new ApiRequestError(
        "Không kết nối được máy chủ. Kiểm tra Backend đã chạy tại " + API_URL,
        0,
        null,
        null,
      );
    }
    return new ApiRequestError(
      body?.message ?? err.message,
      err.response.status,
      extractCode(body?.data),
      body?.data ?? null,
    );
  }
  return new ApiRequestError(err instanceof Error ? err.message : "Đã có lỗi xảy ra", 0, null, null);
}

/* ------------------------------------------------------------ interceptors -- */

api.interceptors.request.use((config) => {
  const token = authStorage.getAccessToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<ApiResponse<{ user: User; tokens: Tokens }>>(`${API_URL}/auth/refresh`, {
      refreshToken,
    });
    authStorage.setTokens(data.data.tokens);
    return data.data.tokens.accessToken;
  } catch (err) {
    const apiErr = toApiError(err);
    if (apiErr.code === "ACCOUNT_SUSPENDED" || apiErr.code === "TRIAL_EXPIRED") {
      forceLogout({ message: apiErr.message, code: apiErr.code });
    }
    return null;
  }
}

function forceLogout(reason: LogoutReason) {
  authStorage.clear();
  authStorage.setLogoutReason(reason);
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    // Outside React (axios interceptor): a full reload also drops all cached data of the blocked account.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

const AUTH_FREE_PATHS = ["/auth/login", "/auth/refresh", "/integrations/zalo/webhook"];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const status = error.response?.status;
    const url = original?.url ?? "";
    const isAuthFree = AUTH_FREE_PATHS.some((p) => url.includes(p));
    const apiErr = toApiError(error);

    // Account became suspended / trial expired mid-session → kick out with a clear reason.
    if (!isAuthFree && status === 403 && (apiErr.code === "ACCOUNT_SUSPENDED" || apiErr.code === "TRIAL_EXPIRED")) {
      forceLogout({ message: apiErr.message, code: apiErr.code });
      return Promise.reject(apiErr);
    }

    // Access token expired/invalid → try a single refresh, then replay the request.
    if (!isAuthFree && status === 401 && original && !original._retry) {
      original._retry = true;
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      if (authStorage.getAccessToken()) {
        forceLogout({ message: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.", code: "SESSION_EXPIRED" });
      }
    }

    return Promise.reject(apiErr);
  },
);

/* ----------------------------------------------------------------- helpers -- */

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url, config);
  return data.data;
}

export async function apiSend<T>(
  method: "post" | "patch" | "put" | "delete",
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<{ data: T; message: string }> {
  const { data } = await api.request<ApiResponse<T>>({ method, url, data: body, ...config });
  return { data: data.data, message: data.message };
}
