"use client";

import { Bot, Eraser, Send, Sparkles, User } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { PriorityBadge, StatusBadge } from "@/components/tasks/TaskBadges";
import { TaskQuickView } from "@/components/tasks/TaskQuickView";
import { Button, Card, PageHeader, Spinner, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAssistant, useMe } from "@/lib/queries";
import type { AssistantTaskRef } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  tasks?: AssistantTaskRef[];
  isMock?: boolean;
}

const SUGGESTIONS = [
  "Hôm nay tôi cần làm gì?",
  "Việc nào đang quá hạn?",
  "Nên ưu tiên việc nào trước?",
  "Ai giao nhiều việc cho tôi nhất tuần này?",
  "Tuần trước tôi đã hoàn thành những gì?",
];

let idSeq = 1;

export default function AssistantPage() {
  const toast = useToast();
  const me = useMe();
  const ask = useAssistant();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [openTask, setOpenTask] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, ask.isPending]);

  async function send(question: string) {
    const q = question.trim();
    if (q.length < 2 || ask.isPending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { id: idSeq++, role: "user", content: q }]);
    setInput("");
    try {
      const { data } = await ask.mutateAsync({ question: q, history });
      setMessages((m) => [...m, { id: idSeq++, role: "assistant", content: data.answer, tasks: data.tasks, isMock: data.isMock }]);
    } catch (err) {
      toast.error((err as Error).message);
      setMessages((m) => [...m, { id: idSeq++, role: "assistant", content: `⚠️ ${(err as Error).message}` }]);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <>
      <PageHeader
        title="Trợ lý AI"
        description="Hỏi bất cứ điều gì về công việc của bạn — AI trả lời dựa trên danh sách việc thật."
        actions={
          messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setMessages([])}>
              <Eraser className="h-3.5 w-3.5" /> Cuộc trò chuyện mới
            </Button>
          )
        }
      />

      <Card className="flex h-[calc(100vh-15rem)] min-h-[460px] flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="mb-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 p-3 text-white">
                <Sparkles className="h-6 w-6" />
              </span>
              <p className="font-semibold text-slate-900">Xin chào{me.data ? `, ${me.data.fullName.split(/\s+/).pop()}` : ""}! Tôi có thể giúp gì?</p>
              <p className="mt-1 max-w-md text-sm text-slate-500">Mỗi câu hỏi dùng 1 lượt AI. Trợ lý chỉ đọc dữ liệu công việc, không tự thay đổi gì.</p>
              <div className="mt-5 flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="cursor-pointer rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  m.role === "user" ? "bg-slate-200 text-slate-600" : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white",
                )}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </span>
              <div className={cn("max-w-[85%] space-y-2", m.role === "user" && "items-end text-right")}>
                <div
                  className={cn(
                    "inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800",
                  )}
                >
                  {m.role === "assistant" ? renderAnswer(m.content, m.tasks ?? [], setOpenTask) : m.content}
                </div>
                {m.tasks && m.tasks.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {m.tasks.map((t) => (
                      <button
                        key={t._id}
                        type="button"
                        onClick={() => setOpenTask(t._id)}
                        className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-indigo-300 hover:shadow-sm"
                      >
                        <p className="line-clamp-2 text-sm font-medium text-slate-900">{t.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={t.status} />
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {t.deadline ? `Hạn ${formatDateTime(t.deadline)}` : "Chưa có hạn"}
                          {t.assignedByName ? ` · ${t.assignedByName}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {m.isMock && <p className="text-xs text-amber-700">Trả lời mẫu (chưa cấu hình GEMINI_API_KEY).</p>}
              </div>
            </div>
          ))}

          {ask.isPending && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                <Bot className="h-4 w-4" />
              </span>
              <Spinner className="h-4 w-4" /> Đang xem lại công việc của bạn…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-slate-100 p-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Hỏi về công việc… (Enter để gửi, Shift+Enter xuống dòng)"
            className="min-h-11 resize-none"
            rows={1}
            maxLength={1000}
            aria-label="Câu hỏi"
          />
          <Button type="submit" disabled={input.trim().length < 2} loading={ask.isPending} className="h-11" aria-label="Gửi">
            {!ask.isPending && <Send className="h-4 w-4" />}
          </Button>
        </form>
      </Card>

      <TaskQuickView taskId={openTask} onClose={() => setOpenTask(null)} />
    </>
  );
}

/** Minimal inline formatting: **bold** → <strong>, stray single "*" removed. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((seg, j) =>
    /^\*\*[^*\n]+\*\*$/.test(seg) ? (
      <strong key={`${keyPrefix}-${j}`} className="font-semibold">
        {seg.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${j}`}>{seg.replace(/(^|\s)\*(?=\S)|(?<=\S)\*(?=\s|$|[.,;:!?)])/g, "$1")}</span>
    ),
  );
}

/** Turns "[#abc123]" references in the answer into clickable chips. */
function renderAnswer(text: string, tasks: AssistantTaskRef[], open: (id: string) => void): ReactNode[] {
  return text.split(/(\[#[0-9a-f]{6}\])/gi).map((part, i) => {
    const m = part.match(/^\[#([0-9a-f]{6})\]$/i);
    if (!m) return <span key={i}>{renderInline(part, String(i))}</span>;
    const task = tasks.find((t) => t._id.toLowerCase().endsWith(m[1]!.toLowerCase()));
    if (!task) return null;
    return (
      <button
        key={i}
        type="button"
        onClick={() => open(task._id)}
        className="mx-0.5 inline-flex cursor-pointer items-center rounded-md bg-white px-1.5 py-0.5 align-baseline text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
        title={task.title}
      >
        Xem việc
      </button>
    );
  });
}
