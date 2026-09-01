import type { FocusSessionRecord } from "./types";

export interface FocusSummary {
  sessionCount: number;
  inputCharacters: number;
  netCharacters: number;
  activeMs: number;
  idleMs: number;
  awayMs: number;
  inputSpeed: number | null;
}

export interface FocusStatistics {
  today: FocusSummary;
  week: FocusSummary;
  month: FocusSummary;
  recent: FocusSessionRecord[];
}

function addDays(localDate: string, delta: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return date.toISOString().slice(0, 10);
}

function mondayOf(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(localDate, -(weekday === 0 ? 6 : weekday - 1));
}

function summarize(records: readonly FocusSessionRecord[]): FocusSummary {
  const result = records.reduce<FocusSummary>((sum, record) => ({
    sessionCount: sum.sessionCount + 1,
    inputCharacters: sum.inputCharacters + record.inputCharacters,
    netCharacters: sum.netCharacters + record.netCharacters,
    activeMs: sum.activeMs + record.activeMs,
    idleMs: sum.idleMs + record.idleMs,
    awayMs: sum.awayMs + record.awayMs,
    inputSpeed: null,
  }), { sessionCount: 0, inputCharacters: 0, netCharacters: 0, activeMs: 0, idleMs: 0, awayMs: 0, inputSpeed: null });
  result.inputSpeed = result.activeMs < 60_000
    ? null
    : Math.round(result.inputCharacters / (result.activeMs / 3_600_000));
  return result;
}

export function calculateFocusStatistics(
  records: readonly FocusSessionRecord[],
  anchorLocalDate: string,
  recentLimit = 10,
): FocusStatistics {
  const weekStart = mondayOf(anchorLocalDate);
  const month = anchorLocalDate.slice(0, 7);
  return {
    today: summarize(records.filter((record) => record.localDate === anchorLocalDate)),
    week: summarize(records.filter((record) => record.localDate >= weekStart && record.localDate <= anchorLocalDate)),
    month: summarize(records.filter((record) => record.localDate.startsWith(month))),
    recent: [...records]
      .sort((left, right) => right.endTime.localeCompare(left.endTime))
      .slice(0, Math.max(0, recentLimit)),
  };
}
