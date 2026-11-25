"use client";

import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, CircleDashed, ClipboardList, Clock, FileText, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeadlineLabel, PriorityBadge, SourceBadge, StatusBadge } from "@/components/tasks/TaskBadges";
import { Card, EmptyState, ErrorBox, PageHeader, PageLoader, ProgressBar } from "@/components/ui/primitives";
import { useMe, useTaskStats, useTasks } from "@/lib/queries";
import { cn, formatDateTime } from "@/lib/utils";

export default function DashboardPage() {
  const me = useMe();
  const stats = useTaskStats();
  const recent = useTasks({ limit: 5, sortBy: "createdAt", sortOrder: "desc" });

  if (stats.isLoading) return <PageLoader />;
  if (stats.isError || !stats.data) {
    return <ErrorBox message={stats.error?.message ?? "Không tải được thống kê"} onRetry={() => stats.refetch()} />;
  }

  const s = stats.data;
  const firstName = me.data?.fullName.trim().split(/\s+/).pop();

  return (
    <>
      <PageHeader
        title={`Xin chào${firstName ? `, ${firstName}` : ""} 👋`}
        description="Tổng quan công việc của bạn hôm nay."
        actions={
          <Link
            href="/tasks"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
          >
            Quản lý công việc <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {(s.overdue > 0 || s.dueToday > 0) && (
        <Link
          href="/tasks"
          className={cn(
            "mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors",
            s.overdue > 0 ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100" : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
          )}
        >
          <BellRing className="h-5 w-5 shrink-0" />
          <span className="flex-1">
            {s.overdue > 0 && (
              <>
                Bạn có <b>{s.overdue} việc quá hạn</b>
                {s.dueToday > 0 ? " và " : "."}
              </>
            )}
            {s.dueToday > 0 && (
              <>
                {s.overdue > 0 ? "" : "Bạn có "}
                <b>{s.dueToday} việc đến hạn hôm nay</b>.
              </>
            )}{" "}
            Xử lý ngay để không bị trễ.
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng việc" value={s.total} icon={<ClipboardList className="h-5 w-5" />} tone="slate" />
        <StatCard label="Đang làm" value={s.inProgress} icon={<CircleDashed className="h-5 w-5" />} tone="indigo" />
        <StatCard label="Hoàn thành" value={s.completed} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
        <StatCard label="Chưa hoàn thành" value={s.incomplete} icon={<XCircle className="h-5 w-5" />} tone="orange" />
      </div>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-700">Tỷ lệ hoàn thành</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {s.completed}/{s.total} công việc đã hoàn thành
            </p>
          </div>
          <div className="flex items-center gap-4">
            {s.overdue > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {s.overdue} việc quá hạn
              </span>
            )}
            <span className="text-2xl font-semibold text-slate-900">{s.completionRate}%</span>
          </div>
        </div>
        <ProgressBar value={s.completionRate} className="mt-3 h-3" barClassName="bg-gradient-to-r from-indigo-500 to-emerald-500" />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
          <span>Gmail: {s.bySource.GMAIL}</span>
          <span>Zalo: {s.bySource.ZALO}</span>
          <span>Telegram: {s.bySource.TELEGRAM ?? 0}</span>
          <span>Cuộc họp: {s.bySource.MEETING ?? 0}</span>
          <span>Thủ công: {s.bySource.MANUAL}</span>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={<Clock className="h-4 w-4 text-amber-500" />} title={`Sắp đến hạn (${s.upcomingDays} ngày tới)`} />
          {s.upcoming.length === 0 ? (
            <EmptyState title="Không có việc nào sắp đến hạn" description={`Các việc đang làm có deadline trong ${s.upcomingDays} ngày tới sẽ hiện ở đây.`} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.upcoming.map((t) => {
                const done = t.checklist.filter((c) => c.isDone).length;
                return (
                  <li key={t._id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <DeadlineLabel deadline={t.deadline} />
                        {t.assignedBy && <span className="text-xs text-slate-400">· {t.assignedBy.name}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <PriorityBadge priority={t.priority} />
                      {t.checklist.length > 0 && (
                        <span className="text-xs text-slate-400">
                          {done}/{t.checklist.length} bước
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle
            icon={<FileText className="h-4 w-4 text-indigo-500" />}
            title="Ghi chú gần đây"
            action={
              <Link href="/tasks" className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
                Xem tất cả
              </Link>
            }
          />
          {recent.isLoading ? (
            <PageLoader />
          ) : !recent.data?.items.length ? (
            <EmptyState
              title="Chưa có ghi chú nào"
              description="Dán email hoặc tin nhắn sếp giao để AI tóm tắt thành việc cần làm."
              action={
                <Link href="/tasks" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
                  Tạo việc đầu tiên →
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.data.items.map((t) => (
                <li key={t._id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-slate-900">{t.title}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.aiSummary && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{t.aiSummary}</p>}
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                    <SourceBadge source={t.source} />
                    <span>{formatDateTime(t.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

const TONES = {
  slate: "bg-slate-100 text-slate-600",
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-600",
};

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: keyof typeof TONES }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={cn("rounded-lg p-2", TONES[tone])}>{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
    </Card>
  );
}

function SectionTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}
