"use client";

import { CalendarClock } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, ErrorBox, Input, PageLoader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useRescheduleTask, useTask } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { formatDateTime, fromDateTimeLocal, toDateTimeLocal } from "@/lib/utils";
import { IncompleteModal } from "./IncompleteModal";
import { TaskCard } from "./TaskCard";

/** Opens one task (by id) in a modal with the full TaskCard — used by Calendar and AI Assistant. */
export function TaskQuickView({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const task = useTask(taskId);
  const [incomplete, setIncomplete] = useState<Task | null>(null);

  return (
    <>
      <Modal open={!!taskId} onClose={onClose} size="md" title="Chi tiết công việc">
        {task.isLoading ? (
          <PageLoader />
        ) : task.isError || !task.data ? (
          <ErrorBox message={task.error?.message ?? "Không tải được công việc (có thể đã bị xoá)."} />
        ) : (
          <div className="space-y-3">
            <RescheduleRow key={`${task.data._id}-${task.data.deadline}`} task={task.data} />
            <div className="-mx-1">
              <TaskCard task={task.data} onMarkIncomplete={setIncomplete} />
            </div>
          </div>
        )}
      </Modal>
      {incomplete && <IncompleteModal key={incomplete._id} task={incomplete} onClose={() => setIncomplete(null)} />}
    </>
  );
}

function RescheduleRow({ task }: { task: Task }) {
  const toast = useToast();
  const reschedule = useRescheduleTask();
  const [value, setValue] = useState(toDateTimeLocal(task.deadline));
  const changed = value !== toDateTimeLocal(task.deadline);

  async function save() {
    try {
      const deadline = fromDateTimeLocal(value);
      await reschedule.mutateAsync({ taskId: task._id, deadline });
      toast.success(deadline ? `Đã dời hạn sang ${formatDateTime(deadline)}.` : "Đã bỏ hạn chót.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2.5">
      <CalendarClock className="h-4 w-4 text-slate-400" />
      <span className="text-sm text-slate-600">Hạn chót</span>
      <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="h-9 w-auto flex-1" aria-label="Hạn chót" />
      <Button size="sm" onClick={save} disabled={!changed} loading={reschedule.isPending}>
        Lưu
      </Button>
    </div>
  );
}
