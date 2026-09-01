import { setIcon, setTooltip } from "obsidian";

import type { DashboardSnapshot } from "../query/dashboard";
import type { ActivityMetric, CalendarDisplay } from "../settings/model";
import { bindLightTooltip } from "./light-tooltip";
import { buildMonthCells } from "./visual-model";

export const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function applyViewAccent(element: HTMLElement, source: "obsidian-accent" | "custom", color: string): void {
  if (source === "custom") element.style.setProperty("--wc-accent", color);
  else element.style.removeProperty("--wc-accent");
}

export function createIconButton(
  container: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = container.createEl("button", { cls: "clickable-icon wc-icon-button", attr: { "aria-label": label } });
  setIcon(button, icon);
  setTooltip(button, label);
  button.addEventListener("click", onClick);
  return button;
}

export function createSelect<T extends string>(
  container: HTMLElement,
  label: string,
  value: T,
  options: readonly { value: T; label: string }[],
  onChange: (value: T) => void,
  compact = false,
): HTMLSelectElement {
  const wrapper = container.createDiv({ cls: compact ? "wc-select-wrap is-compact" : "wc-select-wrap" });
  wrapper.createSpan({ cls: "wc-visually-hidden", text: label, attr: { id: `wc-label-${Math.random().toString(36).slice(2)}` } });
  const select = wrapper.createEl("select", { cls: "dropdown wc-select", attr: { "aria-label": label } });
  for (const option of options) {
    const node = select.createEl("option", { text: option.label, value: option.value });
    node.selected = option.value === value;
  }
  select.addEventListener("change", () => onChange(select.value as T));
  return select;
}

function compactNumber(value: number): string {
  const magnitude = Math.abs(value);
  // 四位数以内直接显示具体字数，仅万位以上才缩写为 k
  if (magnitude < 10_000) return String(value);
  const prefix = value < 0 ? "-" : "";
  return `${prefix}${Math.round(magnitude / 1_000)}k`;
}

export interface MonthCalendarOptions {
  year: number;
  month: number;
  metric: ActivityMetric;
  display: CalendarDisplay;
  snapshot: DashboardSnapshot;
  today: string;
  selectedDate?: string;
  onDate: (date: string) => void;
}

export function renderMonthCalendar(container: HTMLElement, options: MonthCalendarOptions): void {
  // 仅活跃点模式：负值斜纹底需要容器级开关来抑制
  if (options.display === "dot") container.addClass("is-dot");
  const weekdays = container.createDiv({ cls: "wc-weekdays", attr: { "aria-hidden": "true" } });
  for (const label of WEEKDAY_LABELS) weekdays.createSpan({ text: label });
  const grid = container.createDiv({ cls: "wc-month-grid", attr: { role: "grid", "aria-label": `${options.year}年${options.month}月` } });
  const cells = buildMonthCells({
    year: options.year,
    month: options.month,
    metric: options.metric,
    display: options.display,
    daily: options.snapshot.daily,
  });
  const buttons: HTMLButtonElement[] = [];
  for (const cell of cells) {
    const button = grid.createEl("button", {
      cls: [
        "wc-day",
        `is-level-${cell.level}`,
        cell.inMonth ? "is-current-month" : "is-adjacent-month",
        cell.date === options.today ? "is-today" : "",
        cell.date === options.selectedDate ? "is-selected" : "",
        options.display === "dot" && cell.value !== 0 ? "is-active" : "",
        cell.value < 0 ? "is-negative" : "",
      ].filter(Boolean).join(" "),
      attr: {
        type: "button",
        role: "gridcell",
        // 不用 aria-label / setTooltip：Obsidian 会显示原生黑色提示，
        // 改用浅色自定义提示；可读信息由视觉隐藏文字提供。
        "aria-current": cell.date === options.today ? "date" : "false",
        "data-date": cell.date,
      },
    });
    button.createSpan({ cls: "wc-visually-hidden", text: cell.ariaLabel });
    button.createSpan({ cls: "wc-day-number", text: String(cell.day) });
    if (cell.visibleValue) button.createSpan({ cls: "wc-day-value", text: compactNumber(cell.value) });
    bindLightTooltip(button, container, () => cell.ariaLabel.split("；"));
    button.addEventListener("click", () => options.onDate(cell.date));
    buttons.push(button);
  }
  grid.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const index = buttons.indexOf(event.target);
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (!offset) return;
    const target = buttons[index + offset];
    if (!target) return;
    event.preventDefault();
    target.focus();
  });
}
