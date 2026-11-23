export type UserRole = "ADMIN" | "USER";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type TaskSource = "MANUAL" | "GMAIL" | "ZALO";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "IN_PROGRESS" | "COMPLETED" | "INCOMPLETE";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface User {
  _id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  trialExpiresAt: string | null;
  aiQuotaLimit: number;
  aiQuotaUsed: number;
  aiQuotaRemaining: number;
  trialDaysLeft: number | null;
  gmailIntegration: { isConnected: boolean; email: string | null };
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUser extends User {
  trialExpired: boolean;
  taskCount: number;
  taskStats: { total: number; inProgress: number; completed: number; incomplete: number };
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessTokenExpiresIn: string;
}

export interface Colleague {
  _id: string;
  name: string;
  position: string;
  department: string;
  email: string;
  zaloPhone: string;
  taskCount?: number;
  createdAt: string;
}

export type ColleagueRef = Pick<Colleague, "_id" | "name" | "position" | "department" | "email" | "zaloPhone">;

export interface ChecklistItem {
  _id: string;
  text: string;
  isDone: boolean;
}

export interface Task {
  _id: string;
  userId: string;
  title: string;
  rawContent: string;
  aiSummary: string;
  checklist: ChecklistItem[];
  source: TaskSource;
  assignedBy: ColleagueRef | null;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: string | null;
  completedAt: string | null;
  incompleteReason: string | null;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskStats {
  total: number;
  inProgress: number;
  completed: number;
  incomplete: number;
  overdue: number;
  completionRate: number;
  bySource: Record<TaskSource, number>;
  byPriority: Record<TaskPriority, number>;
  upcomingDays: number;
  upcoming: Task[];
  aiQuota: { used: number; limit: number; remaining: number };
}

export interface AiSummary {
  title: string;
  aiSummary: string;
  checklist: { text: string; isDone: boolean }[];
  suggestedPriority: TaskPriority;
  isMock: boolean;
  quota: { used: number; limit: number; remaining: number };
}

export interface GmailSyncResult {
  query: string;
  scanned: number;
  created: number;
  skippedExisting: number;
  failed: number;
  quotaExhausted: boolean;
  tasks: { _id: string; title: string; from: string; priority: TaskPriority }[];
  errors: string[];
}

export interface IntegrationOverview {
  gmail: {
    configured: boolean;
    isConnected: boolean;
    email: string | null;
    connectedAt: string | null;
    lastSyncedAt: string | null;
    syncLabel: string;
    syncNewerThanDays: number;
    syncMaxMessages: number;
    taskCount: number;
    lastTaskAt: string | null;
  };
  zalo: {
    webhookUrl: string;
    pingUrl: string;
    webhookApiKey: string;
    headerName: string;
    taskCount: number;
    lastTaskAt: string | null;
  };
  ai: {
    provider: string;
    model: string;
    configured: boolean;
    mockFallback: boolean;
    quota: { used: number; limit: number; remaining: number };
  };
  tasksBySource: Record<TaskSource, number>;
}
