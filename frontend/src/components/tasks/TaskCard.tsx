"use client";

import { Check, ChevronDown, CircleCheck, CircleX, RotateCcw, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { ContactButtons } from "@/components/ContactButtons";
import { Button, Card, ProgressBar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useDeleteTask, useToggleChecklist, useUpdateTaskStatus } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { DeadlineLabel, PriorityBadge, SourceBadge, StatusBadge } from "./TaskBadges";

export function TaskCard({ task, onMarkIncomplete }: { task: Task; onMarkIncomplete: (task: Task) => void }) {
  const toast = useToast();
  const toggle = useToggleChecklist();
  const updateStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();
  const [showRaw, setShowRaw] = useState(false);
  // Optimistic checkbox state while the request is in flight.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const items = task.checklist.map((c) => ({ ...c, isDone: pending[c._id] ?? c.isDone }));
  const doneCount = items.filter((c) => c.isDone).length;
  const isOpen = task.status === "IN_PROGRESS";

  async function toggleItem(itemId: string, isDone: boolean) {
    setPending((p) => ({ ...p, [itemId]: isDone }));
    try {
      await toggle.mutateAsync({ taskId: task._id, itemId, isDone });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[itemId];
        return next;
      });
    }
  }

  async function setStatus(status: "COMPLETED" | "IN_PROGRESS") {
    try {
      const { message } = await updateStatus.mutateAsync({ taskId: task._id, status });
      toast.success(message);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove() {
    if (!window.confirm(`Xóa công việc "${task.title}"?`)) return;
    try {
      await deleteTask.mutateAsync(task._id);
      toast.success("Đã xóa công việc.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card className={cn("flex flex-col p-5 transition-shadow hover:shadow-md", !isOpen && "bg-slate-50/60")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <SourceBadge source={task.source} />
          </div>
          <h3 className={cn("font-semibold text-slate-900", task.status === "COMPLETED" && "text-slate-500 line-through")}>
            {task.title}
          </h3>
        </div>
        <Button variant="ghost" size="icon" onClick={remove} loading={deleteTask.isPending} aria-label="Xóa công việc" className="hover:text-rose-600">
          {!deleteTask.isPending && <Trash2 className="h-4 w-4" />}
        </Button>
      </div>

      <div className="mt-2">
        <DeadlineLabel deadline={task.deadline} active={isOpen} />
      </div>

      {task.aiSummary && <p className="mt-3 text-sm leading-relaxed text-slate-600">{task.aiSummary}</p>}

      {task.status === "INCOMPLETE" && task.incompleteReason && (
        <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          <span className="font-semibold">Lý do chưa hoàn thành:</span> {task.incompleteReason}
        </div>
      )}
      {task.status === "COMPLETED" && task.completedAt && (
        <p className="mt-3 text-xs text-emerald-700">Hoàn thành lúc {formatDateTime(task.completedAt)}</p>
      )}

      {/* Checklist */}
      {items.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-3">
            <ProgressBar value={(doneCount / items.length) * 100} className="h-1.5" barClassName="bg-emerald-500" />
            <span className="shrink-0 text-xs text-slate-500">
              {doneCount}/{items.length}
            </span>
          </div>
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item._id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={item.isDone}
                    onChange={(e) => toggleItem(item._id, e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      "peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500",
                      item.isDone ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white",
                    )}
                  >
                    {item.isDone && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className={cn("text-sm", item.isDone ? "text-slate-400 line-through" : "text-slate-700")}>{item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.rawContent && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowRaw((s) => !s)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showRaw && "rotate-180")} />
            {showRaw ? "Ẩn nội dung gốc" : "Xem nội dung gốc"}
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 font-sans text-xs whitespace-pre-wrap text-slate-600">
              {task.rawContent}
            </pre>
          )}
        </div>
      )}

      {/* Footer (spacer keeps it pinned to the bottom of equal-height grid cards) */}
      <div className="flex-1" />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        {task.assignedBy ? (
          <div className="flex min-w-0 items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-700">{task.assignedBy.name}</p>
              {task.assignedBy.position && <p className="truncate text-[11px] text-slate-400">{task.assignedBy.position}</p>}
            </div>
            <ContactButtons email={task.assignedBy.email} zaloPhone={task.assignedBy.zaloPhone} subject={`Re: ${task.title}`} />
          </div>
        ) : (
          <span className="text-xs text-slate-400">Chưa gán người giao</span>
        )}

        <div className="flex gap-1.5">
          {isOpen ? (
            <>
              <Button size="sm" variant="success" onClick={() => setStatus("COMPLETED")} loading={updateStatus.isPending}>
                {!updateStatus.isPending && <CircleCheck className="h-3.5 w-3.5" />}
                Hoàn thành
              </Button>
              <Button size="sm" variant="outline" onClick={() => onMarkIncomplete(task)} className="text-orange-700">
                <CircleX className="h-3.5 w-3.5" />
                Chưa hoàn thành
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setStatus("IN_PROGRESS")} loading={updateStatus.isPending}>
              {!updateStatus.isPending && <RotateCcw className="h-3.5 w-3.5" />}
              Mở lại
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
