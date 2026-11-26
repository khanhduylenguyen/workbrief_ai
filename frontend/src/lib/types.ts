export type UserRole = "ADMIN" | "USER";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type TaskSource = "MANUAL" | "GMAIL" | "ZALO" | "TELEGRAM" | "MEETING" | "TEAM" | "GUIDE";
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
  gmailIntegration: { isConnected: boolean; email: string | null; lastSyncedAt?: string | null };
  settings: { emailDigest: boolean; autoGmailSync: boolean };
  lastDigestAt: string | null;
  capabilities?: { mail: boolean };
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
  assignedByUser?: { _id: string; fullName: string; email: string } | null;
  teamId?: string | null;
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
  dueToday: number;
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
  /** ISO string — deadline the AI read from the content, if any. */
  suggestedDeadline: string | null;
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
    autoSync: boolean;
    autoSyncScheduled: boolean;
    taskCount: number;
    lastTaskAt: string | null;
  };
  telegram: {
    configured: boolean;
    botUsername: string | null;
    isLinked: boolean;
    username: string | null;
    firstName: string | null;
    linkedAt: string | null;
    taskCount: number;
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

export interface WeeklyReport {
  range: { start: string; end: string; label: string };
  stats: {
    completed: number;
    incomplete: number;
    created: number;
    inProgress: number;
    overdue: number;
    dueNextWeek: number;
    completionRate: number;
  };
  report: string;
  isMock: boolean;
  quota: { used: number; limit: number; remaining: number };
}

export type ReplyTone = "CONFIRM" | "PROGRESS" | "DONE" | "DELAY" | "QUESTION";
export type ReplyChannel = "EMAIL" | "ZALO";

export interface DraftReply {
  subject: string;
  body: string;
  isMock: boolean;
  quota: { used: number; limit: number; remaining: number };
}

export interface AssistantTaskRef {
  _id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  source: TaskSource;
  assignedByName: string | null;
}

export interface AssistantReply {
  answer: string;
  tasks: AssistantTaskRef[];
  isMock: boolean;
  quota: { used: number; limit: number; remaining: number };
}

export interface CalendarData {
  scheduled: Task[];
  unscheduled: Task[];
}

export interface MediaSummary extends Omit<AiSummary, "quota"> {
  extractedText: string;
  kind: "image" | "pdf" | "audio";
  quota: { used: number; limit: number; remaining: number };
}

export interface MeetingTaskDraft {
  title: string;
  aiSummary: string;
  checklist: { text: string; isDone: boolean }[];
  suggestedPriority: TaskPriority;
  suggestedDeadline: string | null;
  requestedBy: string | null;
  assignedBy: string | null;
  owner: string | null;
}

export interface MeetingResult {
  meetingTitle: string;
  summary: string;
  transcript: string;
  decisions: string[];
  tasks: MeetingTaskDraft[];
  isMock: boolean;
  quota: { used: number; limit: number; remaining: number };
}

export interface FilePayload {
  mimeType: string;
  /** base64 without data: prefix */
  data: string;
  filename?: string;
}

export interface TelegramStatus {
  configured: boolean;
  expectedUrl: string;
  botUsername?: string;
  url?: string;
  active?: boolean;
  pendingUpdates?: number;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

export interface AssignerStats {
  key: string;
  kind: "colleague" | "leader" | "none";
  name: string;
  position: string | null;
  total: number;
  completed: number;
  incomplete: number;
  open: number;
  overdueOpen: number;
  late: number;
  withDeadline: number;
  lateRate: number | null;
  avgCompletionHours: number | null;
}

export interface Analytics {
  rangeDays: number;
  from: string;
  to: string;
  truncated: boolean;
  summary: {
    created: number;
    completed: number;
    incomplete: number;
    completionRate: number | null;
    onTimeRate: number | null;
    completedWithDeadline: number;
    completedLate: number;
    avgCompletionHours: number | null;
    medianCompletionHours: number | null;
    overdueOpen: number;
  };
  byAssigner: AssignerStats[];
  byPriority: { priority: TaskPriority; total: number; completed: number; completionRate: number | null; avgCompletionHours: number | null }[];
  bySource: { source: TaskSource; total: number }[];
  weekly: { weekStart: string; label: string; created: number; completed: number }[];
  byWeekday: { weekday: number; label: string; created: number }[];
}

export interface TeamMemberStats {
  _id: string;
  fullName: string;
  email: string;
  isLeader: boolean;
  total: number;
  open: number;
  completed: number;
  incomplete: number;
  overdue: number;
  completionRate: number | null;
  lastActivityAt: string | null;
}

export interface MyTeam {
  team: { _id: string; name: string };
  role: "LEADER" | "MEMBER";
  leader: { _id: string; fullName: string; email: string } | null;
  members: { _id: string; fullName: string; email: string; isLeader: boolean }[];
  memberStats: TeamMemberStats[] | null;
}

export interface TeamTask {
  _id: string;
  userId: { _id: string; fullName: string; email: string };
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null;
  checklist: ChecklistItem[];
  completedAt: string | null;
  incompleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTeam {
  _id: string;
  name: string;
  leaderId: { _id: string; fullName: string; email: string; status: UserStatus };
  memberIds: { _id: string; fullName: string; email: string; status: UserStatus }[];
  taskCount: number;
  openTaskCount: number;
  createdAt: string;
}


/* ------------------------------------------------------- How-to guides -- */

export type GuideInputKind = "manual" | "text" | "audio" | "image" | "pdf";

export interface GuideStep {
  _id?: string;
  text: string;
  detail: string;
}

export interface GuideTaskRef {
  _id: string;
  title: string;
  status: TaskStatus;
  deadline: string | null;
}

export interface GuideTodo {
  _id?: string;
  text: string;
  isDone: boolean;
  /** Populated on the detail endpoint; a plain id elsewhere. */
  taskId: string | GuideTaskRef | null;
}

export interface Guide {
  _id: string;
  title: string;
  topic: string;
  taughtBy: string;
  colleagueId: string | Pick<Colleague, "_id" | "name" | "position"> | null;
  summary: string;
  steps: GuideStep[];
  tips: string[];
  todos: GuideTodo[];
  /** Not included in list responses. */
  rawNote?: string;
  inputKind: GuideInputKind;
  isMock: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuideList extends Paginated<Guide> {
  topics: string[];
}

/** AI result (not saved yet). */
export interface GuideDraft {
  title: string;
  topic: string;
  taughtBy: string;
  colleagueId: string | null;
  summary: string;
  steps: GuideStep[];
  tips: string[];
  todos: { text: string; isDone: boolean }[];
  rawNote: string;
  inputKind: GuideInputKind;
  isMock: boolean;
}

export interface GuideInput {
  title: string;
  topic: string;
  taughtBy: string;
  colleagueId: string | null;
  summary: string;
  steps: { text: string; detail: string }[];
  tips: string[];
  todos: { _id?: string; text: string; isDone: boolean; taskId?: string | null }[];
  rawNote?: string;
  inputKind?: GuideInputKind;
  isMock?: boolean;
  pinned?: boolean;
}
