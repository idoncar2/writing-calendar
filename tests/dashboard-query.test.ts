import { describe, expect, it } from "vitest";

import {
  buildDashboardSnapshot,
  dateRangeForBars,
  type ActivityRow,
} from "../src/query/dashboard";

const rows: ActivityRow[] = [
  {
    localDate: "2026-08-23",
    fileId: "a",
    path: "正文/第一章.md",
    manual: 100,
    increment: 120,
    deletion: 20,
    net: 100,
    manualNet: 80,
  },
  {
    localDate: "2026-08-24",
    fileId: "a",
    path: "正文/第一章.md",
    manual: 30,
    increment: 50,
    deletion: 70,
    net: -20,
    manualNet: -40,
  },
  {
    localDate: "2026-08-24",
    fileId: "b",
    path: "正文/第二章.md",
    manual: 20,
    increment: 20,
    deletion: 0,
    net: 20,
    manualNet: 20,
  },
];

describe("dashboard query", () => {
  it("groups daily rows while retaining per-file contributions and negative net", () => {
    const snapshot = buildDashboardSnapshot({
      rows,
      currentTotals: [
        { fileId: "a", path: "正文/第一章.md", creative: 1_200, bodyCharacters: 2_000 },
        { fileId: "b", path: "正文/第二章.md", creative: 800, bodyCharacters: 1_100 },
      ],
      today: "2026-08-24",
      countMode: "creative",
    });

    expect(snapshot.currentTotal).toBe(2_000);
    expect(snapshot.today).toMatchObject({ manual: 50, increment: 70, deletion: 70, net: 0, manualNet: -20 });
    expect(snapshot.daily).toEqual([
      expect.objectContaining({ localDate: "2026-08-23", manual: 100, net: 100 }),
      expect.objectContaining({ localDate: "2026-08-24", manual: 50, net: 0 }),
    ]);
    expect(snapshot.byDate.get("2026-08-24")?.files).toEqual([
      expect.objectContaining({ path: "正文/第一章.md", increment: 50, net: -20 }),
      expect.objectContaining({ path: "正文/第二章.md", increment: 20, net: 20 }),
    ]);
  });

  it("switches current total to the compatible body-character count", () => {
    const snapshot = buildDashboardSnapshot({
      rows: [],
      currentTotals: [
        { fileId: "a", path: "正文/第一章.md", creative: 10, bodyCharacters: 18 },
      ],
      today: "2026-08-24",
      countMode: "body-characters",
    });

    expect(snapshot.currentTotal).toBe(18);
  });

  it("creates exact date ranges for all four bar presets", () => {
    expect(dateRangeForBars("week", "2026-08-24")).toEqual(["2026-08-24", "2026-08-30"]);
    expect(dateRangeForBars("month", "2026-08-24")).toEqual(["2026-08-01", "2026-08-31"]);
    expect(dateRangeForBars("30-days", "2026-08-24")).toEqual(["2026-07-26", "2026-08-24"]);
    expect(dateRangeForBars("year", "2026-08-24")).toEqual(["2026-01-01", "2026-12-31"]);
  });
});
