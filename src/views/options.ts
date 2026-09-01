import type { ActivityMetric, BarRange, CalendarDisplay, CountMode, HeatmapRange } from "../settings/model";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export const METRIC_OPTIONS: readonly SelectOption<ActivityMetric>[] = [
  { value: "manual", label: "手动输入" },
  { value: "manualNet", label: "手动净增" },
  { value: "increment", label: "增量" },
  { value: "deletion", label: "删除量" },
  { value: "net", label: "净增" },
];

export const COUNT_MODE_OPTIONS: readonly SelectOption<CountMode>[] = [
  { value: "creative", label: "创作字数" },
  { value: "body-characters", label: "正文字符数" },
];

export const CALENDAR_DISPLAY_OPTIONS: readonly SelectOption<CalendarDisplay>[] = [
  { value: "dot", label: "仅活跃点" },
  { value: "color-only", label: "热度底色" },
  { value: "color-and-number", label: "显示小数字" },
];

export const HEATMAP_RANGE_OPTIONS: readonly SelectOption<HeatmapRange>[] = [
  { value: "rolling-year", label: "过去一年" },
  { value: "calendar-year", label: "自然年" },
];

export const BAR_RANGE_OPTIONS: readonly SelectOption<BarRange>[] = [
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "30-days", label: "近 30 天" },
  { value: "year", label: "本年" },
];

export function formatMetricValue(metric: ActivityMetric, value: number): string {
  if ((metric === "net" || metric === "manualNet") && value > 0) {
    return `+${value.toLocaleString("zh-CN")}`;
  }
  return value.toLocaleString("zh-CN");
}

export function optionLabel<T extends string>(options: readonly SelectOption<T>[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
