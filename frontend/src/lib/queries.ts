"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiGet, apiSend } from "./api";
import { authStorage } from "./auth-storage";
import type {
  AdminUser,
  AiSummary,
  AssistantReply,
  CalendarData,
  DraftReply,
  FilePayload,
  MediaSummary,
  MeetingResult,
  TelegramStatus,
  ReplyChannel,
  ReplyTone,
  WeeklyReport,
  Colleague,
  GmailSyncResult,
  IntegrationOverview,
  Paginated,
  Task,
  TaskPriority,
  TaskSource,
  TaskStats,
  TaskStatus,
  Tokens,
  User,
} from "./types";

export const qk = {
  me: ["me"] as const,
  tasks: (filters?: object) => (filters ? (["tasks", filters] as const) : (["tasks"] as const)),
  stats: ["tasks", "stats"] as const,
  colleagues: ["colleagues"] as const,
  integrations: ["integrations"] as const,
  adminUsers: (filters?: object) => (filters ? (["admin-users", filters] as const) : (["admin-users"] as const)),
};

/* ----------------------------------------------------------------- Auth -- */

export function useMe(enabled = true) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => apiGet<User>("/auth/me"),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return async () => {
    try {
      await apiSend("post", "/auth/logout");
    } catch {
      // Token may already be invalid — logging out locally is enough.
    }
    authStorage.clear();
    router.replace("/login");
    qc.clear();
  };
}

export interface ProfileInput {
  fullName?: string;
  settings?: Partial<User["settings"]>;
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) => apiSend<User>("patch", "/auth/me", input),
    onSuccess: ({ data }) => {
      qc.setQueryData(qk.me, data);
      qc.invalidateQueries({ queryKey: qk.integrations });
    },
  });
}

/** Changing the password revokes old tokens; the response carries a fresh pair which we store. */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
      const res = await apiSend<{ tokens: Tokens }>("patch", "/auth/change-password", input);
      authStorage.setTokens(res.data.tokens);
      return res;
    },
  });
}

export function useSendTestReminder() {
  return useMutation({
    mutationFn: () => apiSend<{ to: string; tasks: number }>("post", "/auth/me/test-reminder"),
  });
}

/* ---------------------------------------------------------------- Tasks -- */

export interface TaskFilters {
  status?: TaskStatus;
  source?: TaskSource;
  priority?: TaskPriority;
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "deadline" | "priority";
  sortOrder?: "asc" | "desc";
}

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: qk.tasks(filters),
    queryFn: () => apiGet<Paginated<Task>>("/tasks", { params: filters }),
    placeholderData: (prev) => prev,
  });
}

export function useTaskStats() {
  return useQuery({ queryKey: qk.stats, queryFn: () => apiGet<TaskStats>("/tasks/stats") });
}

export interface TaskInput {
  title: string;
  rawContent?: string;
  aiSummary?: string;
  checklist?: { text: string; isDone: boolean }[];
  source?: TaskSource;
  assignedBy?: string | null;
  priority?: TaskPriority;
  deadline?: string | null;
}

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["tasks"] });
}

export function useAiSummarize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rawContent: string; source: TaskSource }) =>
      apiSend<AiSummary>("post", "/tasks/ai-summarize", input),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.me });
      qc.invalidateQueries({ queryKey: qk.integrations });
    },
  });
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (input: TaskInput) => apiSend<Task>("post", "/tasks", input),
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (id: string) => apiSend<{ _id: string }>("delete", `/tasks/${id}`),
    onSuccess: invalidate,
  });
}

export function useToggleChecklist() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ taskId, itemId, isDone }: { taskId: string; itemId: string; isDone: boolean }) =>
      apiSend<Task>("patch", `/tasks/${taskId}/checklist/${itemId}`, { isDone }),
    onSuccess: invalidate,
  });
}

export function useUpdateTaskStatus() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({
      taskId,
      ...body
    }: {
      taskId: string;
      status: TaskStatus;
      incompleteReason?: string;
      deadline?: string | null;
    }) => apiSend<Task>("patch", `/tasks/${taskId}/status`, body),
    onSuccess: invalidate,
  });
}

/* ----------------------------------------------------------- Colleagues -- */

export function useColleagues() {
  return useQuery({
    queryKey: qk.colleagues,
    queryFn: () => apiGet<Paginated<Colleague>>("/colleagues", { params: { limit: 200 } }),
    select: (d) => d.items,
  });
}

export type ColleagueInput = Pick<Colleague, "name" | "position" | "department" | "email" | "zaloPhone">;

export function useCreateColleague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ColleagueInput) => apiSend<Colleague>("post", "/colleagues", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.colleagues }),
  });
}

export function useDeleteColleague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<{ _id: string; detachedTasks: number }>("delete", `/colleagues/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.colleagues });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

/* --------------------------------------------------------- Integrations -- */

export function useIntegrations() {
  return useQuery({
    queryKey: qk.integrations,
    queryFn: () => apiGet<IntegrationOverview>("/integrations/overview"),
  });
}

export function useRegenerateWebhookKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<{ webhookApiKey: string; webhookUrl: string }>("post", "/integrations/zalo/regenerate-key"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.integrations }),
  });
}

/** Asks the backend for the Google consent URL, then sends the browser there. */
export function useGmailConnect() {
  return useMutation({
    mutationFn: async () => {
      const url = await apiGet<{ url: string }>("/integrations/gmail/connect");
      window.location.assign(url.url);
    },
  });
}

export function useGmailDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<null>("post", "/integrations/gmail/disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.integrations });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useGmailSync() {
  const qc = useQueryClient();
  return useMutation({
    // Each new email costs one AI call, so allow plenty of time.
    mutationFn: () => apiSend<GmailSyncResult>("post", "/integrations/gmail/sync", undefined, { timeout: 180_000 }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.integrations });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/** Simulates the Zalo extension: calls the webhook with x-webhook-key instead of the JWT. */
export function useSimulateZalo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      webhookApiKey,
      ...body
    }: {
      webhookApiKey: string;
      message: string;
      senderName?: string;
      senderPhone?: string;
      groupName?: string;
    }) =>
      apiSend<{ task: Task; isMock: boolean }>("post", "/integrations/zalo/webhook", body, {
        headers: { "x-webhook-key": webhookApiKey },
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.integrations });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

/* ---------------------------------------------------------------- Admin -- */

export interface AdminUserFilters {
  search?: string;
  status?: "ACTIVE" | "SUSPENDED";
  page?: number;
  limit?: number;
}

export function useAdminUsers(filters: AdminUserFilters) {
  return useQuery({
    queryKey: qk.adminUsers(filters),
    queryFn: () => apiGet<Paginated<AdminUser>>("/admin/users", { params: filters }),
    placeholderData: (prev) => prev,
  });
}

function useAdminMutation<TVars>(fn: (vars: TVars) => Promise<{ data: AdminUser; message: string }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminUsers() });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useCreateTrialUser() {
  return useAdminMutation(
    (input: { fullName: string; email: string; password: string; trialDays: number; aiQuotaLimit: number }) =>
      apiSend<AdminUser>("post", "/admin/users", input),
  );
}

export function useExtendTrial() {
  return useAdminMutation(({ id, days }: { id: string; days: number }) =>
    apiSend<AdminUser>("patch", `/admin/users/${id}/extend-trial`, { days }),
  );
}

export function useResetQuota() {
  return useAdminMutation(({ id }: { id: string }) => apiSend<AdminUser>("patch", `/admin/users/${id}/reset-quota`, {}));
}

export function useSetUserStatus() {
  return useAdminMutation(({ id, status }: { id: string; status: "ACTIVE" | "SUSPENDED" }) =>
    apiSend<AdminUser>("patch", `/admin/users/${id}/status`, { status }),
  );
}

/* ------------------------------------------------------- AI: reports etc -- */

export function useWeeklyReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weekOffset: number) =>
      apiSend<WeeklyReport>("post", "/ai/weekly-report", { weekOffset }, { timeout: 120_000 }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useDraftReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...body }: { taskId: string; tone: ReplyTone; channel: ReplyChannel; note?: string }) =>
      apiSend<DraftReply>("post", `/tasks/${taskId}/draft-reply`, body, { timeout: 120_000 }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useAssistant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { question: string; history: { role: "user" | "assistant"; content: string }[] }) =>
      apiSend<AssistantReply>("post", "/ai/assistant", body, { timeout: 120_000 }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

/* ------------------------------------------------------------- Calendar -- */

export function useCalendar(from: Date, to: Date) {
  return useQuery({
    queryKey: ["tasks", "calendar", from.toISOString(), to.toISOString()],
    queryFn: () => apiGet<CalendarData>("/tasks/calendar", { params: { from: from.toISOString(), to: to.toISOString() } }),
    placeholderData: (prev) => prev,
  });
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: ["tasks", "detail", taskId],
    queryFn: () => apiGet<Task>(`/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useRescheduleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, deadline }: { taskId: string; deadline: string | null }) =>
      apiSend<Task>("patch", `/tasks/${taskId}`, { deadline }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

/* ---------------------------------------------- AI: files, meetings, bulk -- */

export function useSummarizeFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { file: FilePayload; source?: TaskSource; note?: string }) =>
      apiSend<MediaSummary>("post", "/tasks/ai-summarize-file", body, { timeout: 180_000 }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useMeetingExtract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { file?: FilePayload; text?: string; note?: string }) =>
      apiSend<MeetingResult>("post", "/ai/meeting", body, { timeout: 240_000 }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useBulkCreateTasks() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: (tasks: TaskInput[]) => apiSend<{ items: Task[]; count: number }>("post", "/tasks/bulk", { tasks }),
    onSuccess: invalidate,
  });
}

/* ------------------------------------------------------------- Telegram -- */

export function useTelegramLink() {
  return useMutation({
    mutationFn: () => apiSend<{ deepLink: string; botUsername: string; expiresAt: string }>("post", "/integrations/telegram/link"),
  });
}

export function useTelegramUnlink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<null>("post", "/integrations/telegram/unlink"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.integrations }),
  });
}

export function useTelegramAdminStatus(enabled = true) {
  return useQuery({
    queryKey: ["admin", "telegram"],
    queryFn: () => apiGet<TelegramStatus>("/admin/telegram"),
    enabled,
    retry: false,
  });
}

export function useTelegramSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<TelegramStatus>("post", "/admin/telegram/setup"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "telegram"] }),
  });
}
