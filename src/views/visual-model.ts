import { buildMonthGrid, heatLevel, listDateRange } from "../core/calendar";
import { dateRangeForBars, type DailyActivity } from "../query/dashboard";
import type {
  ActivityMetric,
  BarRange,
  CalendarDisplay,
  HeatmapRange,
} from "../settings/model";

const METRIC_LABELS: Record<ActivityMetric, string> = {
  manual: "手动输入",
  increment: "增量",
  deletion: "删除量",
  net: "净增",
  manualNet: "手动净增",
};

export interface VisualCell {
  date: string;
  day: number;
  inMonth: boolean;
  value: number;
  level: 0 | 1 | 2 | 3 | 4;
  visibleValue: string;
  ariaLabel: string;
  activity?: DailyActivity;
}

export interface HeatmapCell {
  date: string;
  value: number;
  level: 0 | 1 | 2 | 3 | 4;
  ariaLabel: string;
}

export interface BarPoint {
  date: string;
  value: number;
  magnitude: number;
  direction: "positive" | "negative" | "zero";
  ariaLabel: string;
}

export interface BarSeries {
  points: BarPoint[];
  hasNegative: boolean;
  maximumMagnitude: number;
}

function valueOf(day: DailyActivity | undefined, metric: ActivityMetric): number {
  return day?.[metric] ?? 0;
}

function chineseDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function detailLabel(date: string, day: DailyActivity | undefined): string {
  const parts = [
    chineseDate(date),
    `手动输入 ${day?.manual ?? 0} 字`,
    `增量 ${day?.increment ?? 0} 字`,
    `删除量 ${day?.deletion ?? 0} 字`,
    `净增 ${day?.net ?? 0} 字`,
    `手动净增 ${day?.manualNet ?? 0} 字`,
  ];
  if (day?.files.length) {
    const files = day.files
      .slice(0, 3)
      .map((file) => `${file.displayPath ?? file.path} ${file.increment} 字`)
      .join("，");
    parts.push(`主要文件：${files}`);
  }
  return parts.join("；");
}

export function buildMonthCells(options: {
  year: number;
  month: number;
  metric: ActivityMetric;
  display: CalendarDisplay;
  daily: readonly DailyActivity[];
}): VisualCell[] {
  const byDate = new Map(options.daily.map((day) => [day.localDate, day]));
  const grid = buildMonthGrid(options.year, options.month);
  const values = grid.filter((cell) => cell.inMonth).map((cell) => valueOf(byDate.get(cell.date), options.metric));
  const showHeat = options.display !== "dot";
  return grid.map((cell) => {
    const activity = byDate.get(cell.date);
    const value = valueOf(activity, options.metric);
    return {
      ...cell,
      value,
      // 仅活跃点模式：不上色阶底色，活跃状态由 UI 层用小圆点表达
      level: showHeat ? heatLevel(value, values) : 0,
      visibleValue: options.display === "color-and-number" && value !== 0 ? String(value) : "",
      ariaLabel: detailLabel(cell.date, activity),
      ...(activity ? { activity } : {}),
    };
  });
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function shiftDate(value: string, days: number): string {
  const result = parseDate(value);
  result.setUTCDate(result.getUTCDate() + days);
  return formatDate(result);
}

export function buildHeatmapCells(options: {
  anchor: string;
  range: HeatmapRange;
  metric: ActivityMetric;
  daily: readonly DailyActivity[];
}): HeatmapCell[] {
  const year = options.anchor.slice(0, 4);
  const start = options.range === "rolling-year" ? shiftDate(options.anchor, -364) : `${year}-01-01`;
  const end = options.range === "rolling-year" ? options.anchor : `${year}-12-31`;
  const byDate = new Map(options.daily.map((day) => [day.localDate, day]));
  const dates = listDateRange(start, end);
  const values = dates.map((date) => valueOf(byDate.get(date), options.metric));
  return dates.map((date, index) => ({
    date,
    value: values[index],
    level: heatLevel(values[index], values),
    ariaLabel: `${chineseDate(date)}；${METRIC_LABELS[options.metric]} ${values[index]} 字`,
  }));
}

export function buildBarSeries(options: {
  anchor: string;
  range: BarRange;
  metric: ActivityMetric;
  daily: readonly DailyActivity[];
}): BarSeries {
  const [start, end] = dateRangeForBars(options.range, options.anchor);
  const byDate = new Map(options.daily.map((day) => [day.localDate, day]));
  const values = listDateRange(start, end).map((date) => ({
    date,
    value: valueOf(byDate.get(date), options.metric),
  }));
  const maximumMagnitude = Math.max(0, ...values.map(({ value }) => Math.abs(value)));
  return {
    hasNegative: values.some(({ value }) => value < 0),
    maximumMagnitude,
    points: values.map(({ date, value }) => ({
      date,
      value,
      magnitude: maximumMagnitude === 0 ? 0 : Math.abs(value) / maximumMagnitude,
      direction: value > 0 ? "positive" : value < 0 ? "negative" : "zero",
      ariaLabel: `${chineseDate(date)}；${METRIC_LABELS[options.metric]} ${value} 字`,
    })),
  };
}

export interface HeatmapMonthMark {
  /** 该月第一个周列的列号（forward 布局，自最旧一周起算） */
  forwardColumn: number;
  /** 该月连续占据的周列数（≥1）；渲染侧据此计算标签起点与跨度 */
  columnSpan: number;
  text: string;
}

/**
 * 热力图月份标注：按「连续同月列」分组，每组一个标注并携带真实列数。
 * 渲染侧（正序/倒序）都用 forwardColumn + columnSpan 推导标签的起止列，
 * 保证标签与色块逐列对齐 —— 此前固定 span 4 且倒序时直接翻转起点，
 * 标签会落在月份色块的右端并逐月漂移。
 */
export function buildHeatmapMonthMarks(
  cells: readonly { readonly date: string }[],
  offset: number,
  columnCount: number,
): HeatmapMonthMark[] {
  if (cells.length === 0) return [];
  const monthOfColumn = (column: number): string => {
    const index = Math.min(Math.max(column * 7 - offset, 0), cells.length - 1);
    return cells[index].date.slice(0, 7);
  };
  const marks: HeatmapMonthMark[] = [];
  let groupStart = 0;
  for (let column = 1; column <= columnCount; column += 1) {
    if (column < columnCount && monthOfColumn(column) === monthOfColumn(groupStart)) continue;
    const index = Math.min(Math.max(groupStart * 7 - offset, 0), cells.length - 1);
    marks.push({
      forwardColumn: groupStart,
      columnSpan: column - groupStart,
      text: `${Number(cells[index].date.slice(5, 7))}月`,
    });
    groupStart = column;
  }
  return marks;
}
