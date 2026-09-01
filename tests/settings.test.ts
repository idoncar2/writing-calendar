import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings/model";

describe("settings", () => {
  it("uses the confirmed first-run defaults", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      selectedProjectId: "workspace",
      selectedMetric: "manual",
      countMode: "creative",
      includePasteInManual: false,
      calendarDisplay: "color-and-number",
      colorSource: "obsidian-accent",
      heatmapRange: "rolling-year",
      barRange: "month",
      showStatusBar: false,
      dataFolder: "写作日历数据",
      sidebarSummaryMonth: true,
      sidebarSummaryToday: true,
      sidebarSummaryStreak: true,
      sidebarIntroduced: false,
      showExplorerCounts: true,
      showFolderCounts: true,
      focusEnabled: false,
      focusDisplayMode: "calendar",
      focusDurationMs: 25 * 60_000,
      restDurationMs: 5 * 60_000,
      focusIdleThresholdMs: 60_000,
      focusRecordShortSessions: false,
      goalMetric: "increment",
      goalTarget: 0,
      goalWeekTarget: 0,
      goalMonthTarget: 0,
    });
  });

  it("supports the dot-only sidebar calendar mode and per-item summary toggles", () => {
    const settings = normalizeSettings({
      calendarDisplay: "dot",
      sidebarSummaryMonth: false,
      sidebarSummaryToday: "nonsense",
    });

    expect(settings.calendarDisplay).toBe("dot");
    expect(settings.sidebarSummaryMonth).toBe(false);
    expect(settings.sidebarSummaryToday).toBe(true);
    expect(settings.sidebarSummaryStreak).toBe(true);
  });

  it("retires the former layout-fallback workspace folders setting", () => {
    const settings = normalizeSettings({
      workspaceFolders: " 正文\\草稿\\ 、/notes/, .., , 正文",
      sidebarSummaryGoal: false,
    });

    expect(settings).not.toHaveProperty("workspaceFolders");
    expect(settings.sidebarSummaryGoal).toBe(false);
    expect(normalizeSettings({}).sidebarSummaryGoal).toBe(true);
    expect(normalizeSettings({ showExplorerCounts: false }).showExplorerCounts).toBe(false);
    expect(normalizeSettings({}).showExplorerCounts).toBe(true);
    expect(normalizeSettings({ showFolderCounts: false }).showFolderCounts).toBe(false);
    expect(normalizeSettings({}).showFolderCounts).toBe(true);
  });

  it("normalizes focus timer preferences while retaining unrecognized settings", () => {
    const settings = normalizeSettings({
      focusEnabled: true,
      focusDisplayMode: "sidebar",
      focusDurationMs: 45 * 60_000,
      restDurationMs: 10 * 60_000,
      focusIdleThresholdMs: 3 * 60_000,
      focusRecordShortSessions: true,
      timeStatsEnabled: true,
      idleThresholdMs: 120_000,
    });

    expect(settings).toMatchObject({
      focusEnabled: true,
      focusDisplayMode: "sidebar",
      focusDurationMs: 45 * 60_000,
      restDurationMs: 10 * 60_000,
      focusIdleThresholdMs: 3 * 60_000,
      focusRecordShortSessions: true,
    });
    expect(settings).toHaveProperty("timeStatsEnabled", true);
    expect(settings).toHaveProperty("idleThresholdMs", 120_000);
    expect(normalizeSettings({ focusIdleThresholdMs: 30_000 }).focusIdleThresholdMs).toBe(30_000);
    expect(normalizeSettings({ focusDisplayMode: "wrong" }).focusDisplayMode).toBe("calendar");
    expect(normalizeSettings({ focusDurationMs: -1 }).focusDurationMs).toBe(25 * 60_000);
  });

  it("keeps future settings fields and their schema version through normalization", () => {
    const settings = normalizeSettings({
      schemaVersion: 2,
      futureToggle: true,
      futureOptions: { density: "compact", nested: { enabled: true } },
      futureList: ["a", "b"],
    });

    const persisted = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
    expect(persisted).toMatchObject({
      schemaVersion: 2,
      futureToggle: true,
      futureOptions: { density: "compact", nested: { enabled: true } },
      futureList: ["a", "b"],
    });
  });

  it("repairs invalid persisted values and preserves valid preferences", () => {
    const settings = normalizeSettings({
      selectedMetric: "wrong",
      countMode: "body-characters",
      customColor: "not-a-color",
      dataFolder: " /写作日历数据/ ",
      showStatusBar: true,
    });

    expect(settings.selectedMetric).toBe("manual");
    expect(settings.countMode).toBe("body-characters");
    expect(settings.customColor).toBe(DEFAULT_SETTINGS.customColor);
    expect(settings.dataFolder).toBe("写作日历数据");
    expect(settings.showStatusBar).toBe(true);
  });

  it("normalizes weekly and monthly goal targets", () => {
    const settings = normalizeSettings({
      goalWeekTarget: 5000,
      goalMonthTarget: 20000,
    });

    expect(settings.goalWeekTarget).toBe(5000);
    expect(settings.goalMonthTarget).toBe(20000);
    expect(normalizeSettings({}).goalWeekTarget).toBe(0);
    expect(normalizeSettings({}).goalMonthTarget).toBe(0);
    expect(normalizeSettings({ goalWeekTarget: -1 }).goalWeekTarget).toBe(0);
    expect(normalizeSettings({ goalMonthTarget: "many" }).goalMonthTarget).toBe(0);
  });
});
