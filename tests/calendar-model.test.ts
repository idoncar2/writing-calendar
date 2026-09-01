import { describe, expect, it } from "vitest";

import {
  buildMonthGrid,
  heatLevel,
  listDateRange,
  summarizeStreaks,
} from "../src/core/calendar";

describe("calendar model", () => {
  it("builds a Monday-first six-week grid and marks adjacent dates", () => {
    const grid = buildMonthGrid(2026, 8);

    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ date: "2026-07-27", inMonth: false });
    expect(grid[5]).toMatchObject({ date: "2026-08-01", inMonth: true, day: 1 });
    expect(grid[41]).toMatchObject({ date: "2026-09-06", inMonth: false });
  });

  it("uses deterministic intensity levels without hiding exact values", () => {
    const positives = [0, 10, 50, 100, 500];
    expect(positives.map((value) => heatLevel(value, positives))).toEqual([0, 1, 2, 3, 4]);
    expect(heatLevel(-20, [-20, -5, 0, 10])).toBe(4);
    expect(heatLevel(20, [20, 20, 20])).toBe(4);
  });

  it("lists inclusive local dates without DST-sensitive millisecond arithmetic", () => {
    expect(listDateRange("2026-02-27", "2026-03-02")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
      "2026-03-02",
    ]);
  });

  it("calculates active, current and longest streaks", () => {
    expect(
      summarizeStreaks(
        new Map([
          ["2026-08-19", 10],
          ["2026-08-20", 20],
          ["2026-08-22", 3],
          ["2026-08-23", 4],
          ["2026-08-24", 5],
        ]),
        "2026-08-24",
      ),
    ).toEqual({ activeDays: 5, currentStreak: 3, longestStreak: 3 });
  });
});
