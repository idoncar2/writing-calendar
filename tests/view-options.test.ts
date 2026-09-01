import { describe, expect, it } from "vitest";

import {
  BAR_RANGE_OPTIONS,
  COUNT_MODE_OPTIONS,
  HEATMAP_RANGE_OPTIONS,
  METRIC_OPTIONS,
  formatMetricValue,
} from "../src/views/options";

describe("view options", () => {
  it("exposes exactly the agreed activity metrics and no cumulative curve", () => {
    expect(METRIC_OPTIONS).toEqual([
      { value: "manual", label: "手动输入" },
      { value: "manualNet", label: "手动净增" },
      { value: "increment", label: "增量" },
      { value: "deletion", label: "删除量" },
      { value: "net", label: "净增" },
    ]);
  });

  it("exposes both count modes and the confirmed time ranges", () => {
    expect(COUNT_MODE_OPTIONS.map((option) => option.value)).toEqual(["creative", "body-characters"]);
    expect(HEATMAP_RANGE_OPTIONS.map((option) => option.value)).toEqual(["rolling-year", "calendar-year"]);
    expect(BAR_RANGE_OPTIONS.map((option) => option.value)).toEqual(["week", "month", "30-days", "year"]);
  });

  it("formats net values with an explicit sign while leaving zero neutral", () => {
    expect(formatMetricValue("net", 20)).toBe("+20");
    expect(formatMetricValue("net", -5)).toBe("-5");
    expect(formatMetricValue("net", 0)).toBe("0");
    expect(formatMetricValue("manualNet", 20)).toBe("+20");
    expect(formatMetricValue("manualNet", -5)).toBe("-5");
    expect(formatMetricValue("manual", 20)).toBe("20");
  });
});
