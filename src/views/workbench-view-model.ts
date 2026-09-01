import { summarizeStreaks } from "../core/calendar";
import type { DashboardSnapshot, DailyActivity } from "../query/dashboard";
import type { ActivityMetric } from "../settings/model";

/**
 * 统计工作台的模块元数据与数据计算。
 *
 * 模块用独立 id + 尺寸概念，为将来「编辑布局」（顺序 / 尺寸 / 显隐）预留，
 * 当前只负责渲染，不实现拖拽与持久化。
 */
export type WorkbenchModuleId =
  | "calendar"
  | "day-detail"
  | "trend"
  | "heatmap"
  | "recent-documents"
  | "goal";

export type WorkbenchModuleSize = "small" | "medium" | "large";

export interface WorkbenchModuleMeta {
  id: WorkbenchModuleId;
  title: string;
  size: WorkbenchModuleSize;
}

/** 今日概览：全部来自写作活动账本。 */
export interface DemoTodayOverview {
  /** 当前选中指标对应的今日字数 */
  todayMetricValue: number;
  net: number;
  streak: number;
  weekTotal: number;
  monthTotal: number;
  currentTotal: number;
}

export interface DemoDayDetail {
  date: string;
  manual: number;
  increment: number;
  deletion: number;
  net: number;
  files: readonly { path: string; increment: number }[];
}

export interface DemoRecentDocument {
  path: string;
  lastDate: string;
  lastIncrement: number;
}

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function mondayOf(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return formatDate(date);
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftDays(value: string, days: number): string {
  const date = parseLocalDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function computeTodayOverview(
  snapshot: DashboardSnapshot,
  metric: ActivityMetric,
  today: string,
): DemoTodayOverview {
  const weekStart = mondayOf(today);
  const monthPrefix = today.slice(0, 7);
  let weekTotal = 0;
  let monthTotal = 0;
  for (const day of snapshot.daily) {
    if (day.localDate >= weekStart && day.localDate <= today) weekTotal += day[metric];
    if (day.localDate.startsWith(monthPrefix)) monthTotal += day[metric];
  }
  const manualByDate = new Map(snapshot.daily.map((day) => [day.localDate, day.manual]));
  const streaks = summarizeStreaks(manualByDate, today);
  return {
    todayMetricValue: snapshot.today[metric],
    net: snapshot.today.net,
    streak: streaks.currentStreak,
    weekTotal,
    monthTotal,
    currentTotal: snapshot.currentTotal,
  };
}

export function computeDayDetail(snapshot: DashboardSnapshot, date: string): DemoDayDetail {
  const day = snapshot.byDate.get(date);
  return {
    date,
    manual: day?.manual ?? 0,
    increment: day?.increment ?? 0,
    deletion: day?.deletion ?? 0,
    net: day?.net ?? 0,
    files: (day?.files ?? []).map((file) => ({
      path: file.displayPath ?? file.path,
      increment: file.increment,
    })),
  };
}

/** 每日目标的贡献文档：仅统计正向推进目标的文档，按贡献从高到低。 */
export interface DemoGoalContribution {
  path: string;
  value: number;
}

/** 环形图分段：一篇文章一段；色条亮度档位用完后合并进「其他」。 */
export interface DemoGoalSegment {
  label: string;
  value: number;
  isOther: boolean;
}

/** 目标环可用的色条亮度档数（与日历热度底色的 5 档非零色一致）。 */
export const GOAL_SEGMENT_COLORS = 5;

/** 每日目标：以「今天」为窗口、按目标指标计算完成度。 */
export interface DemoDailyGoal {
  enabled: boolean;
  metric: ActivityMetric;
  target: number;
  /** 今日该指标数值（当前写作项目范围内）。 */
  value: number;
  /** 目标完成度，钳制在 0..1；未启用时为 0。 */
  progress: number;
  /** 今日是否已达标。 */
  achieved: boolean;
  /** 今日对目标有正向贡献的文档，按贡献从高到低。 */
  contributions: DemoGoalContribution[];
}

export function computeDailyGoal(
  snapshot: DashboardSnapshot,
  metric: ActivityMetric,
  target: number,
): DemoDailyGoal {
  const enabled = Number.isFinite(target) && target > 0;
  const value = snapshot.today[metric];
  // 未启用目标时不产出贡献明细，UI 直接显示占位文案
  const contributions = enabled
    ? snapshot.today.files
        .filter((file) => file[metric] > 0)
        .map((file) => ({ path: file.displayPath ?? file.path, value: file[metric] }))
        .sort((left, right) => right.value - left.value)
    : [];
  return {
    enabled,
    metric,
    target,
    value,
    progress: enabled ? Math.min(1, Math.max(0, value / target)) : 0,
    achieved: enabled && value >= target,
    contributions,
  };
}

/**
 * 环形图分段：贡献率高的文档优先占用亮度档位，
 * 超出色条档数的低贡献文档合并为一段「其他」。
 */
export function buildGoalSegments(
  contributions: readonly DemoGoalContribution[],
  maxSegments = GOAL_SEGMENT_COLORS,
): DemoGoalSegment[] {
  if (contributions.length <= maxSegments) {
    return contributions.map((entry) => ({ label: entry.path, value: entry.value, isOther: false }));
  }
  const segments = contributions
    .slice(0, maxSegments - 1)
    .map((entry) => ({ label: entry.path, value: entry.value, isOther: false }));
  const otherValue = contributions
    .slice(maxSegments - 1)
    .reduce((sum, entry) => sum + entry.value, 0);
  segments.push({ label: "其他", value: otherValue, isOther: true });
  return segments;
}

/** 历史每日目标回顾中的一天。 */
export interface GoalHistoryDay {
  date: string;
  value: number;
  target: number;
  /** 当日该指标是否达到目标。 */
  achieved: boolean;
  /** 当日完成度，钳制在 0..1。 */
  progress: number;
}

/**
 * 历史每日目标回顾：以 today 为终点、向前取 days 天（含今天）。
 * 目标为 0（未启用）时只产出数值，achieved/progress 保持假值。
 */
export function computeGoalHistory(
  snapshot: DashboardSnapshot,
  metric: ActivityMetric,
  target: number,
  today: string,
  days = 14,
): GoalHistoryDay[] {
  const enabled = Number.isFinite(target) && target > 0;
  const result: GoalHistoryDay[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = shiftDays(today, -offset);
    const value = snapshot.byDate.get(date)?.[metric] ?? 0;
    result.push({
      date,
      value,
      target,
      achieved: enabled && value >= target,
      progress: enabled ? Math.min(1, Math.max(0, value / target)) : 0,
    });
  }
  return result;
}

export type GoalPeriod = "week" | "month";

/** 周/月目标进度：周一至周日 / 自然月累计。 */
export interface GoalPeriodProgress {
  period: GoalPeriod;
  metric: ActivityMetric;
  target: number;
  /** 目标是否启用（target > 0）。 */
  enabled: boolean;
  current: number;
  /** 周期完成度，钳制在 0..1。 */
  progress: number;
  achieved: boolean;
}

/** 月度打卡中的一天。 */
export interface GoalCheckinDay {
  date: string;
  /** 当日目标指标的数值。 */
  value: number;
  /** 是否达到每日目标。 */
  achieved: boolean;
  isToday: boolean;
  /** 今天及以前（含今天）；未来日期没有打卡状态。 */
  isPast: boolean;
}

/** 月度打卡数据：周一为首列的方格布局。 */
export interface GoalMonthCheckins {
  year: number;
  month: number;
  /** 1 号前的空位数（周一为第 1 列）。 */
  leading: number;
  /** 当月每天（1..月末），与方格按周对齐。 */
  days: GoalCheckinDay[];
}

export function computeMonthCheckins(
  snapshot: DashboardSnapshot,
  metric: ActivityMetric,
  target: number,
  today: string,
): GoalMonthCheckins {
  const [year, month] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leading = (firstWeekday + 6) % 7;
  const enabled = Number.isFinite(target) && target > 0;
  const days: GoalCheckinDay[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const value = snapshot.byDate.get(date)?.[metric] ?? 0;
    days.push({
      date,
      value,
      achieved: enabled && value >= target,
      isToday: date === today,
      isPast: date <= today,
    });
  }
  return { year, month, leading, days };
}

export function computeGoalPeriod(
  snapshot: DashboardSnapshot,
  metric: ActivityMetric,
  target: number,
  today: string,
  period: GoalPeriod,
): GoalPeriodProgress {
  const enabled = Number.isFinite(target) && target > 0;
  let current = 0;
  if (period === "week") {
    const weekStart = mondayOf(today);
    for (const day of snapshot.daily) {
      if (day.localDate >= weekStart && day.localDate <= today) current += day[metric];
    }
  } else {
    const monthPrefix = today.slice(0, 7);
    for (const day of snapshot.daily) {
      if (day.localDate.startsWith(monthPrefix)) current += day[metric];
    }
  }
  return {
    period,
    metric,
    target,
    enabled,
    current,
    progress: enabled ? Math.min(1, Math.max(0, current / target)) : 0,
    achieved: enabled && current >= target,
  };
}

export function computeRecentDocuments(
  daily: readonly DailyActivity[],
  limit = 6,
): DemoRecentDocument[] {
  const latest = new Map<string, DemoRecentDocument>();
  for (const day of daily) {
    for (const file of day.files) {
      if (file.increment === 0) continue;
      const displayPath = file.displayPath ?? file.path;
      latest.set(displayPath, { path: displayPath, lastDate: day.localDate, lastIncrement: file.increment });
    }
  }
  return [...latest.values()]
    .sort(
      (left, right) =>
        right.lastDate.localeCompare(left.lastDate) || Math.abs(right.lastIncrement) - Math.abs(left.lastIncrement),
    )
    .slice(0, limit);
}
