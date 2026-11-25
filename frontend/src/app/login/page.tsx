"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Eye, EyeOff, Lock, LogIn, Mail, Sparkles, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { apiSend, toApiError, type ApiErrorCode } from "@/lib/api";
import { authStorage, subscribeToStorage } from "@/lib/auth-storage";
import { qk } from "@/lib/queries";
import type { Tokens, User } from "@/lib/types";

interface LoginError {
  message: string;
  code: ApiErrorCode | null;
}

const FEATURES = [
  "Dán email / tin nhắn sếp giao — AI tóm tắt thành đầu việc và checklist",
  "Nhận việc tự động từ Zalo qua Webhook",
  "Dashboard theo dõi tiến độ, hạn chót, tỷ lệ hoàn thành",
];

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<LoginError | null>(null);

  // Reason left by a forced logout (account suspended / trial expired / session expired).
  const storedReasonRaw = useSyncExternalStore(subscribeToStorage, authStorage.peekLogoutReasonRaw, () => null);
  const storedReason = authStorage.parseLogoutReason(storedReasonRaw);
  const error: LoginError | null =
    submitError ??
    (storedReason
      ? { message: storedReason.message, code: storedReason.code === "SESSION_EXPIRED" ? null : storedReason.code }
      : null);

  useEffect(() => {
    if (authStorage.getAccessToken()) router.replace("/");
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    authStorage.clearLogoutReason();
    setSubmitError(null);
    setLoading(true);
    try {
      const { data } = await apiSend<{ user: User; tokens: Tokens }>("post", "/auth/login", {
        email: email.trim(),
        password,
      });
      authStorage.setTokens(data.tokens);
      qc.setQueryData(qk.me, data.user);
      // Expired account (online payment enabled) → straight to the billing page to renew.
      router.replace(data.user.access && !data.user.access.active ? "/billing" : "/");
    } catch (err) {
      const apiErr = toApiError(err);
      setSubmitError({ message: apiErr.message, code: apiErr.code });
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
            <Sparkles className="h-5 w-5" />
          </span>
          WorkBrief AI
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            Mọi việc được giao, gọn gàng trong một nơi.
          </h1>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-3 text-indigo-100">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-indigo-200">© WorkBrief AI</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 text-lg font-semibold text-slate-900 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            WorkBrief AI
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Đăng nhập</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Tài khoản do quản trị viên cấp. Chưa có tài khoản? Liên hệ Admin để được dùng thử.
          </p>

          {error && <LoginAlert error={error} />}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email" htmlFor="email">
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@congty.vn"
                  className="pl-9"
                />
              </div>
            </Field>
            <Field label="Mật khẩu" htmlFor="password">
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="px-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {!loading && <LogIn className="h-4 w-4" />}
              Đăng nhập
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginAlert({ error }: { error: LoginError }) {
  if (error.code === "ACCOUNT_SUSPENDED") {
    return (
      <div className="mt-6 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4" role="alert">
        <Lock className="h-5 w-5 shrink-0 text-rose-600" />
        <div>
          <p className="font-semibold text-rose-800">Tài khoản đã bị khóa</p>
          <p className="mt-0.5 text-sm text-rose-700">{error.message}</p>
        </div>
      </div>
    );
  }
  if (error.code === "TRIAL_EXPIRED") {
    return (
      <div className="mt-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
        <Clock className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-800">Hết hạn dùng thử</p>
          <p className="mt-0.5 text-sm text-amber-700">{error.message}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-6 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700" role="alert">
      <XCircle className="h-5 w-5 shrink-0" />
      <span>{error.message}</span>
    </div>
  );
}
