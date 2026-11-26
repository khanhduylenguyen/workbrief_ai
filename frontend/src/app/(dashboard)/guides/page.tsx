"use client";

import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  ListChecks,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";
import { formFromGuide, GuideEditor } from "@/components/guides/GuideEditor";
import { TaskQuickView } from "@/components/tasks/TaskQuickView";
import { StatusBadge } from "@/components/tasks/TaskBadges";
import { Modal } from "@/components/ui/Modal";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, PageLoader, Select, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useDeleteGuide, useGuide, useGuides, useGuideTasks, useUpdateGuide } from "@/lib/queries";
import type { Guide, GuideTaskRef, GuideTodo, TaskPriority } from "@/lib/types";
import { cn, formatDate, fromDateTimeLocal, PRIORITY_LABEL } from "@/lib/utils";

export default function GuidesPage() {
  // useSearchParams (?id=) needs a Suspense boundary.
  return (
    <Suspense fallback={<PageLoader />}>
      <GuidesView />
    </Suspense>
  );
}

const NEW_LINK =
  "inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-500";

function GuidesView() {
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get("id");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const guides = useGuides({ search: deferredSearch || undefined, topic: topic || undefined });
  const select = (id: string | null) => router.replace(id ? `/guides?id=${id}` : "/guides", { scroll: false });

  const items = guides.data?.items ?? [];
  const topics = guides.data?.topics ?? [];

  return (
    <>
      <PageHeader
        title="Sổ tay hướng dẫn"
        description="Ghi lại cách làm khi được anh chị chỉ việc — các bước, lưu ý và việc cần làm — để sau này tự làm lại hoặc hỏi Trợ lý AI."
        actions={
          <Link href="/guides/new" className={NEW_LINK}>
            <Plus className="h-4 w-4" /> Ghi hướng dẫn mới
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* List */}
        <div className={cn("space-y-3", selectedId && "hidden lg:block")}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm: hoá đơn, MISA, anh Nam…" className="pl-9" aria-label="Tìm hướng dẫn" />
            {guides.isFetching && <Spinner className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />}
          </div>
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {["", ...topics].map((t) => (
                <button
                  key={t || "all"}
                  type="button"
                  onClick={() => setTopic(t)}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium",
                    topic === t ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {t || "Tất cả"}
                </button>
              ))}
            </div>
          )}

          {guides.isLoading ? (
            <PageLoader />
          ) : guides.isError ? (
            <ErrorBox message={guides.error.message} onRetry={() => guides.refetch()} />
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title={search || topic ? "Không tìm thấy hướng dẫn" : "Sổ tay còn trống"}
                description={search || topic ? "Thử từ khoá khác." : "Lần tới được anh chị chỉ việc, bấm “Ghi hướng dẫn mới” để ghi lại."}
              />
            </Card>
          ) : (
            <ul className="space-y-2">
              {items.map((g) => (
                <li key={g._id}>
                  <GuideListItem guide={g} active={g._id === selectedId} onClick={() => select(g._id)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className={cn(!selectedId && "hidden lg:block")}>
          {selectedId ? (
            <GuideDetail key={selectedId} id={selectedId} topics={topics} onClose={() => select(null)} />
          ) : (
            <Card>
              <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Chọn một hướng dẫn" description="Chọn hướng dẫn bên trái để xem các bước làm, lưu ý và việc cần làm." />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function GuideListItem({ guide: g, active, onClick }: { guide: Guide; active: boolean; onClick: () => void }) {
  const openTodos = g.todos.filter((t) => !t.isDone).length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer rounded-xl border bg-white p-3 text-left transition-colors",
        active ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <div className="flex items-start gap-2">
        {g.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" aria-label="Đã ghim" />}
        <p className="line-clamp-2 flex-1 text-sm font-semibold text-slate-900">{g.title}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {g.topic && <Badge className="bg-slate-100 text-slate-600">{g.topic}</Badge>}
        {g.taughtBy && <span>{g.taughtBy}</span>}
        <span>{g.steps.length} bước</span>
        {openTodos > 0 && <span className="font-medium text-amber-700">{openTodos} việc cần làm</span>}
        <span className="ml-auto">{formatDate(g.updatedAt)}</span>
      </div>
    </button>
  );
}

const taskRef = (t: GuideTodo): GuideTaskRef | null => (t.taskId && typeof t.taskId === "object" ? t.taskId : null);

function guideText(g: Guide): string {
  return [
    g.title,
    g.taughtBy && `Người hướng dẫn: ${g.taughtBy}`,
    g.summary,
    g.steps.length && `\nCác bước:\n${g.steps.map((s, i) => `${i + 1}. ${s.text}${s.detail ? `\n   ${s.detail}` : ""}`).join("\n")}`,
    g.tips.length && `\nLưu ý:\n${g.tips.map((t) => `- ${t}`).join("\n")}`,
    g.todos.length && `\nViệc cần làm:\n${g.todos.map((t) => `[${t.isDone ? "x" : " "}] ${t.text}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function GuideDetail({ id, topics, onClose }: { id: string; topics: string[]; onClose: () => void }) {
  const toast = useToast();
  const guide = useGuide(id);
  const update = useUpdateGuide();
  const del = useDeleteGuide();
  const [editing, setEditing] = useState(false);
  const [practice, setPractice] = useState<Set<number>>(new Set());
  const [showRaw, setShowRaw] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);

  if (guide.isLoading) return <PageLoader />;
  if (guide.isError || !guide.data) return <ErrorBox message={guide.error?.message ?? "Không tìm thấy hướng dẫn"} onRetry={() => guide.refetch()} />;
  const g = guide.data;

  const back = (
    <button type="button" onClick={onClose} className="mb-3 inline-flex cursor-pointer items-center gap-1 text-sm text-slate-500 hover:text-slate-800 lg:hidden">
      <ArrowLeft className="h-4 w-4" /> Danh sách
    </button>
  );

  if (editing) {
    return (
      <Card className="p-5">
        {back}
        <GuideEditor
          initial={formFromGuide(g)}
          topics={topics}
          saving={update.isPending}
          saveLabel="Lưu thay đổi"
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            try {
              const { message } = await update.mutateAsync({ id: g._id, ...input });
              toast.success(message);
              setEditing(false);
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        />
      </Card>
    );
  }

  async function patch(input: Parameters<typeof update.mutateAsync>[0], ok?: string) {
    try {
      await update.mutateAsync(input);
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function toggleTodo(i: number) {
    const todos = g.todos.map((t, j) => ({
      _id: t._id,
      text: t.text,
      isDone: j === i ? !t.isDone : t.isDone,
      taskId: t.taskId ? (typeof t.taskId === "string" ? t.taskId : t.taskId._id) : null,
    }));
    void patch({ id: g._id, todos });
  }

  async function remove() {
    if (!window.confirm(`Xoá hướng dẫn "${g.title}"? Các công việc đã tạo từ hướng dẫn này vẫn được giữ.`)) return;
    try {
      await del.mutateAsync(g._id);
      toast.success("Đã xoá hướng dẫn");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const colleague = g.colleagueId && typeof g.colleagueId === "object" ? g.colleagueId : null;
  const creatable = g.todos.filter((t) => t._id && !t.taskId);

  return (
    <Card className="p-5">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">{g.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {g.topic && <Badge className="bg-indigo-50 text-indigo-700">{g.topic}</Badge>}
            {(g.taughtBy || colleague) && (
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" /> {g.taughtBy || colleague?.name}
                {colleague?.position && <span className="text-slate-400">· {colleague.position}</span>}
              </span>
            )}
            <span>Ghi ngày {formatDate(g.createdAt)}</span>
            {g.isMock && <Badge className="bg-amber-100 text-amber-800">Sắp xếp mẫu</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" onClick={() => patch({ id: g._id, pinned: !g.pinned }, g.pinned ? "Đã bỏ ghim" : "Đã ghim lên đầu")} aria-label={g.pinned ? "Bỏ ghim" : "Ghim"} title={g.pinned ? "Bỏ ghim" : "Ghim lên đầu"}>
            {g.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await navigator.clipboard.writeText(guideText(g));
              toast.success("Đã sao chép hướng dẫn");
            }}
            aria-label="Sao chép"
            title="Sao chép dạng văn bản"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Sửa" title="Sửa">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={remove} aria-label="Xoá" title="Xoá" className="hover:text-rose-600">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {g.summary && <p className="mt-3 text-sm leading-relaxed text-slate-600">{g.summary}</p>}

      {/* Steps */}
      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <ListChecks className="h-4 w-4 text-indigo-600" /> Các bước làm
          </h3>
          {practice.size > 0 && (
            <button type="button" onClick={() => setPractice(new Set())} className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">
              Làm lại từ đầu ({practice.size}/{g.steps.length})
            </button>
          )}
        </div>
        {g.steps.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có bước nào — bấm Sửa để thêm.</p>
        ) : (
          <ol className="space-y-2">
            {g.steps.map((s, i) => {
              const done = practice.has(i);
              return (
                <li key={s._id ?? i}>
                  <button
                    type="button"
                    onClick={() => setPractice((p) => {
                      const next = new Set(p);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    })}
                    className={cn(
                      "flex w-full cursor-pointer gap-3 rounded-lg border p-3 text-left transition-colors",
                      done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 hover:bg-slate-50",
                    )}
                    title="Bấm để đánh dấu khi làm theo"
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        done ? "bg-emerald-600 text-white" : "bg-indigo-50 text-indigo-700",
                      )}
                    >
                      {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-sm font-medium text-slate-900", done && "text-slate-500 line-through")}>{s.text}</span>
                      {s.detail && <span className="mt-0.5 block text-xs whitespace-pre-wrap text-slate-500">{s.detail}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        {g.steps.length > 0 && <p className="mt-1.5 text-xs text-slate-400">Mẹo: bấm vào từng bước để đánh dấu khi bạn làm theo (không lưu lại).</p>}
      </section>

      {/* Tips */}
      {g.tips.length > 0 && (
        <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <TriangleAlert className="h-4 w-4" /> Lưu ý
          </h3>
          <ul className="space-y-1 text-sm text-amber-900">
            {g.tips.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden>•</span> {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* To-dos */}
      <section className="mt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Việc cần làm
          </h3>
          {creatable.length > 0 && (
            <Button size="sm" variant="outline" disabled={selected.size === 0} onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Tạo {selected.size || ""} công việc
            </Button>
          )}
        </div>
        {g.todos.length === 0 ? (
          <p className="text-sm text-slate-500">Không có việc cần làm.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {g.todos.map((t, i) => {
              const task = taskRef(t);
              const canCreate = !!t._id && !t.taskId;
              return (
                <li key={t._id ?? i} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={t.isDone}
                    onChange={() => toggleTodo(i)}
                    className="h-4 w-4 cursor-pointer accent-emerald-600"
                    aria-label={`Đã xong: ${t.text}`}
                    disabled={update.isPending}
                  />
                  <span className={cn("min-w-0 flex-1 text-sm", t.isDone && "text-slate-400 line-through")}>{t.text}</span>
                  {task ? (
                    <button type="button" onClick={() => setOpenTask(task._id)} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-indigo-600 hover:underline">
                      Xem việc <StatusBadge status={task.status} />
                    </button>
                  ) : t.taskId ? (
                    <span className="text-xs text-slate-400">Công việc đã bị xoá</span>
                  ) : (
                    canCreate && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={selected.has(t._id!)}
                          onChange={(e) =>
                            setSelected((s) => {
                              const next = new Set(s);
                              if (e.target.checked) next.add(t._id!);
                              else next.delete(t._id!);
                              return next;
                            })
                          }
                          className="h-3.5 w-3.5 cursor-pointer accent-indigo-600"
                        />
                        Chọn tạo việc
                      </label>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {g.rawNote && (
        <div className="mt-5">
          <button type="button" onClick={() => setShowRaw((s) => !s)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showRaw && "rotate-180")} />
            {showRaw ? "Ẩn ghi chép gốc" : "Xem ghi chép gốc"}
          </button>
          {showRaw && <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-50 p-3 font-sans text-xs whitespace-pre-wrap text-slate-600">{g.rawNote}</pre>}
        </div>
      )}

      {creating && (
        <CreateTasksModal
          guide={g}
          todoIds={[...selected]}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            setSelected(new Set());
          }}
        />
      )}
      <TaskQuickView taskId={openTask} onClose={() => setOpenTask(null)} />
    </Card>
  );
}

function CreateTasksModal({ guide, todoIds, onClose, onDone }: { guide: Guide; todoIds: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const mutation = useGuideTasks();
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  const [includeSteps, setIncludeSteps] = useState(guide.steps.length > 0);

  async function submit() {
    try {
      const { message } = await mutation.mutateAsync({ id: guide._id, todoIds, priority, deadline: fromDateTimeLocal(deadline), includeSteps });
      toast.success(message);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Tạo ${todoIds.length} công việc`}
      description="Mỗi việc cần làm sẽ thành một công việc (nguồn “Sổ tay”), kèm nội dung hướng dẫn để tiện tra lại."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Tạo công việc
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <ul className="list-inside list-disc text-sm text-slate-700">
          {guide.todos
            .filter((t) => t._id && todoIds.includes(t._id))
            .map((t) => (
              <li key={t._id}>{t.text}</li>
            ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mức ưu tiên" htmlFor="gt-priority">
            <Select id="gt-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hạn chót (tuỳ chọn)" htmlFor="gt-deadline">
            <Input id="gt-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        {guide.steps.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={includeSteps} onChange={(e) => setIncludeSteps(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
            Đưa các bước hướng dẫn vào checklist của công việc
          </label>
        )}
      </div>
    </Modal>
  );
}
