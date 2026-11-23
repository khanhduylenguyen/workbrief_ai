"use client";

import { Bell, CalendarClock, Eye, EyeOff, Info, KeyRound, Mail, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, Field, Input, PageHeader, PageLoader, ProgressBar, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useChangePassword, useMe, useSendTestReminder, useUpdateProfile } from "@/lib/queries";
import type { User } from "@/lib/types";
import { formatDate, formatDateTime, initials } from "@/lib/utils";

export default function ProfilePage() {
  const me = useMe();
  if (!me.data) return <PageLoader />;
  // Keyed by user id so the forms re-initialise if the account changes.
  return <ProfileContent key={me.data._id} user={me.data} />;
}

function ProfileContent({ user }: { user: User }) {
  return (
    <>
      <PageHeader title="Hồ sơ của bạn" description="Thông tin tài khoản, mật khẩu và cài đặt nhắc việc." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <AccountCard user={user} />
          <NotificationCard user={user} />
        </div>
        <PasswordCard />
      </div>
    </>
  );
}

/* --------------------------------------------------------------- Account -- */

function AccountCard({ user }: { user: User }) {
  const toast = useToast();
  const update = useUpdateProfile();
  const [fullName, setFullName] = useState(user.fullName);
  const quotaPct = user.aiQuotaLimit > 0 ? (user.aiQuotaUsed / user.aiQuotaLimit) * 100 : 100;
  const dirty = fullName.trim() !== user.fullName && fullName.trim().length > 0;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({ fullName: fullName.trim() });
      toast.success("Đã cập nhật họ tên.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700">
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-slate-900">{user.fullName}</p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {user.role === "ADMIN" ? (
              <Badge className="bg-violet-50 text-violet-700">
                <ShieldCheck className="h-3 w-3" /> Quản trị viên
              </Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-600">
                <UserRound className="h-3 w-3" /> Người dùng
              </Badge>
            )}
            <Badge className="bg-emerald-50 text-emerald-700">Đang hoạt động</Badge>
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="mt-5 flex items-end gap-2">
        <Field label="Họ tên" htmlFor="p-name" className="flex-1">
          <Input id="p-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} required />
        </Field>
        <Button type="submit" disabled={!dirty} loading={update.isPending}>
          Lưu
        </Button>
      </form>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" /> AI Quota
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {user.aiQuotaUsed}/{user.aiQuotaLimit} lượt
          </dd>
          <ProgressBar value={quotaPct} className="mt-2 h-1.5" />
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Thời hạn tài khoản
          </dt>
          <dd className="mt-1 font-medium text-slate-900">
            {user.trialExpiresAt ? `${formatDate(user.trialExpiresAt)} (còn ${user.trialDaysLeft} ngày)` : "Không giới hạn"}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 sm:col-span-2">
          <dt className="text-xs text-slate-500">Đăng nhập gần nhất</dt>
          <dd className="mt-1 font-medium text-slate-900">{formatDateTime(user.lastLoginAt)}</dd>
        </div>
      </dl>
    </Card>
  );
}

/* --------------------------------------------------------- Notifications -- */

function NotificationCard({ user }: { user: User }) {
  const toast = useToast();
  const update = useUpdateProfile();
  const sendTest = useSendTestReminder();
  const mailReady = user.capabilities?.mail ?? false;

  async function toggle(key: keyof User["settings"], value: boolean) {
    try {
      await update.mutateAsync({ settings: { [key]: value } });
      toast.success(value ? "Đã bật." : "Đã tắt.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onTest() {
    try {
      const { message } = await sendTest.mutateAsync();
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
        <Bell className="h-4 w-4 text-indigo-600" /> Nhắc việc & tự động hoá
      </h2>
      <div className="space-y-4">
        <Switch
          checked={user.settings?.emailDigest ?? true}
          onChange={(v) => toggle("emailDigest", v)}
          disabled={update.isPending}
          label="Email nhắc việc mỗi sáng"
          description={
            <>
              Gửi tới <b>{user.email}</b> danh sách việc quá hạn, đến hạn hôm nay và ngày mai. Không có việc nào thì không gửi.
            </>
          }
        />
        <Switch
          checked={user.settings?.autoGmailSync ?? true}
          onChange={(v) => toggle("autoGmailSync", v)}
          disabled={update.isPending}
          label="Tự động đồng bộ Gmail"
          description="Hệ thống tự kiểm tra email mới theo lịch (mỗi email mới dùng 1 lượt AI)."
        />
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        {mailReady ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Lần gửi gần nhất: <span className="font-medium text-slate-700">{formatDateTime(user.lastDigestAt)}</span>
            </p>
            <Button variant="outline" size="sm" onClick={onTest} loading={sendTest.isPending}>
              {!sendTest.isPending && <Send className="h-3.5 w-3.5" />} Gửi thử email nhắc việc
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <Info className="h-4 w-4 shrink-0" />
            <span>
              Máy chủ chưa cấu hình gửi email (<code>SMTP_HOST</code>), nên email nhắc việc tạm thời chưa được gửi.
            </span>
          </div>
        )}
        {!/@[^@]+\.[a-z]{2,}$/i.test(user.email) || user.email.endsWith(".local") ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
            <Mail className="h-3.5 w-3.5" /> Email đăng nhập <b>{user.email}</b> không phải hộp thư thật nên sẽ không nhận được nhắc việc.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- Password -- */

function PasswordCard() {
  const toast = useToast();
  const change = useChangePassword();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [show, setShow] = useState(false);

  const mismatch = form.confirm.length > 0 && form.confirm !== form.newPassword;
  const tooShort = form.newPassword.length > 0 && form.newPassword.length < 8;
  const same = form.newPassword.length > 0 && form.newPassword === form.currentPassword;
  const canSubmit = form.currentPassword && form.newPassword.length >= 8 && form.confirm === form.newPassword && !same;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await change.mutateAsync({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success("Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.");
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const type = show ? "text" : "password";

  return (
    <Card className="h-fit p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <KeyRound className="h-4 w-4 text-indigo-600" /> Đổi mật khẩu
        </h2>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? "Ẩn" : "Hiện"} mật khẩu
        </button>
      </div>
      <form onSubmit={onSubmit} className="space-y-3.5">
        <Field label="Mật khẩu hiện tại" htmlFor="pw-current" required>
          <Input
            id="pw-current"
            type={type}
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
            required
          />
        </Field>
        <Field
          label="Mật khẩu mới"
          htmlFor="pw-new"
          required
          hint={tooShort ? <span className="text-rose-600">Tối thiểu 8 ký tự</span> : same ? <span className="text-rose-600">Phải khác mật khẩu hiện tại</span> : "Tối thiểu 8 ký tự."}
        >
          <Input
            id="pw-new"
            type={type}
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
            minLength={8}
            maxLength={128}
            required
          />
        </Field>
        <Field label="Nhập lại mật khẩu mới" htmlFor="pw-confirm" required hint={mismatch ? <span className="text-rose-600">Mật khẩu nhập lại không khớp</span> : undefined}>
          <Input
            id="pw-confirm"
            type={type}
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={!canSubmit} loading={change.isPending}>
          Đổi mật khẩu
        </Button>
        <p className="text-xs text-slate-500">Sau khi đổi, mọi phiên đăng nhập trên thiết bị khác sẽ bị đăng xuất.</p>
      </form>
    </Card>
  );
}
