import { describe, expect, it } from "vitest";

import type { DailyActivity } from "../src/query/dashboard";
import {
  buildBarSeries,
  buildHeatmapCells,
  buildMonthCells,
} from "../src/views/visual-model";

const day = (localDate: string, manual: number, net = manual): DailyActivity => ({
  localDate,
  manual,
  increment: Math.max(manual, net),
  deletion: Math.max(0, manual - net),
  net,
  manualNet: manual - Math.max(0, manual - net),
  files: [],
});

describe("visual view models", () => {
  it("gives every calendar cell an exact accessible label", () => {
    const cells = buildMonthCells({
      year: 2026,
      month: 8,
      metric: "manual",
      display: "color-only",
      daily: [day("2026-08-24", 321)],
    });
    const active = cells.find((cell) => cell.date === "2026-08-24");

    expect(active).toMatchObject({ value: 321, level: 4, visibleValue: "" });
    expect(active?.ariaLabel).toContain("2026年8月24日");
    expect(active?.ariaLabel).toContain("手动输入 321 字");
  });

  it("builds a complete rolling-year heatmap with text values available to focus", () => {
    const cells = buildHeatmapCells({
      anchor: "2026-08-24",
      range: "rolling-year",
      metric: "manual",
      daily: [day("2026-08-24", 20)],
    });

    expect(cells).toHaveLength(365);
    expect(cells[0].date).toBe("2025-08-25");
    expect(cells.at(-1)).toMatchObject({ date: "2026-08-24", value: 20 });
    expect(cells.at(-1)?.ariaLabel).toContain("20 字");
  });

  it("places negative net bars below the zero line", () => {
    const series = buildBarSeries({
      anchor: "2026-08-24",
      range: "week",
      metric: "net",
      daily: [day("2026-08-24", 5, -20), day("2026-08-25", 30, 30)],
    });

    expect(series.hasNegative).toBe(true);
    expect(series.points[0]).toMatchObject({ date: "2026-08-24", value: -20, direction: "negative" });
    expect(series.points[1]).toMatchObject({ date: "2026-08-25", value: 30, direction: "positive" });
    expect(series.points[0].magnitude).toBeCloseTo(2 / 3);
    expect(series.points[1].magnitude).toBe(1);
  });
});
