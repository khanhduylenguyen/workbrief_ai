"use client";

import { CalendarX2, ChevronLeft, ChevronRight, GripVertical, Inbox } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { TaskQuickView } from "@/components/tasks/TaskQuickView";
import { Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useCalendar, useRescheduleTask } from "@/lib/queries";
import type { Task, TaskPriority } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const DND_TYPE = "application/x-workbrief-task";

const CHIP: Record<TaskPriority, string> = {
  LOW: "border-l-slate-400 bg-slate-50 text-slate-700",
  MEDIUM: "border-l-sky-500 bg-sky-50 text-sky-900",
  HIGH: "border-l-amber-500 bg-amber-50 text-amber-900",
  URGENT: "border-l-rose-500 bg-rose-50 text-rose-900",
};

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

/** Monday on/before the 1st of the month → 6 full weeks (42 days). */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return { start, end: addDays(start, 42), days };
}

/** New deadline on `day`, keeping the task's previous local time (or 17:00 when it had none). */
function moveToDay(task: Task, day: Date): string {
  const prev = task.deadline ? new Date(task.deadline) : null;
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), prev ? prev.getHours() : 17, prev ? prev.getMinutes() : 0);
  return d.toISOString();
}

export default function CalendarPage() {
  const toast = useToast();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [today] = useState(() => new Date());
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const grid = useMemo(() => monthGrid(month), [month]);
  const calendar = useCalendar(grid.start, grid.end);
  const reschedule = useRescheduleTask();

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of calendar.data?.scheduled ?? []) {
      if (!t.deadline) continue;
      const k = dayKey(new Date(t.deadline));
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [calendar.data]);

  const allTasks = useMemo(
    () => new Map([...(calendar.data?.scheduled ?? []), ...(calendar.data?.unscheduled ?? [])].map((t) => [t._id, t])),
    [calendar.data],
  );

  async function applyDeadline(taskId: string, deadline: string | null) {
    const task = allTasks.get(taskId);
    if (!task || task.deadline === deadline) return;
    try {
      await reschedule.mutateAsync({ taskId, deadline });
      toast.success(deadline ? `Đã dời “${task.title}” sang ${formatDateTime(deadline)}.` : `Đã bỏ hạn chót của “${task.title}”.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function onDragStart(e: DragEvent, task: Task) {
    e.dataTransfer.setData(DND_TYPE, task._id);
    e.dataTransfer.effectAllowed = "move";
  }

  function dropProps(key: string, onDropTask: (taskId: string) => void) {
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DND_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOver !== key) setDragOver(key);
      },
      onDragLeave: () => setDragOver((k) => (k === key ? null : k)),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        const id = e.dataTransfer.getData(DND_TYPE);
        if (id) onDropTask(id);
      },
    };
  }

  const monthLabel = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(month);
  const agendaDays = grid.days.filter((d) => d.getMonth() === month.getMonth() && byDay.has(dayKey(d)));

  return (
    <>
      <PageHeader
        title="Lịch công việc"
        description="Xem việc theo hạn chót. Kéo thả thẻ sang ngày khác để dời hạn (giữ nguyên giờ)."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Tháng trước">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center font-semibold text-slate-900 capitalize">{monthLabel}</span>
            <Button variant="outline" size="icon" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Tháng sau">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
              Hôm nay
            </Button>
            {(calendar.isFetching || reschedule.isPending) && <Spinner className="h-4 w-4" />}
          </div>
        }
      />

      {calendar.isError && <ErrorBox message={calendar.error.message} onRetry={() => calendar.refetch()} />}

      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
        {/* Month grid (desktop) */}
        <Card className="hidden overflow-hidden md:block">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs font-medium text-slate-500">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.days.map((day) => {
              const key = dayKey(day);
              const tasks = byDay.get(key) ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = sameDay(day, today);
              const isExpanded = expanded === key;
              const visible = isExpanded ? tasks : tasks.slice(0, 3);
              return (
                <div
                  key={key}
                  {...dropProps(key, (id) => applyDeadline(id, moveToDay(allTasks.get(id)!, day)))}
                  className={cn(
                    "min-h-28 border-r border-b border-slate-100 p-1.5 transition-colors [&:nth-child(7n)]:border-r-0",
                    !inMonth && "bg-slate-50/60",
                    dragOver === key && "bg-indigo-50 ring-2 ring-indigo-300 ring-inset",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday ? "bg-indigo-600 font-semibold text-white" : inMonth ? "text-slate-700" : "text-slate-400",
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {visible.map((t) => (
                      <TaskChip key={t._id} task={t} now={today} onOpen={() => setOpenTask(t._id)} onDragStart={(e) => onDragStart(e, t)} />
                    ))}
                    {tasks.length > 3 && (
                      <button type="button" onClick={() => setExpanded(isExpanded ? null : key)} className="w-full cursor-pointer text-left text-[11px] font-medium text-indigo-600 hover:underline">
                        {isExpanded ? "Thu gọn" : `+${tasks.length - 3} việc nữa`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Agenda (mobile) */}
        <div className="space-y-3 md:hidden">
          {agendaDays.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-500">Không có việc nào có hạn trong tháng này.</Card>
          ) : (
            agendaDays.map((day) => (
              <Card key={dayKey(day)} className="p-3">
                <p className={cn("mb-2 text-sm font-semibold", sameDay(day, today) ? "text-indigo-600" : "text-slate-800")}>
                  {new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit" }).format(day)}
                  {sameDay(day, today) && " · Hôm nay"}
                </p>
                <div className="space-y-1.5">
                  {(byDay.get(dayKey(day)) ?? []).map((t) => (
                    <TaskChip key={t._id} task={t} now={today} onOpen={() => setOpenTask(t._id)} />
                  ))}
                </div>
              </Card>
            ))
          )}
          <p className="text-center text-xs text-slate-400">Chạm vào một việc để đổi hạn chót.</p>
        </div>

        {/* Unscheduled */}
        <Card
          {...dropProps("unscheduled", (id) => applyDeadline(id, null))}
          className={cn("h-fit p-4 transition-colors", dragOver === "unscheduled" && "bg-indigo-50 ring-2 ring-indigo-300")}
        >
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Inbox className="h-4 w-4 text-slate-400" /> Chưa có hạn ({calendar.data?.unscheduled.length ?? 0})
          </h2>
          <p className="mb-3 text-xs text-slate-500">Kéo vào một ngày để đặt hạn (17:00). Thả thẻ vào đây để bỏ hạn.</p>
          {calendar.data?.unscheduled.length ? (
            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
              {calendar.data.unscheduled.map((t) => (
                <TaskChip key={t._id} task={t} now={today} onOpen={() => setOpenTask(t._id)} onDragStart={(e) => onDragStart(e, t)} />
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 py-4 text-xs text-slate-400">
              <CalendarX2 className="h-4 w-4" /> Mọi việc đang làm đều đã có hạn.
            </p>
          )}
        </Card>
      </div>

      <TaskQuickView taskId={openTask} onClose={() => setOpenTask(null)} />
    </>
  );
}

function TaskChip({
  task,
  now,
  onOpen,
  onDragStart,
}: {
  task: Task;
  now: Date;
  onOpen: () => void;
  onDragStart?: (e: DragEvent) => void;
}) {
  const done = task.status === "COMPLETED";
  const overdue = task.status === "IN_PROGRESS" && !!task.deadline && new Date(task.deadline) < now;
  const draggable = !!onDragStart && !done;
  const time = task.deadline ? new Date(task.deadline).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onClick={onOpen}
      title={`${task.title}${task.deadline ? ` — ${formatDateTime(task.deadline)}` : ""}${draggable ? " (kéo để dời hạn)" : ""}`}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-1 rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight hover:shadow-sm",
        CHIP[task.priority],
        done && "border-l-emerald-500 bg-emerald-50 text-emerald-800 line-through opacity-70",
        task.status === "INCOMPLETE" && "border-l-orange-500 bg-orange-50 text-orange-900",
        overdue && "ring-1 ring-rose-400",
        draggable && "active:cursor-grabbing",
      )}
    >
      {draggable && <GripVertical className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-50" />}
      {time && <span className="shrink-0 font-semibold">{time}</span>}
      <span className="truncate">{task.title}</span>
    </button>
  );
}
