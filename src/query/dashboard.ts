import type { BarRange, CountMode } from "../settings/model";

export interface ActivityRow {
  localDate: string;
  fileId: string;
  /** Path recorded at the time of the event; it is never replaced by a later rename. */
  path: string;
  /** Current FileIndex path for display only; project matching still uses `path`. */
  displayPath?: string;
  manual: number;
  increment: number;
  deletion: number;
  net: number;
  manualNet: number;
}

export interface CurrentFileTotal {
  fileId: string;
  path: string;
  creative: number;
  bodyCharacters: number;
}

export interface DailyActivity {
  localDate: string;
  manual: number;
  increment: number;
  deletion: number;
  net: number;
  manualNet: number;
  files: ActivityRow[];
}

export interface DashboardSnapshot {
  currentTotal: number;
  today: DailyActivity;
  daily: DailyActivity[];
  byDate: ReadonlyMap<string, DailyActivity>;
}

export interface DashboardQuery {
  rows: readonly ActivityRow[];
  currentTotals: readonly CurrentFileTotal[];
  today: string;
  countMode: CountMode;
}

function emptyDay(localDate: string): DailyActivity {
  return { localDate, manual: 0, increment: 0, deletion: 0, net: 0, manualNet: 0, files: [] };
}

export function buildDashboardSnapshot(query: DashboardQuery): DashboardSnapshot {
  const byDate = new Map<string, DailyActivity>();
  for (const row of query.rows) {
    const day = byDate.get(row.localDate) ?? emptyDay(row.localDate);
    day.manual += row.manual;
    day.increment += row.increment;
    day.deletion += row.deletion;
    day.net += row.net;
    day.manualNet += row.manualNet;
    day.files.push({ ...row });
    byDate.set(row.localDate, day);
  }
  for (const day of byDate.values()) {
    day.files.sort((left, right) => right.increment - left.increment || left.path.localeCompare(right.path));
  }
  const daily = [...byDate.values()].sort((left, right) => left.localDate.localeCompare(right.localDate));
  const currentTotal = query.currentTotals.reduce(
    (sum, file) => sum + (query.countMode === "creative" ? file.creative : file.bodyCharacters),
    0,
  );

  return {
    currentTotal,
    today: byDate.get(query.today) ?? emptyDay(query.today),
    daily,
    byDate,
  };
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid local date: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatLocalDate(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function shifted(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function dateRangeForBars(range: BarRange, anchor: string): [string, string] {
  const date = parseLocalDate(anchor);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (range === "week") {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const start = shifted(date, -mondayOffset);
    return [formatLocalDate(start), formatLocalDate(shifted(start, 6))];
  }
  if (range === "month") {
    return [
      formatLocalDate(new Date(Date.UTC(year, month, 1))),
      formatLocalDate(new Date(Date.UTC(year, month + 1, 0))),
    ];
  }
  if (range === "30-days") {
    return [formatLocalDate(shifted(date, -29)), formatLocalDate(date)];
  }
  return [`${year}-01-01`, `${year}-12-31`];
}
