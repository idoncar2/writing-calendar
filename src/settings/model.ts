export type ActivityMetric = "manual" | "increment" | "deletion" | "net" | "manualNet";
export type CountMode = "creative" | "body-characters";
export type CalendarDisplay = "color-and-number" | "color-only" | "dot";
export type ColorSource = "obsidian-accent" | "custom";
export type HeatmapRange = "rolling-year" | "calendar-year";
export type BarRange = "week" | "month" | "30-days" | "year";
export type FocusDisplayMode = "calendar" | "sidebar";
export type UiLanguage = "auto" | "zh-CN" | "en";

export interface WritingCalendarSettings {
  schemaVersion: number;
  uiLanguage: UiLanguage;
  deviceId: string;
  activationDate: string;
  selectedProjectId: string;
  selectedMetric: ActivityMetric;
  countMode: CountMode;
  includePasteInManual: boolean;
  calendarDisplay: CalendarDisplay;
  /** 小日历只显示三星期（上周/本周/下周），箭头按周切换 */
  sidebarThreeWeeks: boolean;
  colorSource: ColorSource;
  customColor: string;
  heatmapRange: HeatmapRange;
  barRange: BarRange;
  goalMetric: ActivityMetric;
  goalTarget: number;
  /** 周目标（周一至周日累计）字数；0 = 不启用。 */
  goalWeekTarget: number;
  /** 月目标（自然月累计）字数；0 = 不启用。 */
  goalMonthTarget: number;
  focusEnabled: boolean;
  focusDisplayMode: FocusDisplayMode;
  focusDurationMs: number;
  restDurationMs: number;
  focusIdleThresholdMs: number;
  /** 是否保留手动结束且不足一分钟的专注记录。 */
  focusRecordShortSessions: boolean;
  showStatusBar: boolean;
  /** 左侧文件列表的字数角标。 */
  showExplorerCounts: boolean;
  /** 文件夹名右侧显示内部所有文档的字数合集（需 showExplorerCounts）。 */
  showFolderCounts: boolean;
  dataFolder: string;
  sidebarSummaryMonth: boolean;
  sidebarSummaryToday: boolean;
  sidebarSummaryStreak: boolean;
  sidebarSummaryGoal: boolean;
  sidebarIntroduced: boolean;
}

export const CURRENT_SETTINGS_SCHEMA_VERSION = 1 as const;

export const DEFAULT_SETTINGS: WritingCalendarSettings = {
  schemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
  uiLanguage: "auto",
  deviceId: "",
  activationDate: "",
  selectedProjectId: "workspace",
  selectedMetric: "manual",
  countMode: "creative",
  includePasteInManual: false,
  calendarDisplay: "color-and-number",
  sidebarThreeWeeks: false,
  colorSource: "obsidian-accent",
  customColor: "#5b8def",
  heatmapRange: "rolling-year",
  barRange: "month",
  goalMetric: "increment",
  goalTarget: 0,
  goalWeekTarget: 0,
  goalMonthTarget: 0,
  focusEnabled: false,
  focusDisplayMode: "calendar",
  focusDurationMs: 25 * 60_000,
  restDurationMs: 5 * 60_000,
  // Kept as the persisted setting name for compatibility; it is the edit
  // activity grace window used to distinguish active from idle time.
  focusIdleThresholdMs: 60_000,
  focusRecordShortSessions: false,
  showStatusBar: false,
  showExplorerCounts: true,
  showFolderCounts: true,
  dataFolder: "写作日历数据",
  sidebarSummaryMonth: true,
  sidebarSummaryToday: true,
  sidebarSummaryStreak: true,
  sidebarSummaryGoal: true,
  sidebarIntroduced: false,
};

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && choices.includes(value as T) ? (value as T) : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function durationMs(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum ? value : fallback;
}

const KNOWN_SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
const RETIRED_SETTING_KEYS = new Set(["workspaceFolders"]);

function preserveUnknownSettings(source: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !KNOWN_SETTING_KEYS.has(key) && !RETIRED_SETTING_KEYS.has(key)),
  );
}

function schemaVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
    ? value
    : CURRENT_SETTINGS_SCHEMA_VERSION;
}

function visibleDataFolder(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_SETTINGS.dataFolder;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith(".") ||
    normalized.startsWith("_") ||
    normalized.split("/").some((part) => part === ".." || part.length === 0)
  ) {
    return DEFAULT_SETTINGS.dataFolder;
  }
  return normalized;
}

export function normalizeSettings(value: unknown): WritingCalendarSettings {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    ...preserveUnknownSettings(source),
    schemaVersion: schemaVersion(source.schemaVersion),
    uiLanguage: choice(source.uiLanguage, ["auto", "zh-CN", "en"], "auto"),
    deviceId: typeof source.deviceId === "string" ? source.deviceId : "",
    activationDate: typeof source.activationDate === "string" ? source.activationDate : "",
    selectedProjectId: typeof source.selectedProjectId === "string"
      ? source.selectedProjectId
      : DEFAULT_SETTINGS.selectedProjectId,
    selectedMetric: choice(
      source.selectedMetric,
      ["manual", "increment", "deletion", "net", "manualNet"],
      "manual",
    ),
    countMode: choice(source.countMode, ["creative", "body-characters"], "creative"),
    includePasteInManual: boolean(source.includePasteInManual, false),
    calendarDisplay: choice(
      source.calendarDisplay,
      ["color-and-number", "color-only", "dot"],
      "color-and-number",
    ),
    sidebarThreeWeeks: boolean(source.sidebarThreeWeeks, false),
    colorSource: choice(source.colorSource, ["obsidian-accent", "custom"], "obsidian-accent"),
    customColor:
      typeof source.customColor === "string" && /^#[0-9a-f]{6}$/i.test(source.customColor)
        ? source.customColor
        : DEFAULT_SETTINGS.customColor,
    heatmapRange: choice(source.heatmapRange, ["rolling-year", "calendar-year"], "rolling-year"),
    barRange: choice(source.barRange, ["week", "month", "30-days", "year"], "month"),
    goalMetric: choice(
      source.goalMetric,
      ["manual", "increment", "deletion", "net", "manualNet"],
      "increment",
    ),
    goalTarget:
      typeof source.goalTarget === "number" && Number.isFinite(source.goalTarget) && source.goalTarget >= 0
        ? source.goalTarget
        : 0,
    goalWeekTarget:
      typeof source.goalWeekTarget === "number" && Number.isFinite(source.goalWeekTarget) && source.goalWeekTarget >= 0
        ? source.goalWeekTarget
        : 0,
    goalMonthTarget:
      typeof source.goalMonthTarget === "number" && Number.isFinite(source.goalMonthTarget) && source.goalMonthTarget >= 0
        ? source.goalMonthTarget
        : 0,
    focusEnabled: boolean(source.focusEnabled, false),
    focusDisplayMode: choice(source.focusDisplayMode, ["calendar", "sidebar"], "calendar"),
    focusDurationMs: durationMs(source.focusDurationMs, DEFAULT_SETTINGS.focusDurationMs, 60_000),
    restDurationMs: durationMs(source.restDurationMs, DEFAULT_SETTINGS.restDurationMs, 60_000),
    focusIdleThresholdMs: durationMs(
      source.focusIdleThresholdMs,
      DEFAULT_SETTINGS.focusIdleThresholdMs,
      30_000,
    ),
    focusRecordShortSessions: boolean(source.focusRecordShortSessions, false),
    showStatusBar: boolean(source.showStatusBar, false),
    showExplorerCounts: boolean(source.showExplorerCounts, true),
    showFolderCounts: boolean(source.showFolderCounts, true),
    dataFolder: visibleDataFolder(source.dataFolder),
    sidebarSummaryMonth: boolean(source.sidebarSummaryMonth, true),
    sidebarSummaryToday: boolean(source.sidebarSummaryToday, true),
    sidebarSummaryStreak: boolean(source.sidebarSummaryStreak, true),
    sidebarSummaryGoal: boolean(source.sidebarSummaryGoal, true),
    sidebarIntroduced: boolean(source.sidebarIntroduced, false),
  };
}
