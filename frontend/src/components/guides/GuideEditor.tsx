"use client";

import { ArrowDown, ArrowUp, Link2, ListChecks, Plus, Save, TriangleAlert, X } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { useColleagues } from "@/lib/queries";
import type { Guide, GuideDraft, GuideInput } from "@/lib/types";
import { cn } from "@/lib/utils";

let seq = 1;
const key = () => seq++;

interface StepRow {
  key: number;
  text: string;
  detail: string;
}
interface TipRow {
  key: number;
  text: string;
}
interface TodoRow {
  key: number;
  _id?: string;
  text: string;
  isDone: boolean;
  taskId: string | null;
}

export interface GuideForm {
  title: string;
  topic: string;
  taughtBy: string;
  colleagueId: string;
  summary: string;
  steps: StepRow[];
  tips: TipRow[];
  todos: TodoRow[];
}

export const EMPTY_GUIDE_FORM: GuideForm = {
  title: "",
  topic: "",
  taughtBy: "",
  colleagueId: "",
  summary: "",
  steps: [{ key: 0, text: "", detail: "" }],
  tips: [],
  todos: [],
};

const idOf = (v: string | { _id: string } | null | undefined) => (v ? (typeof v === "string" ? v : v._id) : null);

export function formFromGuide(g: Guide | GuideDraft): GuideForm {
  return {
    title: g.title,
    topic: g.topic,
    taughtBy: g.taughtBy,
    colleagueId: idOf(g.colleagueId) ?? "",
    summary: g.summary,
    steps: g.steps.length ? g.steps.map((s) => ({ key: key(), text: s.text, detail: s.detail })) : [{ key: key(), text: "", detail: "" }],
    tips: g.tips.map((t) => ({ key: key(), text: t })),
    todos: g.todos.map((t) => ({
      key: key(),
      _id: "_id" in t ? t._id : undefined,
      text: t.text,
      isDone: t.isDone,
      taskId: "taskId" in t ? idOf(t.taskId) : null,
    })),
  };
}

/** Form → API body (empty rows dropped). */
export function formToInput(f: GuideForm): GuideInput {
  return {
    title: f.title.trim(),
    topic: f.topic.trim(),
    taughtBy: f.taughtBy.trim(),
    colleagueId: f.colleagueId || null,
    summary: f.summary.trim(),
    steps: f.steps.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), detail: s.detail.trim() })),
    tips: f.tips.map((t) => t.text.trim()).filter(Boolean),
    todos: f.todos.filter((t) => t.text.trim()).map((t) => ({ _id: t._id, text: t.text.trim(), isDone: t.isDone, taskId: t.taskId })),
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
          {icon}
          {title}
        </h3>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Editable how-to: title, topic, teacher, ordered steps, tips and to-dos. */
export function GuideEditor({
  initial,
  topics,
  saving,
  saveLabel = "Lưu vào sổ tay",
  onSave,
  onCancel,
}: {
  initial: GuideForm;
  topics: string[];
  saving: boolean;
  saveLabel?: string;
  onSave: (input: GuideInput) => void;
  onCancel?: () => void;
}) {
  const uid = useId();
  const colleagues = useColleagues();
  const [form, setForm] = useState<GuideForm>(initial);
  const set = (patch: Partial<GuideForm>) => setForm((f) => ({ ...f, ...patch }));
  const linked = colleagues.data?.find((c) => c._id === form.colleagueId);

  function onTaughtBy(value: string) {
    // Typing a name that is exactly a contact links it; editing the text otherwise keeps no stale link.
    const match = colleagues.data?.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
    set({ taughtBy: value, colleagueId: match ? match._id : "" });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave(formToInput(form));
  }

  const updateStep = (i: number, patch: Partial<StepRow>) => set({ steps: form.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tiêu đề" htmlFor={`${uid}-title`} required className="sm:col-span-2">
          <Input
            id={`${uid}-title`}
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="VD: Cách xuất hoá đơn điện tử trên MISA"
            maxLength={200}
            required
          />
        </Field>
        <Field label="Chủ đề" htmlFor={`${uid}-topic`} hint="Gom các hướng dẫn cùng loại để dễ tìm.">
          <Input
            id={`${uid}-topic`}
            value={form.topic}
            onChange={(e) => set({ topic: e.target.value })}
            placeholder="VD: Kế toán"
            maxLength={80}
            list={`${uid}-topics`}
          />
          <datalist id={`${uid}-topics`}>
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Người hướng dẫn"
          htmlFor={`${uid}-teacher`}
          hint={
            linked ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Link2 className="h-3 w-3" /> Liên kết danh bạ: {linked.name}
                <button type="button" onClick={() => set({ colleagueId: "" })} className="cursor-pointer rounded p-0.5 hover:bg-slate-100" aria-label="Bỏ liên kết">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              "Chọn tên trong danh bạ để liên kết."
            )
          }
        >
          <Input
            id={`${uid}-teacher`}
            value={form.taughtBy}
            onChange={(e) => onTaughtBy(e.target.value)}
            placeholder="VD: anh Nam (kế toán)"
            maxLength={120}
            list={`${uid}-people`}
          />
          <datalist id={`${uid}-people`}>
            {colleagues.data?.map((c) => (
              <option key={c._id} value={c.name}>
                {c.position}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Tóm tắt" htmlFor={`${uid}-summary`} className="sm:col-span-2">
          <Textarea
            id={`${uid}-summary`}
            value={form.summary}
            onChange={(e) => set({ summary: e.target.value })}
            placeholder="Việc này để làm gì, khi nào cần làm"
            className="min-h-16"
            maxLength={3000}
          />
        </Field>
      </div>

      <Section icon={<ListChecks className="h-4 w-4 text-indigo-600" />} title="Các bước làm" hint="theo đúng thứ tự">
        <ol className="space-y-2">
          {form.steps.map((s, i) => (
            <li key={s.key} className="flex gap-2 rounded-lg border border-slate-200 p-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input value={s.text} onChange={(e) => updateStep(i, { text: e.target.value })} placeholder="Bước làm, bắt đầu bằng động từ" maxLength={1000} aria-label={`Bước ${i + 1}`} />
                <Input
                  value={s.detail}
                  onChange={(e) => updateStep(i, { detail: e.target.value })}
                  placeholder="Chi tiết (tuỳ chọn): bấm vào đâu, menu nào, file nào, giá trị mẫu…"
                  maxLength={2000}
                  className="h-9 text-xs"
                  aria-label={`Chi tiết bước ${i + 1}`}
                />
              </div>
              <div className="flex shrink-0 flex-col">
                <Button variant="ghost" size="icon" onClick={() => set({ steps: move(form.steps, i, i - 1) })} disabled={i === 0} aria-label="Lên">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => set({ steps: move(form.steps, i, i + 1) })} disabled={i === form.steps.length - 1} aria-label="Xuống">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => set({ steps: form.steps.filter((_, j) => j !== i) })} aria-label="Xoá bước">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="outline" size="sm" onClick={() => set({ steps: [...form.steps, { key: key(), text: "", detail: "" }] })}>
          <Plus className="h-4 w-4" /> Thêm bước
        </Button>
      </Section>

      <Section icon={<TriangleAlert className="h-4 w-4 text-amber-600" />} title="Lưu ý" hint="mẹo, lỗi hay gặp, điều không được làm">
        <RowList
          rows={form.tips}
          placeholder="VD: Không bấm Huỷ khi đang ký số"
          maxLength={500}
          onChange={(tips) => set({ tips })}
          addLabel="Thêm lưu ý"
        />
      </Section>

      <Section icon={<ListChecks className="h-4 w-4 text-emerald-600" />} title="Việc cần làm" hint="sau buổi hướng dẫn — có thể tạo thành công việc">
        <RowList
          rows={form.todos}
          placeholder="VD: Xin anh Nam cấp quyền tài khoản MISA"
          maxLength={500}
          onChange={(todos) => set({ todos })}
          addLabel="Thêm việc cần làm"
          make={(text) => ({ key: key(), text, isDone: false, taskId: null })}
        />
      </Section>

      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button type="submit" loading={saving} disabled={!form.title.trim()}>
          {!saving && <Save className="h-4 w-4" />} {saveLabel}
        </Button>
      </div>
    </form>
  );
}

function RowList<T extends { key: number; text: string }>({
  rows,
  placeholder,
  maxLength,
  onChange,
  addLabel,
  make = (text) => ({ key: key(), text }) as T,
}: {
  rows: T[];
  placeholder: string;
  maxLength: number;
  onChange: (rows: T[]) => void;
  addLabel: string;
  make?: (text: string) => T;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.key} className="flex gap-2">
          <Input
            value={r.text}
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            placeholder={placeholder}
            maxLength={maxLength}
            className={cn(r.text === "" && "border-dashed")}
          />
          <Button variant="ghost" size="icon" className="mt-1" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Xoá">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...rows, make("")])}>
        <Plus className="h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}
