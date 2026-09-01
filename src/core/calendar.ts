const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
}

export interface StreakSummary {
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
}

function parseDate(date: string): Date {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new Error(`Invalid local date: ${date}`);
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatDate(parsed) !== date) throw new Error(`Invalid local date: ${date}`);
  return parsed;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number): string {
  const value = parseDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDate(value);
}

export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Month grid requires a valid year and month.");
  }
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayIndex = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - mondayIndex);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return {
      date: formatDate(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month - 1,
    };
  });
}

export function heatLevel(value: number, allValues: readonly number[]): 0 | 1 | 2 | 3 | 4 {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  const nonZero = allValues
    .map((candidate) => Math.abs(candidate))
    .filter((candidate) => Number.isFinite(candidate) && candidate > 0)
    .sort((left, right) => left - right);
  if (nonZero.length === 0) return 0;
  const rank = nonZero.filter((candidate) => candidate <= magnitude).length;
  const percentile = (rank || 1) / nonZero.length;
  return Math.max(1, Math.min(4, Math.ceil(percentile * 4))) as 1 | 2 | 3 | 4;
}

export function listDateRange(start: string, end: string): string[] {
  parseDate(start);
  parseDate(end);
  if (start > end) return [];
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    if (dates.length > 50_000) throw new Error("Date range is unexpectedly large.");
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function summarizeStreaks(values: ReadonlyMap<string, number>, today: string): StreakSummary {
  parseDate(today);
  const active = [...values.entries()]
    .filter(([date, value]) => date <= today && Number.isFinite(value) && value > 0)
    .map(([date]) => date)
    .sort();
  const activeSet = new Set(active);
  let currentStreak = 0;
  let cursor = today;
  while (activeSet.has(cursor)) {
    currentStreak += 1;
    cursor = addDays(cursor, -1);
  }

  let longestStreak = 0;
  let running = 0;
  let previous = "";
  for (const date of active) {
    running = previous && addDays(previous, 1) === date ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    previous = date;
  }

  return { activeDays: active.length, currentStreak, longestStreak };
}
