import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";

import { buildMonthGrid, summarizeStreaks } from "../core/calendar";
import type { DailyActivity } from "../query/dashboard";
import { localDateString } from "../service/runtime";
import {
  WEEKDAY_LABELS,
  applyViewAccent,
  createIconButton,
} from "./components";
import type { WritingCalendarViewHost } from "./host";
import { renderFocusTimer } from "./focus-components";
import { bindLightTooltip, hideLightTooltip } from "./light-tooltip";

export const WRITING_CALENDAR_VIEW_TYPE = "writing-calendar-sidebar";

type DashboardSnapshot = ReturnType<WritingCalendarViewHost["runtime"]["getDashboard"]>;

function shiftedMonth(year: number, month: number, delta: number): [number, number] {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1];
}

function parseISO(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function shiftDateStr(value: string, days: number): string {
  const date = parseISO(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatISO(date);
}

/** 该日期所在周的周一 */
function mondayOfWeek(value: string): string {
  const date = parseISO(value);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return formatISO(date);
}

/** 三星期视图：锚点周的上周、本周、下周，共 21 格 */
function buildThreeWeekCells(anchorMonday: string): { date: string; day: number; inMonth: boolean }[] {
  const start = shiftDateStr(anchorMonday, -7);
  const cells: { date: string; day: number; inMonth: boolean }[] = [];
  for (let index = 0; index < 21; index += 1) {
    const date = shiftDateStr(start, index);
    cells.push({ date, day: Number(date.slice(8, 10)), inMonth: true });
  }
  return cells;
}

/** 悬浮提示的多行内容：当日指标，不设标题行 */
function detailLines(day: DailyActivity | undefined): string[] {
  const lines = [
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
    lines.push(`主要文件：${files}`);
  }
  return lines;
}

/** 无障碍标签：以日期开头，单行拼接 */
function detailLabel(date: string, day: DailyActivity | undefined): string {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  return [`${year}年${month}月${dayOfMonth}日`, ...detailLines(day)].join("；");
}

/** 侧栏固定色阶：0 / 1-500 / 501-1000 / 1001-2000 / 2001-3000 / 3000+ */
function heatTier(value: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  if (magnitude <= 500) return 1;
  if (magnitude <= 1_000) return 2;
  if (magnitude <= 2_000) return 3;
  if (magnitude <= 3_000) return 4;
  return 5;
}

/** 小数字：<10000 原样显示具体字数，否则 1.2k / 3k */
function compactNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude < 10_000) return String(value);
  const prefix = value < 0 ? "-" : "";
  return `${prefix}${Math.round(magnitude / 1_000)}k`;
}

export class WritingCalendarView extends ItemView {
  private unsubscribe?: () => void;
  private unsubscribeFocus?: () => void;
  private focusContainer?: HTMLElement;
  private year = new Date().getFullYear();
  private month = new Date().getMonth() + 1;
  private selectedDate?: string;
  /** 三星期视图锚点（所在周的周一）；空串表示尚未初始化 */
  private weekAnchorMonday = "";

  constructor(leaf: WorkspaceLeaf, private readonly host: WritingCalendarViewHost) {
    super(leaf);
  }

  getViewType(): string {
    return WRITING_CALENDAR_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "写作日历";
  }

  getIcon(): string {
    return "calendar-days";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.host.runtime.subscribe(() => this.render());
    this.unsubscribeFocus = this.host.focusController.subscribe(() => this.refreshFocusTimer());
    // 侧栏滚动时收起悬浮提示，避免定位停留在旧位置
    this.contentEl.addEventListener("scroll", () => hideLightTooltip(), { passive: true });
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribeFocus?.();
  }

  private render(): void {
    hideLightTooltip();
    const container = this.contentEl;
    container.empty();
    container.addClass("wc-view", "wc-sidebar-view");
    applyViewAccent(container, this.host.settings.colorSource, this.host.settings.customColor);

    const snapshot = this.host.runtime.getDashboard();
    const today = localDateString();
    const threeWeeks = this.host.settings.sidebarThreeWeeks;

    const header = container.createDiv({ cls: "wc-sidebar-header" });
    const monthNav = header.createDiv({ cls: "wc-sidebar-month-nav" });
    if (threeWeeks) {
      // 三星期视图：箭头按周平移，标题显示锚点周所在月份
      if (!this.weekAnchorMonday) this.weekAnchorMonday = mondayOfWeek(today);
      createIconButton(monthNav, "chevron-left", "上一周", () => {
        this.weekAnchorMonday = shiftDateStr(this.weekAnchorMonday, -7);
        this.render();
      });
      const anchorLabel = parseISO(shiftDateStr(this.weekAnchorMonday, 3));
      monthNav.createEl("h3", {
        text: `${anchorLabel.getUTCFullYear()} 年 ${anchorLabel.getUTCMonth() + 1} 月`,
      });
      createIconButton(monthNav, "chevron-right", "下一周", () => {
        this.weekAnchorMonday = shiftDateStr(this.weekAnchorMonday, 7);
        this.render();
      });
    } else {
      createIconButton(monthNav, "chevron-left", "上个月", () => {
        [this.year, this.month] = shiftedMonth(this.year, this.month, -1);
        this.render();
      });
      monthNav.createEl("h3", { text: `${this.year} 年 ${this.month} 月` });
      createIconButton(monthNav, "chevron-right", "下个月", () => {
        [this.year, this.month] = shiftedMonth(this.year, this.month, 1);
        this.render();
      });
    }
    const actions = header.createDiv({ cls: "wc-sidebar-actions" });
    createIconButton(actions, "refresh-cw", "重新扫描并重新读取同步数据", () => {
      void (async () => {
        await this.host.runtime.reloadSyncedData();
        await this.host.runtime.scanAllFiles();
        new Notice("已重新读取同步数据并重新扫描文件");
      })();
    });
    const openButton = actions.createEl("button", { cls: "wc-open-workbench", type: "button" });
    openButton.createSpan({ text: "详细统计" });
    const arrow = openButton.createSpan({ cls: "wc-inline-icon", attr: { "aria-hidden": "true" } });
    // The icon is decorative because the adjacent text names the action.
    setIcon(arrow, "arrow-right");
    openButton.addEventListener("click", () => void this.host.openWorkbench());

    const calendar = container.createDiv({ cls: "wc-sidebar-calendar" });
    if (this.host.settings.calendarDisplay === "color-and-number") calendar.addClass("is-showing-values");
    this.renderMonthHeatmap(calendar, snapshot, today);

    const state = this.host.runtime.getState();
    if (state.paused) {
      container.createDiv({
        cls: "wc-inline-status is-warning",
        text: "活动记录已暂停，请在设置中检查数据目录。",
        attr: { role: "status" },
      });
    }

    this.renderSummary(container, snapshot);
    this.focusContainer = undefined;
    if (this.host.settings.focusEnabled && this.host.settings.focusDisplayMode === "calendar") {
      this.focusContainer = container.createDiv({ cls: "wc-sidebar-focus" });
      this.refreshFocusTimer();
    }
  }

  private refreshFocusTimer(): void {
    if (!this.focusContainer?.isConnected) return;
    renderFocusTimer(this.focusContainer, this.host, { compact: true });
  }

  private renderMonthHeatmap(container: HTMLElement, snapshot: DashboardSnapshot, today: string): void {
    const metric = this.host.settings.selectedMetric;
    const display = this.host.settings.calendarDisplay;
    const showValues = display === "color-and-number";
    const weekdays = container.createDiv({ cls: "wc-sidebar-weekdays", attr: { "aria-hidden": "true" } });
    for (const label of WEEKDAY_LABELS) weekdays.createSpan({ text: label });

    const grid = container.createDiv({
      cls: "wc-sidebar-grid",
      attr: {
        role: "grid",
        "aria-label": this.host.settings.sidebarThreeWeeks ? "三星期视图" : `${this.year}年${this.month}月`,
      },
    });
    const buttons: HTMLButtonElement[] = [];
    const cells = this.host.settings.sidebarThreeWeeks
      ? buildThreeWeekCells(this.weekAnchorMonday)
      : buildMonthGrid(this.year, this.month);
    for (const cell of cells) {
      const day = snapshot.byDate.get(cell.date);
      const value = day?.[metric] ?? 0;
      const label = detailLabel(cell.date, day);
      const button = grid.createEl("button", {
        cls: [
          "wc-sidebar-day",
          `is-level-${display === "dot" ? 0 : heatTier(value)}`,
          cell.inMonth ? "is-current-month" : "is-adjacent-month",
          cell.date === today ? "is-today" : "",
          cell.date === this.selectedDate ? "is-selected" : "",
          display === "dot" && value !== 0 ? "is-active" : "",
          value < 0 ? "is-negative" : "",
        ].filter(Boolean).join(" "),
        attr: {
          type: "button",
          role: "gridcell",
          // 不用 aria-label：Obsidian 会对带 aria-label 的元素显示原生黑色提示，
          // 与自定义浅色提示冲突；可读信息改由视觉隐藏文字提供。
          "aria-current": cell.date === today ? "date" : "false",
          "data-date": cell.date,
        },
      });
      button.createSpan({ cls: "wc-visually-hidden", text: label });
      button.createSpan({ cls: "wc-sidebar-day-number", text: String(cell.day) });
      if (showValues && value !== 0) {
        button.createSpan({ cls: "wc-sidebar-day-value", text: compactNumber(value) });
      }
      bindLightTooltip(button, container, () => detailLines(day));
      button.addEventListener("click", () => {
        this.selectedDate = cell.date;
        void this.host.openWorkbench(cell.date);
      });
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

  private renderSummary(container: HTMLElement, snapshot: DashboardSnapshot): void {
    const metric = this.host.settings.selectedMetric;
    const now = new Date();
    const monthLabel = this.year === now.getFullYear() && this.month === now.getMonth() + 1 ? "本月" : `${this.month} 月`;
    const monthKey = `${this.year}-${String(this.month).padStart(2, "0")}`;
    const monthValue = snapshot.daily
      .filter((day) => day.localDate.startsWith(monthKey))
      .reduce((sum, day) => sum + day[metric], 0);
    const todayValue = snapshot.today[metric];
    const manualByDate = new Map(snapshot.daily.map((day) => [day.localDate, day.manual]));
    const currentStreak = summarizeStreaks(manualByDate, localDateString()).currentStreak;

    // 摘要行按开关逐项组装；全部关闭时整行不显示。
    const parts: string[] = [];
    if (this.host.settings.sidebarSummaryMonth) parts.push(`${monthLabel} ${monthValue.toLocaleString("zh-CN")} 字`);
    if (this.host.settings.sidebarSummaryToday) parts.push(`今日 ${todayValue.toLocaleString("zh-CN")} 字`);
    if (this.host.settings.sidebarSummaryStreak) parts.push(`连续 ${currentStreak} 天`);
    if (parts.length > 0) {
      const summaryEl = container.createDiv({ cls: "wc-sidebar-summary-line" });
      summaryEl.setText(parts.join(" · "));
    }

    const goalTarget = this.host.settings.goalTarget;
    if (this.host.settings.sidebarSummaryGoal && goalTarget > 0) {
      const goalMetricValue = snapshot.today[this.host.settings.goalMetric];
      const goalEl = container.createDiv({ cls: "wc-sidebar-goal-line" });
      goalEl.setText(
        `每日目标 ${goalMetricValue.toLocaleString("zh-CN")} / ${goalTarget.toLocaleString("zh-CN")}`,
      );
    }

  }
}
