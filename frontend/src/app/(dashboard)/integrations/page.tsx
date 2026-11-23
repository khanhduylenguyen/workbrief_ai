"use client";

import { CheckCircle2, Eye, EyeOff, Info, Mail, MessageCircle, RefreshCw, Send, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { CopyButton } from "@/components/CopyButton";
import { PriorityBadge } from "@/components/tasks/TaskBadges";
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, PageLoader, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useIntegrations, useRegenerateWebhookKey, useSimulateZalo } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const SAMPLE_MESSAGE =
  "Em ơi, chiều nay 4h họp với khách hàng ABC. Em chuẩn bị giúp chị:\n- In 3 bản hợp đồng\n- Gửi lại báo giá mới nhất\n- Đặt phòng họp tầng 5\nGấp nhé!";

export default function IntegrationsPage() {
  const toast = useToast();
  const overview = useIntegrations();
  const regenerate = useRegenerateWebhookKey();
  const simulate = useSimulateZalo();
  const [showKey, setShowKey] = useState(false);
  const [sim, setSim] = useState({ senderName: "", senderPhone: "", groupName: "", message: "" });
  const [created, setCreated] = useState<{ task: Task; isMock: boolean } | null>(null);

  if (overview.isLoading) return <PageLoader />;
  if (overview.isError || !overview.data) {
    return <ErrorBox message={overview.error?.message ?? "Không tải được dữ liệu"} onRetry={() => overview.refetch()} />;
  }
  const { gmail, zalo, ai } = overview.data;

  async function onRegenerate() {
    if (!window.confirm("Tạo webhook key mới? Key cũ sẽ ngừng hoạt động ngay, bạn cần cập nhật lại trong Zalo Extension.")) return;
    try {
      const { message } = await regenerate.mutateAsync();
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onSimulate(e: FormEvent) {
    e.preventDefault();
    setCreated(null);
    try {
      const { data, message } = await simulate.mutateAsync({
        webhookApiKey: zalo.webhookApiKey,
        message: sim.message,
        ...(sim.senderName.trim() && { senderName: sim.senderName.trim() }),
        ...(sim.senderPhone.trim() && { senderPhone: sim.senderPhone.trim() }),
        ...(sim.groupName.trim() && { groupName: sim.groupName.trim() }),
      });
      setCreated(data);
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const maskedKey = `${zalo.webhookApiKey.slice(0, 7)}${"•".repeat(24)}${zalo.webhookApiKey.slice(-4)}`;

  return (
    <>
      <PageHeader title="Gmail & Zalo" description="Kết nối nguồn công việc để AI tự tóm tắt và tạo việc cho bạn." />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Gmail */}
        <Card className="p-5">
          <CardHead icon={<Mail className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" title="Gmail" status={gmail.isConnected} />
          <p className="mt-3 text-sm text-slate-600">
            {gmail.isConnected ? (
              <>
                Đã kết nối với <span className="font-medium text-slate-900">{gmail.email}</span>
              </>
            ) : (
              "Kết nối Gmail qua Google OAuth để AI tự đọc email được giao việc và tạo task."
            )}
          </p>
          <dl className="mt-4 space-y-1.5 text-xs text-slate-500">
            <Row label="Task từ Gmail" value={gmail.taskCount} />
            <Row label="Task gần nhất" value={formatDateTime(gmail.lastTaskAt)} />
          </dl>
          <Button variant="outline" className="mt-4 w-full" disabled title="Luồng Google OAuth chưa được triển khai ở Backend">
            <Mail className="h-4 w-4" /> {gmail.isConnected ? "Ngắt kết nối" : "Kết nối Gmail (OAuth)"}
          </Button>
          <p className="mt-2 text-center text-[11px] text-slate-400">Google OAuth sẽ được bật ở phiên bản tới.</p>
        </Card>

        {/* Zalo */}
        <Card className="p-5 lg:col-span-2">
          <CardHead icon={<MessageCircle className="h-5 w-5 text-blue-500" />} iconBg="bg-blue-50" title="Zalo Webhook" status label="Sẵn sàng" />
          <p className="mt-3 text-sm text-slate-600">
            Zalo Extension gửi tin nhắn tới webhook này kèm header <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{zalo.headerName}</code>.
            AI sẽ tóm tắt và tạo task, tự khớp người gửi với{" "}
            <Link href="/colleagues" className="text-indigo-600 hover:underline">
              danh bạ
            </Link>{" "}
            theo SĐT hoặc tên.
          </p>

          <div className="mt-4 space-y-3">
            <Field label="Webhook URL">
              <div className="flex gap-2">
                <Input readOnly value={zalo.webhookUrl} className="font-mono text-xs" />
                <CopyButton value={zalo.webhookUrl} />
              </div>
            </Field>
            <Field label={`Header ${zalo.headerName}`} hint="Giữ bí mật — ai có key này đều có thể tạo task và dùng AI quota của bạn.">
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <Input readOnly value={showKey ? zalo.webhookApiKey : maskedKey} className="font-mono text-xs" />
                <Button variant="outline" size="sm" className="h-10" onClick={() => setShowKey((s) => !s)} aria-label={showKey ? "Ẩn key" : "Hiện key"}>
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <CopyButton value={zalo.webhookApiKey} label="Copy key" />
                <Button variant="outline" size="sm" className="h-10" onClick={onRegenerate} loading={regenerate.isPending}>
                  {!regenerate.isPending && <RefreshCw className="h-3.5 w-3.5" />} Tạo key mới
                </Button>
              </div>
            </Field>
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <Row label="Task từ Zalo" value={zalo.taskCount} />
            <Row label="Task gần nhất" value={formatDateTime(zalo.lastTaskAt)} />
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Simulator */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Send className="h-4 w-4 text-blue-500" /> Giả lập tin nhắn Zalo
          </h2>
          <p className="mt-1 text-sm text-slate-500">Gửi thử một tin nhắn tới webhook bằng key của bạn để kiểm tra luồng tạo task tự động.</p>

          <form onSubmit={onSimulate} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Người gửi" htmlFor="sim-name">
                <Input id="sim-name" value={sim.senderName} onChange={(e) => setSim((s) => ({ ...s, senderName: e.target.value }))} placeholder="Chị Lan" />
              </Field>
              <Field label="SĐT người gửi" htmlFor="sim-phone">
                <Input id="sim-phone" value={sim.senderPhone} onChange={(e) => setSim((s) => ({ ...s, senderPhone: e.target.value }))} placeholder="0912 345 678" />
              </Field>
              <Field label="Nhóm" htmlFor="sim-group">
                <Input id="sim-group" value={sim.groupName} onChange={(e) => setSim((s) => ({ ...s, groupName: e.target.value }))} placeholder="Phòng Kinh doanh" />
              </Field>
            </div>
            <Field label="Nội dung tin nhắn" htmlFor="sim-message" required>
              <Textarea
                id="sim-message"
                value={sim.message}
                onChange={(e) => setSim((s) => ({ ...s, message: e.target.value }))}
                placeholder={SAMPLE_MESSAGE}
                className="min-h-32"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={simulate.isPending} disabled={sim.message.trim().length < 10}>
                {!simulate.isPending && <Send className="h-4 w-4" />} Gửi tới Webhook
              </Button>
              <Button variant="ghost" onClick={() => setSim((s) => ({ ...s, message: SAMPLE_MESSAGE }))}>
                Dùng tin nhắn mẫu
              </Button>
            </div>
          </form>

          {created && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> Đã tạo task từ Zalo
                {created.isMock && <Badge className="bg-amber-100 text-amber-800">Tóm tắt mẫu</Badge>}
              </p>
              <p className="mt-2 font-medium text-slate-900">{created.task.title}</p>
              <p className="mt-1 text-sm text-slate-600">{created.task.aiSummary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <PriorityBadge priority={created.task.priority} />
                <span>{created.task.checklist.length} bước</span>
                <span>· Người giao: {created.task.assignedBy?.name ?? "chưa khớp danh bạ"}</span>
              </div>
              <Link href="/tasks" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline">
                Xem trong Quản lý công việc →
              </Link>
            </div>
          )}
        </Card>

        {/* AI status */}
        <Card className="h-fit p-5">
          <CardHead
            icon={<Sparkles className="h-5 w-5 text-indigo-500" />}
            iconBg="bg-indigo-50"
            title="AI tóm tắt"
            status={ai.configured || ai.mockFallback}
            label={ai.configured ? "Gemini" : ai.mockFallback ? "Chế độ mẫu" : "Chưa cấu hình"}
          />
          <dl className="mt-4 space-y-1.5 text-xs text-slate-500">
            <Row label="Model" value={ai.model} />
            <Row label="Đã dùng" value={`${ai.quota.used}/${ai.quota.limit} lượt`} />
            <Row label="Còn lại" value={`${ai.quota.remaining} lượt`} />
          </dl>
          {!ai.configured && (
            <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <Info className="h-4 w-4 shrink-0" />
              <span>
                Backend chưa có <code>GEMINI_API_KEY</code>
                {ai.mockFallback ? " — đang trả về tóm tắt mẫu để test." : "."}
              </span>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function CardHead({ icon, iconBg, title, status, label }: { icon: ReactNode; iconBg: string; title: string; status: boolean; label?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`rounded-xl p-2.5 ${iconBg}`}>{icon}</span>
        <h2 className="font-semibold text-slate-900">{title}</h2>
      </div>
      {status ? (
        <Badge className="bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="h-3 w-3" /> {label ?? "Đã kết nối"}
        </Badge>
      ) : (
        <Badge className="bg-slate-100 text-slate-500">
          <XCircle className="h-3 w-3" /> {label ?? "Chưa kết nối"}
        </Badge>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-medium text-slate-700">{value}</dd>
    </div>
  );
}
