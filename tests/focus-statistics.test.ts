import { describe, expect, it } from "vitest";
import { calculateFocusStatistics } from "../src/focus/statistics";
import type { FocusSessionRecord } from "../src/focus/types";

function record(id: string, localDate: string, activeMs: number, input = 100): FocusSessionRecord {
  return {
    id,
    deviceId: "pc-a",
    localDate,
    countMode: "creative",
    startTime: `${localDate}T09:00:00.000Z`,
    endTime: `${localDate}T09:25:00.000Z`,
    plannedDurationMs: 25 * 60_000,
    inputCharacters: input,
    netCharacters: input - 20,
    activeMs,
    idleMs: 60_000,
    awayMs: 0,
    endReason: "completed",
  };
}

describe("calculateFocusStatistics", () => {
  it("summarizes today, Monday-based week, month and recent sessions", () => {
    const records = [
      record("today", "2026-08-28", 10 * 60_000, 200),
      record("week", "2026-08-24", 5 * 60_000, 100),
      record("month", "2026-08-01", 30_000, 50),
      record("old", "2026-07-31", 10 * 60_000, 999),
    ];
    const stats = calculateFocusStatistics(records, "2026-08-28", 3);

    expect(stats.today).toMatchObject({ sessionCount: 1, inputCharacters: 200, activeMs: 10 * 60_000 });
    expect(stats.week).toMatchObject({ sessionCount: 2, inputCharacters: 300 });
    expect(stats.month).toMatchObject({ sessionCount: 3, inputCharacters: 350 });
    expect(stats.today.inputSpeed).toBe(1_200);
    expect(stats.month.inputSpeed).toBe(Math.round(350 / (15.5 / 60)));
    expect(stats.recent.map((item) => item.id)).toEqual(["today", "week", "month"]);
  });

  it("does not report speed when active time is below one minute", () => {
    expect(calculateFocusStatistics([record("short", "2026-08-28", 59_999)], "2026-08-28").today.inputSpeed)
      .toBeNull();
  });
});
