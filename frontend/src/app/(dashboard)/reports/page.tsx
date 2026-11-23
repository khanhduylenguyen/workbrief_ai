"use client";

import { CheckCircle2, CircleDashed, ClipboardList, Copy, FileText, Info, Mail, TriangleAlert, Wand2, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { copyText } from "@/components/CopyButton";
import { Button, Card, EmptyState, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useMe, useWeeklyReport } from "@/lib/queries";
import type { WeeklyReport } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKS = [
  { value: 0, label: "Tuần này" },
  { value: -1, label: "Tuần trước" },
  { value: -2, label: "2 tuần trước" },
  { value: -3, label: "3 tuần trước" },
];

export default function ReportsPage() {
  const toast = useToast();
  const me = useMe();
  const generate = useWeeklyReport();
  const [weekOffset, setWeekOffset] = useState(0);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [text, setText] = useState("");

  async function run() {
    try {
      const { data } = await generate.mutateAsync(weekOffset);
      setReport(data);
      setText(data.report);
      toast.success(data.isMock ? "Đã tạo báo cáo mẫu." : "AI đã viết xong báo cáo tuần.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function copy() {
    await copyText(text);
    toast.success("Đã copy báo cáo.");
  }

  function email() {
    const subject = `Báo cáo công việc tuần ${report?.range.label ?? ""}${me.data ? ` – ${me.data.fullName}` : ""}`;
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    if (url.length > 1900) {
      void copyText(text);
      toast.info("Báo cáo dài: đã copy nội dung, hãy dán vào email nếu bị cắt.");
    }
    window.location.href = url;
  }

  return (
    <>
      <PageHeader
        title="Báo cáo tuần"
        description="AI tổng hợp việc đã làm, chưa xong và kế hoạch tuần tới thành báo cáo gửi sếp."
        actions={
          <>
            <Select value={weekOffset} onChange={(e) => setWeekOffset(Number(e.target.value))} className="w-40" aria-label="Chọn tuần">
              {WEEKS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </Select>
            <Button onClick={run} loading={generate.isPending} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
              {!generate.isPending && <Wand2 className="h-4 w-4" />}
              {generate.isPending ? "AI đang viết…" : report ? "Viết lại" : "Tạo báo cáo"}
            </Button>
          </>
        }
      />

      {!report ? (
        <Card>
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title="Chưa có báo cáo"
            description="Chọn tuần rồi bấm “Tạo báo cáo”. AI dùng dữ liệu công việc thật của bạn (hoàn thành, chưa xong kèm lý do, việc đang làm, hạn tuần tới). Mỗi lần tạo dùng 1 lượt AI."
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <Card className="p-4">
              <p className="text-xs text-slate-500">Tuần</p>
              <p className="font-semibold text-slate-900">{report.range.label}</p>
              <p className="mt-3 text-xs text-slate-500">Tỷ lệ hoàn thành</p>
              <p className="text-2xl font-semibold text-slate-900">{report.stats.completionRate}%</p>
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <Stat icon={<CheckCircle2 className="h-4 w-4" />} tone="text-emerald-600 bg-emerald-50" label="Hoàn thành" value={report.stats.completed} />
              <Stat icon={<XCircle className="h-4 w-4" />} tone="text-orange-600 bg-orange-50" label="Chưa hoàn thành" value={report.stats.incomplete} />
              <Stat icon={<ClipboardList className="h-4 w-4" />} tone="text-slate-600 bg-slate-100" label="Nhận mới" value={report.stats.created} />
              <Stat icon={<CircleDashed className="h-4 w-4" />} tone="text-indigo-600 bg-indigo-50" label="Đang làm" value={report.stats.inProgress} />
              <Stat icon={<TriangleAlert className="h-4 w-4" />} tone="text-rose-600 bg-rose-50" label="Quá hạn" value={report.stats.overdue} />
              <Stat icon={<FileText className="h-4 w-4" />} tone="text-violet-600 bg-violet-50" label="Đến hạn tuần tới" value={report.stats.dueNextWeek} />
            </div>
          </div>

          <Card className="flex flex-col p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900">Nội dung báo cáo</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copy}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button size="sm" onClick={email}>
                  <Mail className="h-3.5 w-3.5" /> Gửi qua email
                </Button>
              </div>
            </div>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[480px] flex-1 font-mono text-[13px] leading-relaxed" aria-label="Nội dung báo cáo" />
            <p className={cn("mt-2 flex items-center gap-1.5 text-xs", report.isMock ? "text-amber-700" : "text-slate-500")}>
              <Info className="h-3.5 w-3.5" />
              {report.isMock
                ? "Báo cáo mẫu vì Backend chưa cấu hình GEMINI_API_KEY."
                : `Bạn có thể sửa trực tiếp trước khi gửi. Còn ${report.quota.remaining} lượt AI.`}
            </p>
          </Card>
        </div>
      )}
    </>
  );
}

function Stat({ icon, tone, label, value }: { icon: ReactNode; tone: string; label: string; value: number }) {
  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <span className={cn("rounded-lg p-2", tone)}>{icon}</span>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-semibold text-slate-900">{value}</p>
      </div>
    </Card>
  );
}
