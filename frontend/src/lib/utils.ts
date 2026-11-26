import { clsx, type ClassValue } from "clsx";
import type { TaskPriority, TaskSource, TaskStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  IN_PROGRESS: "Đang làm",
  COMPLETED: "Hoàn thành",
  INCOMPLETE: "Chưa hoàn thành",
};

export const SOURCE_LABEL: Record<TaskSource, string> = {
  MANUAL: "Thủ công",
  GMAIL: "Gmail",
  ZALO: "Zalo",
  TELEGRAM: "Telegram",
  MEETING: "Cuộc họp",
  TEAM: "Nhóm",
  GUIDE: "Sổ tay",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
};

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-sky-50 text-sky-700",
  HIGH: "bg-amber-50 text-amber-700",
  URGENT: "bg-rose-50 text-rose-700",
};

export const STATUS_STYLE: Record<TaskStatus, string> = {
  IN_PROGRESS: "bg-indigo-50 text-indigo-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  INCOMPLETE: "bg-orange-50 text-orange-700",
};

export const SOURCE_STYLE: Record<TaskSource, string> = {
  MANUAL: "bg-slate-100 text-slate-600",
  GMAIL: "bg-red-50 text-red-600",
  ZALO: "bg-blue-50 text-blue-600",
  TELEGRAM: "bg-sky-50 text-sky-600",
  MEETING: "bg-violet-50 text-violet-600",
  TEAM: "bg-emerald-50 text-emerald-700",
  GUIDE: "bg-amber-50 text-amber-700",
};

const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}

export function formatDate(iso: string | null | undefined) {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

/** "còn 2 ngày", "quá hạn 3 giờ"… */
export function relativeDeadline(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const span = minutes < 60 ? `${Math.max(1, minutes)} phút` : hours < 24 ? `${hours} giờ` : `${days} ngày`;
  return { overdue: diff < 0, label: diff < 0 ? `Quá hạn ${span}` : `Còn ${span}` };
}

/** Value for <input type="datetime-local"> from an ISO string. */
export function toDateTimeLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO string (or null) from a datetime-local value. */
export function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

/** Zalo deep link: https://zalo.me/<phone>, normalising +84 → 0. */
export function zaloLink(phone: string | null | undefined) {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits.length >= 8 ? `https://zalo.me/${digits}` : null;
}

export function mailtoLink(email: string | null | undefined, subject?: string) {
  if (!email) return null;
  return `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  const first = parts.length > 1 ? parts[0] : "";
  return ((first?.[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?";
}

/** 5.2 → "5,2 giờ"; 50 → "2,1 ngày" */
export function formatDuration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
  return hours < 48 ? `${nf.format(hours)} giờ` : `${nf.format(hours / 24)} ngày`;
}
