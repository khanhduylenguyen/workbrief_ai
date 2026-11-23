"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiGet, apiSend } from "./api";
import { authStorage } from "./auth-storage";
import type {
  AdminUser,
  AiSummary,
  Colleague,
  GmailSyncResult,
  IntegrationOverview,
  Paginated,
  Task,
  TaskPriority,
  TaskSource,
  TaskStats,
  TaskStatus,
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
