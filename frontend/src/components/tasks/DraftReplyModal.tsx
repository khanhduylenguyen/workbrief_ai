"use client";

import { Copy, Info, Mail, MessageCircle, Wand2 } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/components/CopyButton";
import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useDraftReply } from "@/lib/queries";
import type { ReplyChannel, ReplyTone, Task } from "@/lib/types";
import { cn, zaloLink } from "@/lib/utils";

const TONES: { value: ReplyTone; label: string; hint: string }[] = [
  { value: "CONFIRM", label: "Xác nhận nhận việc", hint: "Đã nhận, sẽ làm đúng hạn" },
  { value: "PROGRESS", label: "Báo tiến độ", hint: "Dựa trên checklist hiện tại" },
  { value: "DONE", label: "Báo hoàn thành", hint: "Nhờ kiểm tra lại" },
  { value: "DELAY", label: "Xin lùi hạn", hint: "Kèm lý do / hạn mới" },
  { value: "QUESTION", label: "Hỏi lại yêu cầu", hint: "Làm rõ trước khi làm" },
];

function defaultTone(task: Task): ReplyTone {
  if (task.status === "COMPLETED") return "DONE";
  if (task.status === "INCOMPLETE") return "DELAY";
  return task.checklist.some((c) => c.isDone) ? "PROGRESS" : "CONFIRM";
}

/** Mounted only while open (keyed by task) so state resets per task. */
export function DraftReplyModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const toast = useToast();
  const draft = useDraftReply();
  const colleague = task.assignedBy;
  const [tone, setTone] = useState<ReplyTone>(defaultTone(task));
  const [channel, setChannel] = useState<ReplyChannel>(colleague?.email || !colleague?.zaloPhone ? "EMAIL" : "ZALO");
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isMock, setIsMock] = useState(false);

  async function generate() {
    try {
      const { data } = await draft.mutateAsync({ taskId: task._id, tone, channel, note: note.trim() || undefined });
      setSubject(data.subject);
      setBody(data.body);
      setIsMock(data.isMock);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function copy() {
    await copyText(channel === "EMAIL" && subject ? `${subject}\n\n${body}` : body);
    toast.success("Đã copy nội dung.");
  }

  async function openZalo() {
    await copyText(body);
    toast.info("Đã copy tin nhắn — dán (Ctrl+V) vào khung chat Zalo.");
    const link = zaloLink(colleague?.zaloPhone);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  }

  function openMail() {
    const to = colleague?.email ?? "";
    const url = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (url.length > 1900) {
      // Some mail clients truncate very long mailto links — copy as a fallback.
      void copyText(body);
      toast.info("Nội dung dài: đã copy thân thư, hãy dán vào email nếu bị cắt.");
    }
    window.location.href = url;
  }

  const zalo = zaloLink(colleague?.zaloPhone);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Soạn phản hồi bằng AI"
      description={colleague ? `Gửi ${colleague.name}${colleague.position ? ` (${colleague.position})` : ""} · ${task.title}` : task.title}
      footer={
        body ? (
          <>
            <Button variant="outline" onClick={copy}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
            {channel === "EMAIL" ? (
              <Button onClick={openMail}>
                <Mail className="h-4 w-4" /> Mở email{colleague?.email ? "" : " (chưa có địa chỉ)"}
              </Button>
            ) : (
              <Button onClick={openZalo} disabled={!zalo} title={zalo ? undefined : "Người giao chưa có SĐT Zalo"}>
                <MessageCircle className="h-4 w-4" /> Copy & mở Zalo
              </Button>
            )}
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Mục đích</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTone(t.value)}
                className={cn(
                  "cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors",
                  tone === t.value ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <span className="block text-sm font-medium text-slate-800">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Kênh</p>
            <div className="inline-flex rounded-lg bg-slate-100 p-1">
              {(["EMAIL", "ZALO"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
                    channel === c ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {c === "EMAIL" ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                  {c === "EMAIL" ? "Email" : "Zalo"}
                </button>
              ))}
            </div>
          </div>
          <Field label="Ghi chú thêm cho AI (tuỳ chọn)" htmlFor="reply-note" className="min-w-60 flex-1">
            <Input id="reply-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: xin lùi sang thứ 2 vì chờ số liệu kế toán" maxLength={1000} />
          </Field>
          <Button onClick={generate} loading={draft.isPending} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
            {!draft.isPending && <Wand2 className="h-4 w-4" />}
            {body ? "Soạn lại" : "AI soạn"}
          </Button>
        </div>

        {body && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            {channel === "EMAIL" && (
              <Field label="Tiêu đề email" htmlFor="reply-subject">
                <Input id="reply-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
            )}
            <Field label="Nội dung (có thể sửa trước khi gửi)" htmlFor="reply-body">
              <Textarea id="reply-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-56" />
            </Field>
            {isMock && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <Info className="h-3.5 w-3.5" /> Bản nháp mẫu vì Backend chưa cấu hình GEMINI_API_KEY.
              </p>
            )}
          </div>
        )}
        {!body && <p className="text-xs text-slate-500">Mỗi lần soạn dùng 1 lượt AI. Bạn luôn xem và sửa trước khi gửi — WorkBrief AI không tự gửi tin nhắn.</p>}
      </div>
    </Modal>
  );
}
