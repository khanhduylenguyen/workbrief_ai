"use client";

import { ChevronLeft, ChevronRight, ClipboardList, Search, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { GmailSyncButton } from "@/components/GmailSyncButton";
import { AiTaskModal } from "@/components/tasks/AiTaskModal";
import { IncompleteModal } from "@/components/tasks/IncompleteModal";
import { TaskCard } from "@/components/tasks/TaskCard";
import { Button, EmptyState, ErrorBox, Input, PageHeader, PageLoader, Select } from "@/components/ui/primitives";
import { useTaskStats, useTasks, type TaskFilters } from "@/lib/queries";
import type { Task, TaskSource, TaskStatus } from "@/lib/types";
import { cn, SOURCE_LABEL, STATUS_LABEL } from "@/lib/utils";

const STATUS_TABS: { value: TaskStatus | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "IN_PROGRESS", label: STATUS_LABEL.IN_PROGRESS },
  { value: "COMPLETED", label: STATUS_LABEL.COMPLETED },
  { value: "INCOMPLETE", label: STATUS_LABEL.INCOMPLETE },
];

const PAGE_SIZE = 12;

export default function TasksPage() {
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [source, setSource] = useState<TaskSource | "">("");
  const [sort, setSort] = useState<"createdAt:desc" | "deadline:asc" | "priority:desc">("createdAt:desc");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [aiOpen, setAiOpen] = useState(false);
  const [incompleteTask, setIncompleteTask] = useState<Task | null>(null);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const [sortBy, sortOrder] = sort.split(":") as [TaskFilters["sortBy"], TaskFilters["sortOrder"]];
  const filters: TaskFilters = {
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    ...(status && { status }),
    ...(source && { source }),
    ...(q && { q }),
  };
  const tasks = useTasks(filters);
  const stats = useTaskStats();

  const counts: Record<string, number | undefined> = {
    "": stats.data?.total,
    IN_PROGRESS: stats.data?.inProgress,
    COMPLETED: stats.data?.completed,
    INCOMPLETE: stats.data?.incomplete,
  };

  const pagination = tasks.data?.pagination;
  const hasFilters = !!(status || source || q);

  return (
    <>
      <PageHeader
        title="Quản lý công việc"
        description="Theo dõi, tick checklist và chốt trạng thái các việc được giao."
        actions={
          <>
            <GmailSyncButton />
            <Button onClick={() => setAiOpen(true)} className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500">
              <Wand2 className="h-4 w-4" />
              Tạo việc nhanh với AI
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-5 space-y-3">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                status === tab.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {tab.label}
              {counts[tab.value] !== undefined && (
                <span className={cn("rounded-full px-1.5 text-xs", status === tab.value ? "bg-indigo-50 text-indigo-700" : "bg-slate-200 text-slate-600")}>
                  {counts[tab.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tiêu đề, tóm tắt, nội dung…" className="pl-9" aria-label="Tìm kiếm" />
          </div>
          <Select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as TaskSource | "");
              setPage(1);
            }}
            className="sm:w-44"
            aria-label="Lọc theo nguồn"
          >
            <option value="">Tất cả nguồn</option>
            {(Object.keys(SOURCE_LABEL) as TaskSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="sm:w-48" aria-label="Sắp xếp">
            <option value="createdAt:desc">Mới nhất</option>
            <option value="deadline:asc">Deadline gần nhất</option>
            <option value="priority:desc">Ưu tiên cao nhất</option>
          </Select>
        </div>
      </div>

      {/* List */}
      {tasks.isLoading ? (
        <PageLoader />
      ) : tasks.isError ? (
        <ErrorBox message={tasks.error.message} onRetry={() => tasks.refetch()} />
      ) : !tasks.data?.items.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white">
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title={hasFilters ? "Không tìm thấy công việc phù hợp" : "Chưa có công việc nào"}
            description={hasFilters ? "Thử đổi bộ lọc hoặc từ khóa tìm kiếm." : "Dán nội dung sếp giao để AI tóm tắt thành việc cần làm."}
            action={
              !hasFilters && (
                <Button onClick={() => setAiOpen(true)}>
                  <Wand2 className="h-4 w-4" /> Tạo việc nhanh với AI
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-3", tasks.isFetching && "opacity-70 transition-opacity")}>
            {tasks.data.items.map((t) => (
              <TaskCard key={t._id} task={t} onMarkIncomplete={setIncompleteTask} />
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
              <span>
                Trang {pagination.page}/{pagination.totalPages} · {pagination.total} công việc
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Trước
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Sau <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AiTaskModal open={aiOpen} onClose={() => setAiOpen(false)} />
      {incompleteTask && <IncompleteModal key={incompleteTask._id} task={incompleteTask} onClose={() => setIncompleteTask(null)} />}
    </>
  );
}
