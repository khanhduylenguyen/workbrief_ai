"use client";

import { CalendarPlus, KeyRound, Lock, LockOpen, RotateCcw, Search, ShieldAlert, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, PageLoader, ProgressBar, Select } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAdminUsers, useCreateTrialUser, useExtendTrial, useMe, useResetQuota, useSetUserStatus } from "@/lib/queries";
import type { AdminUser } from "@/lib/types";
import { cn, formatDate, formatDateTime, initials } from "@/lib/utils";

const EMPTY_FORM = { fullName: "", email: "", password: "", trialDays: 14, aiQuotaLimit: 50 };

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

export default function AdminPage() {
  const me = useMe();
  if (me.data && me.data.role !== "ADMIN") {
    return (
      <Card>
        <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Bạn không có quyền truy cập" description="Trang Quản trị chỉ dành cho tài khoản ADMIN." />
      </Card>
    );
  }
  if (!me.data) return <PageLoader />;
  return <AdminContent currentUserId={me.data._id} />;
}

function AdminContent({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "SUSPENDED">("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const users = useAdminUsers({ limit: 100, ...(debounced && { search: debounced }), ...(status && { status }) });
  const createUser = useCreateTrialUser();
  const extend = useExtendTrial();
  const resetQuota = useResetQuota();
  const setUserStatus = useSetUserStatus();

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const { message } = await createUser.mutateAsync({
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        trialDays: Number(form.trialDays),
        aiQuotaLimit: Number(form.aiQuotaLimit),
      });
      toast.success(message);
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function run(key: string, fn: () => Promise<{ message: string }>) {
    setBusy(key);
    try {
      const { message } = await fn();
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const items = users.data?.items ?? [];
  const totals = {
    all: items.length,
    active: items.filter((u) => u.status === "ACTIVE" && !u.trialExpired).length,
    expired: items.filter((u) => u.trialExpired).length,
    suspended: items.filter((u) => u.status === "SUSPENDED").length,
  };

  return (
    <>
      <PageHeader title="Quản trị (Admin)" description="Cấp tài khoản dùng thử, gia hạn, reset AI quota và khóa / mở tài khoản." />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        {/* Create trial account */}
        <Card className="h-fit p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <UserPlus className="h-4 w-4 text-indigo-600" /> Cấp tài khoản dùng thử
          </h2>
          <form onSubmit={onCreate} className="space-y-3.5">
            <Field label="Họ tên" htmlFor="a-name" required>
              <Input id="a-name" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required maxLength={120} placeholder="Nguyễn Văn A" />
            </Field>
            <Field label="Email" htmlFor="a-email" required>
              <Input id="a-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required placeholder="a@congty.vn" />
            </Field>
            <Field label="Mật khẩu" htmlFor="a-password" required hint="Tối thiểu 8 ký tự. Gửi mật khẩu này cho người dùng.">
              <div className="flex gap-2">
                <Input
                  id="a-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                  maxLength={128}
                  className="font-mono"
                />
                <Button variant="outline" size="sm" className="h-10" onClick={() => setForm((f) => ({ ...f, password: randomPassword() }))} title="Tạo mật khẩu ngẫu nhiên">
                  <KeyRound className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Số ngày dùng thử" htmlFor="a-days">
                <Input id="a-days" type="number" min={1} max={365} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: Number(e.target.value) }))} required />
              </Field>
              <Field label="Quota AI" htmlFor="a-quota">
                <Input id="a-quota" type="number" min={0} max={100000} value={form.aiQuotaLimit} onChange={(e) => setForm((f) => ({ ...f, aiQuotaLimit: Number(e.target.value) }))} required />
              </Field>
            </div>
            <Button type="submit" className="w-full" loading={createUser.isPending}>
              Tạo tài khoản
            </Button>
          </form>
        </Card>

        {/* Users table */}
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Tổng tài khoản" value={totals.all} />
            <MiniStat label="Đang hoạt động" value={totals.active} tone="text-emerald-600" />
            <MiniStat label="Hết hạn dùng thử" value={totals.expired} tone="text-amber-600" />
            <MiniStat label="Bị khóa" value={totals.suspended} tone="text-rose-600" />
          </div>

          <Card>
            <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc email…" className="pl-9" aria-label="Tìm tài khoản" />
              </div>
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-44" aria-label="Lọc trạng thái">
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="SUSPENDED">Bị khóa</option>
              </Select>
            </div>

            {users.isLoading ? (
              <PageLoader />
            ) : users.isError ? (
              <div className="p-4">
                <ErrorBox message={users.error.message} onRetry={() => users.refetch()} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState icon={<Users className="h-6 w-6" />} title="Không có tài khoản nào" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                      <th className="px-4 py-3">Tài khoản</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3">Dùng thử</th>
                      <th className="px-4 py-3">AI Quota</th>
                      <th className="px-4 py-3 text-center">Số task</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((u) => (
                      <UserRow
                        key={u._id}
                        user={u}
                        isSelf={u._id === currentUserId}
                        busy={busy}
                        onExtend={() => run(`extend-${u._id}`, () => extend.mutateAsync({ id: u._id, days: 7 }))}
                        onReset={() => run(`reset-${u._id}`, () => resetQuota.mutateAsync({ id: u._id }))}
                        onToggle={() => {
                          const next = u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
                          if (next === "SUSPENDED" && !window.confirm(`Khóa tài khoản ${u.email}? Người dùng sẽ bị đăng xuất ngay.`)) return;
                          run(`status-${u._id}`, () => setUserStatus.mutateAsync({ id: u._id, status: next }));
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function UserRow({
  user: u,
  isSelf,
  busy,
  onExtend,
  onReset,
  onToggle,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: string | null;
  onExtend: () => void;
  onReset: () => void;
  onToggle: () => void;
}) {
  const quotaPct = u.aiQuotaLimit > 0 ? (u.aiQuotaUsed / u.aiQuotaLimit) * 100 : 100;
  const isAdmin = u.role === "ADMIN";

  return (
    <tr className={cn("align-middle", u.status === "SUSPENDED" && "bg-rose-50/30")}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {initials(u.fullName)}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium text-slate-900">
              <span className="truncate">{u.fullName}</span>
              {isAdmin && (
                <Badge className="bg-violet-50 text-violet-700">
                  <ShieldCheck className="h-3 w-3" /> Admin
                </Badge>
              )}
              {isSelf && <span className="text-xs text-slate-400">(bạn)</span>}
            </p>
            <p className="truncate text-xs text-slate-500">{u.email}</p>
            <p className="text-[11px] text-slate-400">Đăng nhập: {formatDateTime(u.lastLoginAt)}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {u.status === "SUSPENDED" ? (
          <Badge className="bg-rose-50 text-rose-700">Bị khóa</Badge>
        ) : u.trialExpired ? (
          <Badge className="bg-amber-50 text-amber-700">Hết hạn</Badge>
        ) : (
          <Badge className="bg-emerald-50 text-emerald-700">Hoạt động</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-xs">
        {u.trialExpiresAt ? (
          <>
            <p className="font-medium text-slate-700">{formatDate(u.trialExpiresAt)}</p>
            <p className={cn(u.trialExpired ? "text-amber-600" : "text-slate-500")}>
              {u.trialExpired ? "Đã hết hạn" : `Còn ${u.trialDaysLeft} ngày`}
            </p>
          </>
        ) : (
          <span className="text-slate-400">Không giới hạn</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="w-32">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-slate-700">
              {u.aiQuotaUsed}/{u.aiQuotaLimit}
            </span>
            <span className="text-slate-400">{Math.round(quotaPct)}%</span>
          </div>
          <ProgressBar value={quotaPct} className="h-1.5" barClassName={quotaPct >= 90 ? "bg-rose-500" : quotaPct >= 70 ? "bg-amber-500" : "bg-indigo-600"} />
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="font-medium text-slate-900">{u.taskCount}</span>
        {u.taskCount > 0 && (
          <p className="text-[11px] text-slate-400">
            {u.taskStats.completed} xong · {u.taskStats.inProgress} đang làm
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {!isAdmin && (
            <Button size="sm" variant="outline" onClick={onExtend} loading={busy === `extend-${u._id}`} title="Gia hạn thêm 7 ngày">
              {busy !== `extend-${u._id}` && <CalendarPlus className="h-3.5 w-3.5" />}+7 ngày
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onReset} loading={busy === `reset-${u._id}`} title="Đặt lại số lượt AI đã dùng về 0">
            {busy !== `reset-${u._id}` && <RotateCcw className="h-3.5 w-3.5" />}Reset AI
          </Button>
          {!isSelf && (
            <Button
              size="sm"
              variant={u.status === "ACTIVE" ? "outline" : "success"}
              onClick={onToggle}
              loading={busy === `status-${u._id}`}
              className={u.status === "ACTIVE" ? "text-rose-600 hover:bg-rose-50" : undefined}
            >
              {busy !== `status-${u._id}` && (u.status === "ACTIVE" ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />)}
              {u.status === "ACTIVE" ? "Khóa" : "Mở khóa"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function MiniStat({ label, value, tone = "text-slate-900" }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", tone)}>{value}</p>
    </Card>
  );
}
