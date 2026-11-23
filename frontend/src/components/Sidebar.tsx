"use client";

import {
  Bot,
  CalendarClock,
  CalendarDays,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plug,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProgressBar } from "@/components/ui/primitives";
import { useLogout } from "@/lib/queries";
import type { User } from "@/lib/types";
import { cn, formatDate, initials } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Công việc", icon: ListChecks },
  { href: "/calendar", label: "Lịch", icon: CalendarDays },
  { href: "/assistant", label: "Trợ lý AI", icon: Bot },
  { href: "/reports", label: "Báo cáo tuần", icon: FileText },
  { href: "/colleagues", label: "Danh bạ đồng nghiệp", icon: Users },
  { href: "/integrations", label: "Gmail & Zalo", icon: Plug },
  { href: "/profile", label: "Hồ sơ & bảo mật", icon: UserRound },
] as const;

const ADMIN_NAV = { href: "/admin", label: "Quản trị (Admin)", icon: ShieldCheck } as const;

export function Sidebar({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const pathname = usePathname();
  const logout = useLogout();
  const items = user.role === "ADMIN" ? [...NAV, ADMIN_NAV] : NAV;

  const quotaPct = user.aiQuotaLimit > 0 ? (user.aiQuotaUsed / user.aiQuotaLimit) * 100 : 100;
  const quotaColor = quotaPct >= 90 ? "bg-rose-500" : quotaPct >= 70 ? "bg-amber-500" : "bg-indigo-600";
  const trialWarn = user.trialDaysLeft !== null && user.trialDaysLeft <= 3;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2.5 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          WorkBrief AI
        </Link>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className={cn("h-4.5 w-4.5", active ? "text-indigo-600" : "text-slate-400")} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-100 p-4">
        {/* AI quota */}
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              AI Quota
            </span>
            <span className="text-slate-500">
              {user.aiQuotaUsed}/{user.aiQuotaLimit}
            </span>
          </div>
          <ProgressBar value={quotaPct} barClassName={quotaColor} />
          <p className="mt-1.5 text-xs text-slate-500">Còn {user.aiQuotaRemaining} lượt tóm tắt</p>
        </div>

        {/* Trial */}
        {user.trialExpiresAt ? (
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-xl p-3 text-xs",
              trialWarn ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600",
            )}
          >
            <CalendarClock className={cn("mt-0.5 h-4 w-4 shrink-0", trialWarn ? "text-amber-600" : "text-slate-400")} />
            <div>
              <p className="font-medium">Dùng thử đến {formatDate(user.trialExpiresAt)}</p>
              <p className="mt-0.5">Còn {user.trialDaysLeft} ngày</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Tài khoản không giới hạn thời gian
          </div>
        )}

        {/* User */}
        <div className="flex items-center gap-3 pt-1">
          <Link href="/profile" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-80" title="Hồ sơ của bạn">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
            {initials(user.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
