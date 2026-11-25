"use client";

import { AlertTriangle, BarChart3, CheckCircle2, Clock, Timer, TrendingUp, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BarList, ColumnChart, TrendChart } from "@/components/charts";
import { Card, EmptyState, ErrorBox, PageHeader, PageLoader } from "@/components/ui/primitives";
import { useAnalytics } from "@/lib/queries";
import { cn, formatDuration, PRIORITY_LABEL, SOURCE_LABEL } from "@/lib/utils";

const RANGES = [
  { value: 7, label: "7 ngày" },
  { value: 30, label: "30 ngày" },
  { value: 90, label: "90 ngày" },
  { value: 365, label: "1 năm" },
];

const fmtPct = (v: number | null) => (v === null ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(v)}%`);

export default function AnalyticsPage() {
  const [range, setRange] = useState(30);
  const q = useAnalytics(range);
  const a = q.data;

  return (
    <>
      <PageHeader
        title="Thống kê nâng cao"
        description="Ai giao việc nhiều nhất, tỷ lệ trễ hạn theo người giao, thời gian hoàn thành trung bình và xu hướng theo tuần."
        actions={
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="Khoảng thời gian">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={range === r.value}
                onClick={() => setRange(r.value)}
                className={cn(
                  "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium",
                  range === r.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      {q.isLoading ? (
        <PageLoader />
      ) : q.isError || !a ? (
        <ErrorBox message={q.error?.message ?? "Không tải được thống kê"} onRetry={() => q.refetch()} />
      ) : a.summary.created === 0 && a.summary.completed === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Chưa có dữ liệu trong khoảng này" description="Thử chọn khoảng thời gian dài hơn, hoặc tạo thêm công việc." />
        </Card>
      ) : (
        <div className={cn("space-y-4", q.isFetching && "opacity-70 transition-opacity")}>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Tỷ lệ hoàn thành"
              value={fmtPct(a.summary.completionRate)}
              sub={`${a.summary.completed} xong · ${a.summary.incomplete} chưa xong`}
            />
            <Tile
              icon={<Clock className="h-4 w-4" />}
              label="Hoàn thành đúng hạn"
              value={fmtPct(a.summary.onTimeRate)}
              sub={`${a.summary.completedLate}/${a.summary.completedWithDeadline} việc có hạn bị trễ`}
            />
            <Tile
              icon={<Timer className="h-4 w-4" />}
              label="Thời gian hoàn thành TB"
              value={formatDuration(a.summary.avgCompletionHours)}
              sub={`Trung vị ${formatDuration(a.summary.medianCompletionHours)}`}
            />
            <Tile
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Đang quá hạn"
              value={String(a.summary.overdueOpen)}
              sub={a.summary.overdueOpen > 0 ? "Cần xử lý ngay" : "Không có việc quá hạn"}
              status={a.summary.overdueOpen > 0 ? "critical" : undefined}
            />
          </div>

          {/* Trend */}
          <Card className="p-5">
            <SectionTitle icon={<TrendingUp className="h-4 w-4 text-slate-400" />} title="Việc nhận mới và hoàn thành theo tuần" />
            <TrendChart
              labels={a.weekly.map((w) => w.label)}
              series={[
                { name: "Nhận mới", values: a.weekly.map((w) => w.created) },
                { name: "Hoàn thành", values: a.weekly.map((w) => w.completed) },
              ]}
            />
          </Card>

          {/* By assigner */}
          <Card className="p-5">
            <SectionTitle icon={<Users className="h-4 w-4 text-slate-400" />} title="Theo người giao việc" />
            {a.byAssigner.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có việc nào trong khoảng này.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="py-2 pr-3 font-medium">Người giao</th>
                      <th className="px-2 py-2 text-right font-medium">Số việc</th>
                      <th className="px-2 py-2 text-right font-medium">Xong</th>
                      <th className="px-2 py-2 text-right font-medium">Đang làm</th>
                      <th className="px-2 py-2 font-medium">Tỷ lệ trễ hạn</th>
                      <th className="py-2 pl-2 text-right font-medium">TB hoàn thành</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.byAssigner.map((r, i) => (
                      <tr key={r.key} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 pr-3">
                          <p className="font-medium text-slate-900">
                            {r.name}
                            {i === 0 && r.kind !== "none" && a.byAssigner.length > 1 && (
                              <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">giao nhiều nhất</span>
                            )}
                          </p>
                          {r.position && <p className="text-xs text-slate-500">{r.position}</p>}
                        </td>
                        <td className="px-2 py-2.5 text-right font-semibold text-slate-900 tabular-nums">{r.total}</td>
                        <td className="px-2 py-2.5 text-right text-slate-700 tabular-nums">{r.completed}</td>
                        <td className="px-2 py-2.5 text-right text-slate-700 tabular-nums">
                          {r.open}
                          {r.overdueOpen > 0 && <span className="ml-1 text-xs text-[#d03b3b]">({r.overdueOpen} quá hạn)</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          {r.lateRate === null ? (
                            <span className="text-xs text-slate-400">Không có việc có hạn</span>
                          ) : (
                            <div className="flex items-center gap-2" title={`${r.late}/${r.withDeadline} việc có hạn bị trễ`}>
                              <span className="h-2 w-24 overflow-hidden rounded-r bg-slate-100">
                                <span className="block h-full rounded-r-[4px] bg-[#2a78d6]" style={{ width: `${Math.max(r.lateRate > 0 ? 3 : 0, r.lateRate)}%` }} />
                              </span>
                              <span className="w-12 text-right text-slate-900 tabular-nums">{fmtPct(r.lateRate)}</span>
                              <span className="text-xs text-slate-400">
                                {r.late}/{r.withDeadline}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pl-2 text-right text-slate-700 tabular-nums">{formatDuration(r.avgCompletionHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <SectionTitle title="Tỷ lệ hoàn thành theo mức ưu tiên" />
              <BarList
                max={100}
                format={(v) => fmtPct(v)}
                data={a.byPriority.map((p) => ({
                  key: p.priority,
                  label: PRIORITY_LABEL[p.priority],
                  value: p.completionRate,
                  hint: `${p.completed}/${p.total} xong · TB ${formatDuration(p.avgCompletionHours)}`,
                }))}
              />
            </Card>
            <Card className="p-5">
              <SectionTitle title="Việc mới theo ngày trong tuần" />
              <ColumnChart data={a.byWeekday.map((d) => ({ label: d.label, value: d.created }))} valueLabel="việc mới" />
            </Card>
            <Card className="p-5">
              <SectionTitle title="Nguồn công việc" />
              {a.bySource.length === 0 ? (
                <p className="text-sm text-slate-500">—</p>
              ) : (
                <BarList data={[...a.bySource].sort((x, y) => y.total - x.total).map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source], value: s.total, hint: `${s.total} việc` }))} />
              )}
            </Card>
          </div>

          {a.truncated && <p className="text-xs text-slate-400">Chỉ tính 5.000 công việc gần nhất trong khoảng này.</p>}
        </div>
      )}
    </>
  );
}

function Tile({ icon, label, value, sub, status }: { icon: ReactNode; label: string; value: string; sub: string; status?: "critical" }) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
        <span className={status === "critical" ? "text-[#d03b3b]" : "text-slate-400"}>{icon}</span>
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      <p className={cn("mt-1 text-xs", status === "critical" ? "font-medium text-[#d03b3b]" : "text-slate-500")}>{sub}</p>
    </Card>
  );
}

function SectionTitle({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
      {icon}
      {title}
    </h2>
  );
}
