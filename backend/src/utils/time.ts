/** Small timezone helpers built on Intl (no extra dependency). */

const WEEKDAY_VI = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: weekdays.indexOf(get('weekday')),
  };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (e.g. +420 for Asia/Ho_Chi_Minh). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/** UTC instant for a wall-clock time in `timeZone`. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60_000);
}

/** [start, end) of the local calendar day containing `date` shifted by `addDays`. */
export function zonedDayRange(date: Date, timeZone: string, addDays = 0): { start: Date; end: Date } {
  const p = zonedParts(date, timeZone);
  const start = zonedTimeToUtc(p.year, p.month, p.day + addDays, 0, 0, timeZone);
  const end = zonedTimeToUtc(p.year, p.month, p.day + addDays + 1, 0, 0, timeZone);
  return { start, end };
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** "Thứ Hai, 23/11/2026 15:10 (Asia/Ho_Chi_Minh, UTC+07:00)" — used in AI prompts. */
export function describeNow(timeZone: string, now = new Date()): string {
  const p = zonedParts(now, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${WEEKDAY_VI[p.weekday]}, ${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)} (${timeZone}, ${formatOffset(tzOffsetMinutes(now, timeZone))})`;
}

export function formatDateTimeVi(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}
