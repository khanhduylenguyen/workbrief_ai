"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useUpdateTaskStatus } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/utils";

/** Mounted only while open (keyed by task) so the form re-initialises for every task. */
export function IncompleteModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const toast = useToast();
  const updateStatus = useUpdateTaskStatus();
  const [reason, setReason] = useState(task.incompleteReason ?? "");
  const [deadline, setDeadline] = useState(toDateTimeLocal(task.deadline));

  async function submit() {
    if (!reason.trim()) {
      toast.error("Vui lòng nhập lý do chưa hoàn thành.");
      return;
    }
    const newDeadline = fromDateTimeLocal(deadline);
    try {
      await updateStatus.mutateAsync({
        taskId: task._id,
        status: "INCOMPLETE",
        incompleteReason: reason.trim(),
        ...(newDeadline !== task.deadline && { deadline: newDeadline }),
      });
      toast.success("Đã ghi nhận công việc chưa hoàn thành.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Chốt: Chưa hoàn thành"
      description={task.title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="danger" onClick={submit} loading={updateStatus.isPending} disabled={!reason.trim()}>
            Xác nhận
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Lý do chưa hoàn thành" htmlFor="reason" required>
          <Textarea
            id="reason"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: Đang chờ phòng Kế toán gửi số liệu…"
            maxLength={1000}
          />
        </Field>
        <Field label="Dời hạn mới (tùy chọn)" htmlFor="newDeadline" hint="Để trống nếu không muốn đặt hạn.">
          <Input id="newDeadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
