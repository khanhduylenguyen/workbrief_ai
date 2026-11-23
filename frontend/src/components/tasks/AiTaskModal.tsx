"use client";

import { Info,Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAiSummarize, useColleagues, useCreateTask, useMe } from "@/lib/queries";
import type { TaskPriority, TaskSource } from "@/lib/types";
import { formatDateTime, fromDateTimeLocal, PRIORITY_LABEL, SOURCE_LABEL, toDateTimeLocal } from "@/lib/utils";

interface DraftItem {
  key: number;
  text: string;
  isDone: boolean;
}

let keySeq = 1;
const newItem = (text = "", isDone = false): DraftItem => ({ key: keySeq++, text, isDone });

const EMPTY = {
  rawContent: "",
  source: "MANUAL" as TaskSource,
  title: "",
  aiSummary: "",
  priority: "MEDIUM" as TaskPriority,
  assignedBy: "",
  deadline: "",
};

export function AiTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const me = useMe();
  const colleagues = useColleagues();
  const summarize = useAiSummarize();
  const createTask = useCreateTask();

  const [form, setForm] = useState(EMPTY);
  const [checklist, setChecklist] = useState<DraftItem[]>([]);
  const [newStep, setNewStep] = useState("");
  const [aiInfo, setAiInfo] = useState<{ isMock: boolean; remaining: number; deadline: string | null } | null>(null);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  function reset() {
    setForm(EMPTY);
    setChecklist([]);
    setNewStep("");
    setAiInfo(null);
    summarize.reset();
  }

  function close() {
    reset();
    onClose();
  }

  async function runAi() {
    if (form.rawContent.trim().length < 10) {
      toast.error("Hãy dán nội dung công việc (tối thiểu 10 ký tự) trước khi tóm tắt.");
      return;
    }
    try {
      const { data } = await summarize.mutateAsync({ rawContent: form.rawContent, source: form.source });
      setForm((f) => ({
        ...f,
        title: data.title,
        aiSummary: data.aiSummary,
        priority: data.suggestedPriority,
        // Only fill the deadline if the user hasn't chosen one themselves.
        deadline: f.deadline || toDateTimeLocal(data.suggestedDeadline),
      }));
      setChecklist(data.checklist.map((c) => newItem(c.text, c.isDone)));
      setAiInfo({ isMock: data.isMock, remaining: data.quota.remaining, deadline: data.suggestedDeadline });
      toast.success(
        data.suggestedDeadline
          ? `AI đã tóm tắt và gợi ý hạn chót ${formatDateTime(data.suggestedDeadline)} — bạn có thể chỉnh trước khi lưu.`
          : "AI đã tóm tắt xong — bạn có thể chỉnh sửa trước khi lưu.",
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function addStep() {
    const text = newStep.trim();
    if (!text) return;
    setChecklist((c) => [...c, newItem(text)]);
    setNewStep("");
  }

  function onStepKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addStep();
    }
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error("Vui lòng nhập tiêu đề công việc.");
      return;
    }
    try {
      await createTask.mutateAsync({
        title: form.title.trim(),
        rawContent: form.rawContent,
        aiSummary: form.aiSummary,
        checklist: checklist.filter((c) => c.text.trim()).map((c) => ({ text: c.text.trim(), isDone: c.isDone })),
        source: form.source,
        priority: form.priority,
        assignedBy: form.assignedBy || null,
        deadline: fromDateTimeLocal(form.deadline),
      });
      toast.success("Đã lưu công việc mới.");
      close();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const quotaLeft = aiInfo?.remaining ?? me.data?.aiQuotaRemaining;

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Tạo việc nhanh với AI"
      description="Dán nội dung sếp giao → AI tóm tắt → chỉnh sửa, chọn người giao, đặt deadline → Lưu."
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button onClick={save} loading={createTask.isPending} disabled={!form.title.trim()}>
            Lưu công việc
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: raw content */}
        <div className="space-y-4">
          <Field label="Nội dung được giao" htmlFor="rawContent" hint="Email, tin nhắn Zalo, ghi chú cuộc họp…">
            <Textarea
              id="rawContent"
              value={form.rawContent}
              onChange={(e) => set("rawContent", e.target.value)}
              placeholder={"Ví dụ:\nEm ơi, chuẩn bị giúp chị báo cáo doanh thu Q3 trước thứ 6 nhé.\n- Tổng hợp số liệu từng chi nhánh\n- So sánh với Q2\n- Làm slide 5 trang"}
              className="min-h-64 font-mono text-[13px]"
            />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Nguồn" htmlFor="source" className="w-40">
              <Select id="source" value={form.source} onChange={(e) => set("source", e.target.value as TaskSource)}>
                {(Object.keys(SOURCE_LABEL) as TaskSource[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              onClick={runAi}
              loading={summarize.isPending}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500"
            >
              {!summarize.isPending && <Wand2 className="h-4 w-4" />}
              {summarize.isPending ? "AI đang tóm tắt…" : "AI Tóm tắt"}
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Mỗi lần tóm tắt dùng 1 lượt AI{quotaLeft !== undefined && <> · còn {quotaLeft} lượt</>}
          </p>
          {aiInfo?.isMock && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <Info className="h-4 w-4 shrink-0" />
              Đây là tóm tắt mẫu vì Backend chưa cấu hình GEMINI_API_KEY.
            </div>
          )}
        </div>

        {/* Right: editable result */}
        <div className="space-y-4">
          <Field label="Tiêu đề" htmlFor="title" required>
            <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Việc cần làm…" maxLength={200} />
          </Field>
          <Field label="Tóm tắt" htmlFor="aiSummary">
            <Textarea id="aiSummary" value={form.aiSummary} onChange={(e) => set("aiSummary", e.target.value)} className="min-h-20" />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Checklist ({checklist.length} bước)</p>
            <ul className="space-y-1.5">
              {checklist.map((item, idx) => (
                <li key={item.key} className="group flex items-center gap-2">
                  <span className="w-5 shrink-0 text-xs text-slate-400">{idx + 1}.</span>
                  <Input
                    value={item.text}
                    onChange={(e) =>
                      setChecklist((c) => c.map((x) => (x.key === item.key ? { ...x, text: e.target.value } : x)))
                    }
                    className="h-9"
                    aria-label={`Bước ${idx + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setChecklist((c) => c.filter((x) => x.key !== item.key))}
                    aria-label="Xóa bước"
                    className="hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={onStepKey} placeholder="Thêm bước mới…" className="h-9" />
              <Button variant="secondary" size="sm" className="h-9" onClick={addStep} disabled={!newStep.trim()}>
                <Plus className="h-4 w-4" /> Thêm
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Người giao việc"
              htmlFor="assignedBy"
              hint={
                colleagues.data?.length === 0 ? (
                  <>
                    Danh bạ trống —{" "}
                    <Link href="/colleagues" className="text-indigo-600 hover:underline">
                      thêm đồng nghiệp
                    </Link>
                  </>
                ) : undefined
              }
            >
              <Select id="assignedBy" value={form.assignedBy} onChange={(e) => set("assignedBy", e.target.value)}>
                <option value="">— Không chọn —</option>
                {colleagues.data?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.position ? ` (${c.position})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mức ưu tiên" htmlFor="priority">
              <Select id="priority" value={form.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Deadline"
              htmlFor="deadline"
              className="sm:col-span-2"
              hint={
                aiInfo?.deadline ? (
                  <span className="inline-flex items-center gap-1 text-indigo-600">
                    <Sparkles className="h-3 w-3" /> AI đọc được hạn chót: {formatDateTime(aiInfo.deadline)}
                    {form.deadline !== toDateTimeLocal(aiInfo.deadline) && (
                      <button
                        type="button"
                        className="ml-1 cursor-pointer font-medium underline"
                        onClick={() => set("deadline", toDateTimeLocal(aiInfo.deadline))}
                      >
                        Dùng hạn này
                      </button>
                    )}
                  </span>
                ) : aiInfo ? (
                  "Nội dung không nhắc hạn chót — hãy tự đặt nếu cần."
                ) : undefined
              }
            >
              <Input id="deadline" type="datetime-local" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}
