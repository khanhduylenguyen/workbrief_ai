import { CalendarClock, Mail, MessageCircle, Mic, PenLine, Send, Users } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { TaskPriority, TaskSource, TaskStatus } from "@/lib/types";
import {
  cn,
  formatDateTime,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  relativeDeadline,
  SOURCE_LABEL,
  SOURCE_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
} from "@/lib/utils";

const SOURCE_ICON = { MANUAL: PenLine, GMAIL: Mail, ZALO: MessageCircle, TELEGRAM: Send, MEETING: Mic, TEAM: Users };

export function SourceBadge({ source }: { source: TaskSource }) {
  const Icon = SOURCE_ICON[source];
  return (
    <Badge className={SOURCE_STYLE[source]}>
      <Icon className="h-3 w-3" />
      {SOURCE_LABEL[source]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge className={PRIORITY_STYLE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function DeadlineLabel({ deadline, active = true }: { deadline: string | null; active?: boolean }) {
  if (!deadline) return <span className="text-xs text-slate-400">Chưa đặt hạn</span>;
  const rel = relativeDeadline(deadline);
  const overdue = active && rel?.overdue;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-medium text-rose-600" : "text-slate-500")}>
      <CalendarClock className="h-3.5 w-3.5" />
      {formatDateTime(deadline)}
      {active && rel && <span className="text-slate-400">· {rel.label}</span>}
    </span>
  );
}
