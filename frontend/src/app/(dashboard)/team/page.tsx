"use client";

import { AlertTriangle, Plus, Send, Trash2, Undo2, Users, Wand2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DeadlineLabel, PriorityBadge, StatusBadge } from "@/components/tasks/TaskBadges";
import { Modal } from "@/components/ui/Modal";
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Input, PageHeader, PageLoader, ProgressBar, Select, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useAiSummarize, useAssignTeamTask, useMyTeam, useRecallTeamTask, useTasks, useTeamTasks } from "@/lib/queries";
import type { MyTeam, TaskPriority, TaskStatus } from "@/lib/types";
import { cn, formatDateTime, fromDateTimeLocal, initials, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/utils";

export default function TeamPage() {
  const team = useMyTeam();
  if (team.isLoading) return <PageLoader />;
  if (team.isError) return <ErrorBox message={team.error.message} onRetry={() => team.refetch()} />;
  if (!team.data) {
    return (
      <>
        <PageHeader title="Nhóm" description="Làm việc nhóm: trưởng nhóm giao việc và theo dõi tiến độ cả đội." />
        <Card>
          <EmptyState icon={<Users className="h-6 w-6" />} title="Bạn chưa thuộc nhóm nào" description="Nhờ quản trị viên tạo nhóm và thêm bạn vào (trang Quản trị → Nhóm)." />
        </Card>
      </>
    );
  }
  return team.data.role === "LEADER" ? <LeaderView data={team.data} /> : <MemberView data={team.data} />;
}

/* ---------------------------------------------------------------- Member -- */

function MemberView({ data }: { data: MyTeam }) {
  const tasks = useTasks({ source: "TEAM", limit: 50, sortBy: "deadline", sortOrder: "asc" });
  return (
    <>
      <PageHeader title={`Nhóm ${data.team.name}`} description={`Trưởng nhóm: ${data.leader?.fullName ?? "—"} · ${data.members.length} thành viên`} />
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Thành viên</h2>
          <MemberList members={data.members} />
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Việc trưởng nhóm giao cho bạn</h2>
            <Link href="/tasks" className="text-xs font-medium text-indigo-600 hover:underline">
              Mở trang Công việc
            </Link>
          </div>
          {tasks.isLoading ? (
            <PageLoader />
          ) : !tasks.data?.items.length ? (
            <p className="py-6 text-center text-sm text-slate-500">Chưa có việc nào được giao.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tasks.data.items.map((t) => (
                <li key={t._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                    <DeadlineLabel deadline={t.deadline} active={t.status === "IN_PROGRESS"} />
                  </div>
                  <div className="flex gap-1.5">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Cập nhật checklist và chốt Hoàn thành / Chưa hoàn thành ở trang Công việc — trưởng nhóm sẽ thấy ngay.</p>
        </Card>
      </div>
    </>
  );
}

function MemberList({ members }: { members: MyTeam["members"] }) {
  return (
    <ul className="space-y-2.5">
      {members.map((m) => (
        <li key={m._id} className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">{initials(m.fullName)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {m.fullName} {m.isLeader && <Badge className="ml-1 bg-emerald-50 text-emerald-700">Trưởng nhóm</Badge>}
            </p>
            <p className="truncate text-xs text-slate-500">{m.email}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- Leader -- */

function LeaderView({ data }: { data: MyTeam }) {
  const toast = useToast();
  const [memberFilter, setMemberFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [assignFor, setAssignFor] = useState<string[] | null>(null);
  const tasks = useTeamTasks({ ...(memberFilter && { memberId: memberFilter }), ...(statusFilter && { status: statusFilter }) });
  const recall = useRecallTeamTask();
  const stats = data.memberStats ?? [];
  const totals = stats.reduce((a, s) => ({ open: a.open + s.open, overdue: a.overdue + s.overdue, completed: a.completed + s.completed }), { open: 0, overdue: 0, completed: 0 });

  async function onRecall(id: string, title: string) {
    if (!window.confirm(`Thu hồi việc "${title}"? Việc sẽ bị xoá khỏi danh sách của thành viên.`)) return;
    try {
      const { message } = await recall.mutateAsync(id);
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title={`Nhóm ${data.team.name}`}
        description={`Bạn là trưởng nhóm · ${data.members.length} thành viên · ${totals.open} việc đang làm${totals.overdue ? ` · ${totals.overdue} quá hạn` : ""}`}
        actions={
          <Button onClick={() => setAssignFor([])}>
            <Plus className="h-4 w-4" /> Giao việc
          </Button>
        }
      />

      {/* Member progress */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((m) => (
          <Card key={m._id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">{initials(m.fullName)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {m.fullName} {m.isLeader && <span className="text-xs font-normal text-slate-400">(bạn)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{m.email}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAssignFor([m._id])} title={`Giao việc cho ${m.fullName}`}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <Stat label="Đang làm" value={m.open} />
              <Stat label="Xong" value={m.completed} />
              <Stat label="Quá hạn" value={m.overdue} critical={m.overdue > 0} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <ProgressBar value={m.completionRate ?? 0} className="h-1.5" barClassName="bg-emerald-500" />
              <span className="w-12 shrink-0 text-right text-xs text-slate-500">{m.completionRate === null ? "—" : `${m.completionRate}%`}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">Hoạt động gần nhất: {formatDateTime(m.lastActivityAt)}</p>
          </Card>
        ))}
      </div>

      {/* Team tasks */}
      <Card className="mt-6">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Việc đã giao trong nhóm</h2>
          <div className="flex gap-2">
            <Select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="h-9 sm:w-48" aria-label="Lọc thành viên">
              <option value="">Tất cả thành viên</option>
              {data.members.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")} className="h-9 sm:w-40" aria-label="Lọc trạng thái">
              <option value="">Mọi trạng thái</option>
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {tasks.isLoading ? (
          <PageLoader />
        ) : !tasks.data?.length ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="Chưa có việc nào" description="Bấm “Giao việc” để giao cho một hoặc nhiều thành viên." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Công việc</th>
                  <th className="px-2 py-2 font-medium">Thành viên</th>
                  <th className="px-2 py-2 font-medium">Tiến độ</th>
                  <th className="px-2 py-2 font-medium">Hạn</th>
                  <th className="px-2 py-2 font-medium">Trạng thái</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tasks.data.map((t) => {
                  const done = t.checklist.filter((c) => c.isDone).length;
                  return (
                    <tr key={t._id} className="align-top">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{t.title}</p>
                        <PriorityBadge priority={t.priority} />
                        {t.status === "INCOMPLETE" && t.incompleteReason && <p className="mt-1 text-xs text-orange-700">Lý do: {t.incompleteReason}</p>}
                      </td>
                      <td className="px-2 py-2.5 text-slate-700">{t.userId.fullName}</td>
                      <td className="px-2 py-2.5">
                        {t.checklist.length ? (
                          <div className="flex w-28 items-center gap-2">
                            <ProgressBar value={(done / t.checklist.length) * 100} className="h-1.5" barClassName="bg-emerald-500" />
                            <span className="text-xs text-slate-500">
                              {done}/{t.checklist.length}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <DeadlineLabel deadline={t.deadline} active={t.status === "IN_PROGRESS"} />
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge status={t.status} />
                        {t.completedAt && <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(t.completedAt)}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => onRecall(t._id, t.title)} title="Thu hồi việc" className="hover:text-rose-600">
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {assignFor && <AssignModal key={assignFor.join(",") || "new"} data={data} initialMembers={assignFor} onClose={() => setAssignFor(null)} />}
    </>
  );
}

function Stat({ label, value, critical }: { label: string; value: number; critical?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <p className={cn("text-base font-semibold tabular-nums", critical ? "text-[#d03b3b]" : "text-slate-900")}>
        {critical && <AlertTriangle className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" />}
        {value}
      </p>
      <p className="text-slate-500">{label}</p>
    </div>
  );
}

/* ---------------------------------------------------------- Assign modal -- */

function AssignModal({ data, initialMembers, onClose }: { data: MyTeam; initialMembers: string[]; onClose: () => void }) {
  const toast = useToast();
  const assign = useAssignTeamTask();
  const summarize = useAiSummarize();
  const [members, setMembers] = useState<string[]>(initialMembers);
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [deadline, setDeadline] = useState("");

  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  async function runAi() {
    try {
      const { data: d } = await summarize.mutateAsync({ rawContent: raw, source: "TEAM" });
      setTitle(d.title);
      setSummary(d.aiSummary);
      setSteps(d.checklist.map((c) => c.text));
      setPriority(d.suggestedPriority);
      if (d.suggestedDeadline && !deadline) {
        const dt = new Date(d.suggestedDeadline);
        const pad = (n: number) => String(n).padStart(2, "0");
        setDeadline(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function submit() {
    try {
      const { message } = await assign.mutateAsync({
        memberIds: members,
        title: title.trim(),
        aiSummary: summary,
        rawContent: raw,
        checklist: steps.filter((s) => s.trim()).map((text) => ({ text: text.trim(), isDone: false })),
        priority,
        deadline: fromDateTimeLocal(deadline),
      });
      toast.success(message);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Giao việc cho thành viên"
      description="Mỗi người được chọn nhận một bản việc riêng để tự cập nhật tiến độ. Thành viên đã kết nối Telegram sẽ được báo ngay."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={submit} loading={assign.isPending} disabled={!title.trim() || members.length === 0}>
            Giao cho {members.length} người
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Giao cho</p>
          <div className="flex flex-wrap gap-2">
            {data.members.map((m) => (
              <button
                key={m._id}
                type="button"
                onClick={() => toggle(m._id)}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-sm",
                  members.includes(m._id) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {m.fullName}
                {m.isLeader && " (bạn)"}
              </button>
            ))}
          </div>
        </div>
        <Field label="Nội dung (dán yêu cầu để AI tóm tắt — tuỳ chọn)" htmlFor="as-raw">
          <div className="space-y-2">
            <Textarea id="as-raw" value={raw} onChange={(e) => setRaw(e.target.value)} className="min-h-20" placeholder="VD: Mọi người chuẩn bị số liệu quý 4 theo mẫu, gửi trước 17h thứ 6…" />
            <Button variant="outline" size="sm" onClick={runAi} loading={summarize.isPending} disabled={raw.trim().length < 10}>
              {!summarize.isPending && <Wand2 className="h-3.5 w-3.5" />} AI tóm tắt
            </Button>
          </div>
        </Field>
        <Field label="Tiêu đề" htmlFor="as-title" required>
          <Input id="as-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <Field label="Mô tả" htmlFor="as-sum">
          <Textarea id="as-sum" value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-16" />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Checklist ({steps.length})</p>
          <ul className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <Input value={s} onChange={(e) => setSteps((st) => st.map((x, j) => (j === i ? e.target.value : x)))} className="h-9" aria-label={`Bước ${i + 1}`} />
                <Button variant="ghost" size="icon" onClick={() => setSteps((st) => st.filter((_, j) => j !== i))} aria-label="Xoá bước">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newStep.trim()) {
                  e.preventDefault();
                  setSteps((st) => [...st, newStep.trim()]);
                  setNewStep("");
                }
              }}
              placeholder="Thêm bước…"
              className="h-9"
            />
            <Button variant="secondary" size="sm" className="h-9" disabled={!newStep.trim()} onClick={() => (setSteps((st) => [...st, newStep.trim()]), setNewStep(""))}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mức ưu tiên" htmlFor="as-pri">
            <Select id="as-pri" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hạn chót" htmlFor="as-dl">
            <Input id="as-dl" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
