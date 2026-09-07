import { ItemView, Notice, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { localizeRoot, t } from "../i18n";

import { summarizeStreaks } from "../core/calendar";
import { calculateFocusStatistics, type FocusSummary } from "../focus/statistics";
import { parseProjectEditor } from "../projects/editor-model";
import { conditionTreeFromProjectFilter, hasScopeConditions } from "../projects/scope-conditions";
import type { ProjectFilter, ScopeConditionGroup } from "../projects/types";
import { LocalWorkbenchFilterStore } from "../projects/workspace";
import { localDateString } from "../service/runtime";
import type { ActivityMetric } from "../settings/model";
import { applyViewAccent, createIconButton, createSelect, renderMonthCalendar } from "./components";
import {
  buildGoalSegments,
  computeDailyGoal,
  computeDayDetail,
  computeGoalHistory,
  computeGoalPeriod,
  computeMonthCheckins,
  computeRecentDocuments,
  computeTodayOverview,
  GOAL_SEGMENT_COLORS,
  type GoalPeriodProgress,
  type WorkbenchModuleId,
  type WorkbenchModuleMeta,
} from "./workbench-view-model";
import type { WritingCalendarViewHost } from "./host";
import { bindLightTooltip, hideLightTooltip } from "./light-tooltip";
import { formatMetricValue, HEATMAP_RANGE_OPTIONS, METRIC_OPTIONS, optionLabel } from "./options";
import { ScopeRuleBuilder } from "./scope-rule-builder";
import {
  buildBarSeries,
  buildHeatmapCells,
  buildHeatmapMonthMarks,
  type BarSeries,
} from "./visual-model";

export const WRITING_CALENDAR_WORKBENCH_VIEW_TYPE = "writing-calendar-workbench";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * 模块元数据：为将来「编辑布局」预留 id / 尺寸 / 显隐。
 * 当前仅用于渲染与 DOM 标记，不实现拖拽与持久化。
 */
export const WORKBENCH_MODULES: readonly WorkbenchModuleMeta[] = [
  { id: "calendar", title: "月历", size: "large" },
  { id: "day-detail", title: "当天详情", size: "medium" },
  { id: "trend", title: "写作趋势", size: "large" },
  { id: "heatmap", title: "热力图", size: "large" },
  { id: "recent-documents", title: "最近文档", size: "medium" },
  { id: "goal", title: "写作目标", size: "large" },
];

type DashboardSnapshot = ReturnType<WritingCalendarViewHost["runtime"]["getDashboard"]>;

function moveMonth(year: number, month: number, delta: number): [number, number] {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1];
}

function number(value: number): string {
  return value.toLocaleString("zh-CN");
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** "2026-08-27" → "8/27" */
function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function plusNumber(value: number): string {
  return value > 0 ? `+${number(value)}` : number(value);
}

function timeOfDay(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatFocusDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分`;
}

function fullDateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${year}年${month}月${day}日 · 周${weekday}`;
}

export class WritingCalendarWorkbenchView extends ItemView {
  private unsubscribe?: () => void;
  private unsubscribeFocus?: () => void;
  private unsubscribeFocusRecords?: () => void;
  private page: "writing" | "focus" = "writing";
  private selectedDate = localDateString();
  private year = new Date().getFullYear();
  private month = new Date().getMonth() + 1;
  private readonly filterStore: LocalWorkbenchFilterStore;
  private temporaryFilter?: ProjectFilter;
  private filterDraftTree: ScopeConditionGroup = conditionTreeFromProjectFilter(undefined);
  private filterDraftQuery = "";
  private preserveFilter = false;
  private filterExpanded = false;

  constructor(leaf: WorkspaceLeaf, private readonly host: WritingCalendarViewHost) {
    super(leaf);
    this.filterStore = new LocalWorkbenchFilterStore(this.host.app.vault.getName());
  }

  getViewType(): string {
    return WRITING_CALENDAR_WORKBENCH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("统计工作台");
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen(): Promise<void> {
    const savedFilter = this.filterStore.load();
    if (savedFilter) {
      this.temporaryFilter = savedFilter;
      this.filterDraftTree = conditionTreeFromProjectFilter(savedFilter);
      this.filterDraftQuery = savedFilter.advancedQuery ?? "";
      this.preserveFilter = true;
    } else {
      this.temporaryFilter = undefined;
      this.filterDraftTree = conditionTreeFromProjectFilter(undefined);
      this.filterDraftQuery = "";
      this.preserveFilter = false;
    }
    this.unsubscribe = this.host.runtime.subscribe(() => this.render());
    this.unsubscribeFocus = this.host.focusController.subscribe(() => {
      if (this.page === "focus") this.render();
    });
    this.unsubscribeFocusRecords = this.host.subscribeFocusRecords(() => {
      if (this.page === "focus") this.render();
    });
    // View 内部滚动时收起悬浮提示，避免定位停留在旧位置
    this.contentEl.addEventListener("scroll", () => hideLightTooltip(), { passive: true });
    this.render();
    this.logStyleSelfCheck();
  }

  /**
   * 样式自检：探测 .wc-day 的关键属性是否真的来自当前版本的 styles.css。
   * 若 Obsidian 载入了旧的 styles.css（缓存/未重载），控制台会直接给出结论，
   * 不再需要肉眼对比界面。
   */
  private logStyleSelfCheck(): void {
    try {
      const probe = createDiv();
      probe.addClass("wc-view", "wc-style-probe");
      const button = probe.createEl("button", { cls: "wc-day is-level-0", attr: { type: "button" } });
      document.body.appendChild(probe);
      const style = getComputedStyle(button);
      const transparent = style.backgroundColor === "rgba(0, 0, 0, 0)" || style.backgroundColor === "transparent";
      const noShadow = style.boxShadow === "none" || style.boxShadow === "";
      button.remove();
      probe.remove();
      if (transparent && noShadow) {
        console.log("[writing-calendar] 样式自检通过：当前运行的 styles.css 是新版（无描边/透明格子）");
      } else {
        console.warn(
          `[writing-calendar] 样式自检未通过：backgroundColor=${style.backgroundColor}, boxShadow=${style.boxShadow}。` +
            "运行中的 styles.css 不是最新版——请在设置 → 第三方插件里把 写作日历 关闭再打开一次。",
        );
      }
    } catch (error) {
      console.warn("[writing-calendar] 样式自检执行失败", error);
    }
  }

  async onClose(): Promise<void> {
    if (this.preserveFilter && this.temporaryFilter) this.filterStore.save(this.temporaryFilter);
    else {
      this.filterStore.clear();
      this.temporaryFilter = undefined;
      this.filterDraftTree = conditionTreeFromProjectFilter(undefined);
      this.filterDraftQuery = "";
    }
    this.unsubscribe?.();
    this.unsubscribeFocus?.();
    this.unsubscribeFocusRecords?.();
  }

  focusDate(date: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    this.selectedDate = date;
    this.year = Number(date.slice(0, 4));
    this.month = Number(date.slice(5, 7));
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    const scrollTop = container.scrollTop;
    container.empty();
    container.addClass("wc-view", "wc-demo-view");
    localizeRoot(container);
    applyViewAccent(container, this.host.settings.colorSource, this.host.settings.customColor);
    const snapshot = this.temporaryFilter
      ? this.host.runtime.getDashboardForFilter(this.temporaryFilter)
      : this.host.runtime.getDashboard();
    const today = localDateString();

    const inner = container.createDiv({ cls: "wc-demo-inner" });
    this.renderHeader(inner);
    if (this.page === "focus" && this.host.settings.focusEnabled) {
      this.renderFocusStatistics(inner, today);
      this.renderFooterNote(inner);
      container.scrollTop = scrollTop;
      return;
    }
    this.renderWorkbenchFilter(inner);
    this.renderToday(inner, snapshot, today);
    this.renderModules(inner, snapshot, today);
    this.renderFooterNote(inner);
    container.scrollTop = scrollTop;
  }

  private renderWorkbenchFilter(container: HTMLElement): void {
    const panel = container.createEl("details", { cls: "wc-workbench-filter" });
    panel.open = this.filterExpanded;
    const summary = panel.createEl("summary");
    summary.setAttribute("aria-expanded", String(panel.open));
    const summaryMain = summary.createSpan({ cls: "wc-workbench-filter-summary" });
    const icon = summaryMain.createSpan({ attr: { "aria-hidden": "true" } });
    setIcon(icon, "list-filter");
    summaryMain.createSpan({ text: "高级筛选" });
    const selectedScope = this.host.runtime.getProjects()
      .find((project) => project.id === this.host.settings.selectedProjectId)?.name ?? "全部写作";
    summary.createSpan({
      cls: this.temporaryFilter ? "wc-workbench-filter-state is-active" : "wc-workbench-filter-state",
      text: this.temporaryFilter ? "临时筛选已生效 · 替代当前范围" : `默认跟随：${selectedScope}`,
    });
    panel.addEventListener("toggle", () => {
      this.filterExpanded = panel.open;
      summary.setAttribute("aria-expanded", String(panel.open));
    });

    const body = panel.createDiv({ cls: "wc-workbench-filter-body" });
    body.createDiv({
      cls: "setting-item-description",
      text: "应用后会完全替代设置中选择的统计范围；清除后恢复默认范围。未勾选“保留筛选”时，关闭工作台会自动清除。",
    });
    const errors = body.createDiv({ cls: "wc-form-errors", attr: { role: "alert", tabindex: "-1" } });
    const builderHost = body.createDiv();
    const builder = new ScopeRuleBuilder(builderHost, this.host.app, this.filterDraftTree, {
      compact: true,
      allowGroups: true,
      onChange: (tree) => {
        this.filterDraftTree = tree;
      },
    });

    const expression = body.createEl("details", { cls: "wc-scope-advanced wc-workbench-filter-expression" });
    expression.createEl("summary", { text: "表达式模式（可选）" });
    const query = expression.createEl("textarea", {
      cls: "wc-query-input",
      placeholder: '例如：(folder("正文") OR tag("#小说")) AND NOT tag("#归档")',
      attr: { "aria-label": "临时高级筛选表达式", rows: "3" },
    });
    query.value = this.filterDraftQuery;
    query.addEventListener("input", () => {
      this.filterDraftQuery = query.value;
    });

    const footer = body.createDiv({ cls: "wc-workbench-filter-footer" });
    const preserve = footer.createEl("label", { cls: "wc-workbench-filter-preserve" });
    const checkbox = preserve.createEl("input", { type: "checkbox" });
    checkbox.checked = this.preserveFilter;
    preserve.createSpan({ text: "保留筛选" });
    checkbox.addEventListener("change", () => {
      this.preserveFilter = checkbox.checked;
      if (!this.preserveFilter) this.filterStore.clear();
      else if (this.temporaryFilter) this.filterStore.save(this.temporaryFilter);
    });
    const actions = footer.createDiv({ cls: "wc-workbench-filter-actions" });
    const clear = actions.createEl("button", { text: "清除筛选", attr: { type: "button" } });
    clear.disabled = !this.temporaryFilter && !hasScopeConditions(this.filterDraftTree) && !this.filterDraftQuery.trim();
    clear.addEventListener("click", () => {
      this.temporaryFilter = undefined;
      this.filterDraftTree = conditionTreeFromProjectFilter(undefined);
      this.filterDraftQuery = "";
      this.preserveFilter = false;
      this.filterStore.clear();
      this.render();
    });
    const apply = actions.createEl("button", { cls: "mod-cta", text: "应用筛选", attr: { type: "button" } });
    apply.addEventListener("click", () => {
      errors.empty();
      this.filterDraftTree = builder.getTree();
      this.filterDraftQuery = query.value;
      if (!hasScopeConditions(this.filterDraftTree) && !this.filterDraftQuery.trim()) {
        errors.setText("请至少添加一个条件，或填写高级表达式。");
        errors.focus();
        return;
      }
      const parsed = parseProjectEditor({
        id: "",
        name: "临时筛选",
        includeFolders: "",
        excludeFolders: "",
        includeTags: "",
        excludeTags: "",
        extensions: "",
        filenameGlobs: "",
        propertiesJson: "",
        advancedQuery: this.filterDraftQuery,
        conditionTree: this.filterDraftTree,
      });
      if (!parsed.ok) {
        errors.setText(Object.values(parsed.errors).filter(Boolean).join("；"));
        errors.focus();
        return;
      }
      this.temporaryFilter = {
        conditionTree: parsed.definition.conditionTree,
        ...(parsed.definition.advancedQuery ? { advancedQuery: parsed.definition.advancedQuery } : {}),
      };
      if (this.preserveFilter) this.filterStore.save(this.temporaryFilter);
      else this.filterStore.clear();
      this.render();
    });
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createEl("header", { cls: "wc-demo-header" });
    const titleRow = header.createDiv({ cls: "wc-demo-title-row" });
    const titleGroup = titleRow.createDiv({ cls: "wc-demo-title-group" });
    titleGroup.createEl("h1", { text: this.page === "focus" ? "专注统计" : "写作统计" });
    titleGroup.createSpan({ cls: "wc-demo-badge", text: `v${this.host.version}` });
    const actions = titleRow.createDiv({ cls: "wc-demo-header-actions" });
    // 工作台内切换统计指标：今日概览、月历、趋势、热力图统一跟随
    if (this.page === "writing") {
      const controls = actions.createDiv({ cls: "wc-demo-header-controls" });
      createSelect(
        controls,
        "统计指标",
        this.host.settings.selectedMetric,
        METRIC_OPTIONS,
        (selectedMetric) => {
          void this.host.runtime.updatePreferences({ selectedMetric });
        },
        true,
      );
    }
    const diagnostics = actions.createEl("button", {
      cls: "wc-demo-diagnostics-action",
      attr: { type: "button", "aria-label": "打开数据诊断" },
    });
    const diagnosticsIcon = diagnostics.createSpan({ cls: "wc-demo-diagnostics-icon", attr: { "aria-hidden": "true" } });
    setIcon(diagnosticsIcon, "shield-check");
    diagnostics.createSpan({ text: "数据诊断" });
    diagnostics.addEventListener("click", () => void this.host.openDiagnostics());
    header.createSpan({
      cls: "wc-demo-subtitle",
      text: this.page === "focus"
        ? "只统计主动开启番茄钟后的专注记录"
        : "真实数据驱动的长期写作统计",
    });
    if (this.host.settings.focusEnabled) {
      const tabs = header.createDiv({ cls: "wc-workbench-tabs", attr: { role: "tablist" } });
      const writing = tabs.createEl("button", {
        cls: this.page === "writing" ? "is-active" : "",
        attr: { type: "button", role: "tab", "aria-selected": String(this.page === "writing") },
      });
      const writingIcon = writing.createSpan({ cls: "wc-workbench-tab-icon", attr: { "aria-hidden": "true" } });
      setIcon(writingIcon, "chart-no-axes-column-increasing");
      writing.createSpan({ text: "写作统计" });
      writing.addEventListener("click", () => { this.page = "writing"; this.render(); });
      const focus = tabs.createEl("button", {
        cls: this.page === "focus" ? "is-active" : "",
        attr: { type: "button", role: "tab", "aria-selected": String(this.page === "focus") },
      });
      const focusIcon = focus.createSpan({ cls: "wc-workbench-tab-icon", attr: { "aria-hidden": "true" } });
      setIcon(focusIcon, "timer");
      focus.createSpan({ text: "专注统计" });
      focus.addEventListener("click", () => { this.page = "focus"; this.render(); });
    } else {
      this.page = "writing";
    }
  }

  private renderFocusStatistics(container: HTMLElement, today: string): void {
    const stats = calculateFocusStatistics(this.host.getFocusRecords(), today, 12);
    const section = container.createEl("section", { cls: "wc-focus-statistics", attr: { "aria-label": "专注统计" } });
    const cards = section.createDiv({ cls: "wc-focus-stat-grid" });
    this.renderFocusSummary(cards, "今天", stats.today);
    this.renderFocusSummary(cards, "本周", stats.week);
    this.renderFocusSummary(cards, "本月", stats.month);

    const recent = section.createDiv({ cls: "wc-focus-recent" });
    recent.createEl("h2", { text: "最近专注" });
    if (stats.recent.length === 0) {
      recent.createDiv({ cls: "wc-demo-empty", text: "还没有专注记录。开始一次番茄钟后会显示在这里。" });
      return;
    }
    const list = recent.createEl("ul");
    for (const record of stats.recent) {
      const item = list.createEl("li");
      const main = item.createDiv({ cls: "wc-focus-record-main" });
      main.createSpan({ text: `${record.localDate} ${timeOfDay(record.startTime)}` });
      main.createSpan({ text: `${formatFocusDuration(record.activeMs)} · 输入 ${number(record.inputCharacters)} 字` });
      item.createDiv({
        cls: "wc-focus-record-detail",
        text: `净增 ${plusNumber(record.netCharacters)} · 空闲时间 ${formatFocusDuration(record.idleMs)} · 离开时间 ${formatFocusDuration(record.awayMs)}`,
      });
    }
  }

  private renderFocusSummary(container: HTMLElement, label: string, summary: FocusSummary): void {
    const card = container.createDiv({ cls: "wc-focus-stat-card" });
    card.createSpan({ cls: "wc-focus-stat-label", text: label });
    card.createDiv({ cls: "wc-focus-stat-value", text: `${summary.sessionCount} 次 · ${formatFocusDuration(summary.activeMs)}` });
    card.createSpan({ text: `输入 ${number(summary.inputCharacters)} · 净增 ${plusNumber(summary.netCharacters)}` });
    card.createSpan({
      cls: "wc-focus-stat-secondary",
      text: summary.inputSpeed === null ? "速度样本不足" : `平均 ${number(summary.inputSpeed)} 字/小时`,
    });
  }

  private renderToday(container: HTMLElement, snapshot: DashboardSnapshot, today: string): void {
    const metric = this.host.settings.selectedMetric;
    const overview = computeTodayOverview(snapshot, metric, today);
    const section = container.createEl("section", { cls: "wc-demo-today", attr: { "aria-label": "今日概览" } });

    const head = section.createDiv({ cls: "wc-demo-today-head" });
    head.createSpan({ cls: "wc-demo-kicker", text: "今日概览" });
    head.createSpan({ cls: "wc-demo-today-date", text: fullDateLabel(today) });

    const main = section.createDiv({ cls: "wc-demo-today-main" });
    const hero = main.createDiv({ cls: "wc-demo-today-hero" });
    hero.createDiv({ cls: "wc-demo-hero-value", text: number(overview.todayMetricValue) });
    hero.createSpan({ cls: "wc-demo-hero-label", text: `今日字数 · ${optionLabel(METRIC_OPTIONS, metric)}` });

    const metrics = main.createDiv({ cls: "wc-demo-today-metrics" });
    const net = this.addMetric(metrics, "今日净增", formatMetricValue("net", overview.net));
    if (overview.net < 0) net.addClass("is-negative");
    else if (overview.net > 0) net.addClass("is-positive");
    this.addMetric(metrics, "连续写作", `${overview.streak} 天`);

    section.createDiv({
      cls: "wc-demo-today-line",
      text: `本周 ${number(overview.weekTotal)} 字 · 本月 ${number(overview.monthTotal)} 字 · 当前总字数 ${number(overview.currentTotal)}`,
    });
  }

  private addMetric(container: HTMLElement, label: string, valueText: string, caption?: string): HTMLElement {
    const item = container.createDiv({ cls: "wc-demo-metric" });
    const value = item.createDiv({ cls: "wc-demo-metric-value", text: valueText });
    if (caption) value.addClass("is-muted");
    item.createSpan({ cls: "wc-demo-metric-label", text: label });
    if (caption) item.createSpan({ cls: "wc-demo-metric-caption", text: caption });
    return item;
  }

  private renderModules(container: HTMLElement, snapshot: DashboardSnapshot, today: string): void {
    const grid = container.createDiv({ cls: "wc-demo-modules" });
    this.renderCalendarModule(grid, snapshot, today);
    this.renderDayDetailModule(grid, snapshot);
    this.renderTrendModule(grid, snapshot, today);
    this.renderHeatmapModule(grid, snapshot, today);
    this.renderRecentDocumentsModule(grid, snapshot);
    this.renderGoalModule(grid, snapshot, today);
  }

  private moduleElement(container: HTMLElement, id: WorkbenchModuleId): HTMLElement {
    const meta = WORKBENCH_MODULES.find((module) => module.id === id);
    return container.createEl("section", {
      cls: "wc-demo-module",
      attr: {
        "data-module-id": id,
        "data-module-size": meta?.size ?? "medium",
        "aria-labelledby": `wc-demo-${id}-heading`,
      },
    });
  }

  private renderCalendarModule(container: HTMLElement, snapshot: DashboardSnapshot, today: string): void {
    const section = this.moduleElement(container, "calendar");
    const head = section.createDiv({ cls: "wc-demo-module-head" });
    head.createEl("h2", { text: "月历", attr: { id: "wc-demo-calendar-heading" } });
    const nav = head.createDiv({ cls: "wc-demo-inline-nav" });
    createIconButton(nav, "chevron-left", "上个月", () => {
      [this.year, this.month] = moveMonth(this.year, this.month, -1);
      this.render();
    });
    nav.createSpan({ cls: "wc-demo-month-label", text: `${this.year} 年 ${this.month} 月` });
    createIconButton(nav, "chevron-right", "下个月", () => {
      [this.year, this.month] = moveMonth(this.year, this.month, 1);
      this.render();
    });

    const calendar = section.createDiv({ cls: "wc-demo-calendar" });
    renderMonthCalendar(calendar, {
      year: this.year,
      month: this.month,
      metric: this.host.settings.selectedMetric,
      display: this.host.settings.calendarDisplay,
      snapshot,
      today,
      selectedDate: this.selectedDate,
      onDate: (date) => this.focusDate(date),
    });
  }

  private renderDayDetailModule(container: HTMLElement, snapshot: DashboardSnapshot): void {
    const section = this.moduleElement(container, "day-detail");
    const head = section.createDiv({ cls: "wc-demo-module-head" });
    head.createEl("h2", { text: "当天详情", attr: { id: "wc-demo-day-detail-heading" } });

    const detail = computeDayDetail(snapshot, this.selectedDate);
    section.createSpan({ cls: "wc-demo-detail-date", text: fullDateLabel(detail.date) });

    const rows = section.createDiv({ cls: "wc-demo-detail-rows" });
    this.addDetailRow(rows, "手动输入", number(detail.manual));
    this.addDetailRow(rows, "增量", number(detail.increment));
    this.addDetailRow(rows, "删除", number(detail.deletion));
    this.addDetailRow(rows, "净增", formatMetricValue("net", detail.net),
      detail.net < 0 ? "is-negative" : detail.net > 0 ? "is-positive" : "");

    section.createSpan({ cls: "wc-demo-detail-subhead", text: "涉及文件" });
    if (detail.files.length === 0) {
      section.createDiv({ cls: "wc-demo-empty", text: "当日无文件活动" });
    } else {
      const list = section.createEl("ul", { cls: "wc-demo-detail-files" });
      for (const file of detail.files.slice(0, 5)) {
        const item = list.createEl("li");
        item.createSpan({ cls: "wc-demo-file-path", text: file.path });
        item.createSpan({ cls: "wc-demo-file-value", text: plusNumber(file.increment) });
      }
      if (detail.files.length > 5) list.createEl("li", { cls: "wc-demo-more", text: `另有 ${detail.files.length - 5} 个文件` });
    }
  }

  private addDetailRow(container: HTMLElement, label: string, value: string, valueClass = ""): void {
    const row = container.createDiv({ cls: "wc-demo-detail-row" });
    row.createSpan({ cls: "wc-demo-detail-name", text: label });
    row.createSpan({ cls: `wc-demo-detail-value${valueClass ? ` ${valueClass}` : ""}`, text: value });
  }

  private renderTrendModule(container: HTMLElement, snapshot: DashboardSnapshot, today: string): void {
    const section = this.moduleElement(container, "trend");
    const metric = this.host.settings.selectedMetric;
    const head = section.createDiv({ cls: "wc-demo-module-head" });
    head.createEl("h2", { text: "写作趋势", attr: { id: "wc-demo-trend-heading" } });
    head.createSpan({ cls: "wc-demo-module-kicker", text: `最近 30 天 · ${optionLabel(METRIC_OPTIONS, metric)}` });

    const series = buildBarSeries({ anchor: today, range: "30-days", metric, daily: snapshot.daily });
    section.createDiv({
      cls: "wc-visually-hidden",
      text: `近 30 天${optionLabel(METRIC_OPTIONS, metric)}柱状图，共 ${series.points.length} 天，最大绝对值 ${series.maximumMagnitude} 字。`,
    });
    const scroll = section.createDiv({ cls: "wc-demo-trend-scroll" });
    this.renderBarChart(scroll, series);
  }

  /** 柱状图：布局与正式工作台一致，每根非零柱子上方标注具体字数 */
  private renderBarChart(container: HTMLElement, series: BarSeries): void {
    // 倒序显示：最近日期在最左，旧日期向右，无需滚动即可先看到今天
    const points = [...series.points].reverse();
    const width = Math.max(720, points.length * 26);
    const height = 212;
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.classList.add("wc-demo-bar-chart");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "group");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.width = `${width}px`;
    container.appendChild(svg);

    const baseline = series.hasNegative ? 104 : 176;
    const available = series.hasNegative ? 78 : 164;
    const axis = document.createElementNS(SVG_NAMESPACE, "line");
    axis.setAttribute("x1", "28");
    axis.setAttribute("x2", String(width - 12));
    axis.setAttribute("y1", String(baseline));
    axis.setAttribute("y2", String(baseline));
    axis.classList.add("wc-zero-axis");
    svg.appendChild(axis);

    const usableWidth = width - 48;
    const step = usableWidth / Math.max(1, points.length);
    const barWidth = Math.max(6, Math.min(16, step * 0.6));
    const bars: SVGRectElement[] = [];
    points.forEach((point, index) => {
      const rect = document.createElementNS(SVG_NAMESPACE, "rect");
      const barHeight = Math.max(point.value === 0 ? 1 : 2, point.magnitude * available);
      const x = 32 + index * step + (step - barWidth) / 2;
      const y = point.direction === "negative" ? baseline : baseline - barHeight;
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(barWidth));
      rect.setAttribute("height", String(barHeight));
      rect.setAttribute("rx", String(Math.min(2, barWidth / 2)));
      rect.setAttribute("tabindex", index === 0 ? "0" : "-1");
      rect.setAttribute("role", "graphics-symbol");
      // 不用 aria-label / <title>：Obsidian 会显示原生黑色提示，
      // 改用浅色自定义提示；描述信息交给 <desc> 供读屏器使用。
      const desc = document.createElementNS(SVG_NAMESPACE, "desc");
      desc.textContent = point.ariaLabel;
      rect.appendChild(desc);
      rect.classList.add("wc-bar", `is-${point.direction}`);
      bindLightTooltip(rect as unknown as HTMLElement, this.contentEl, () =>
        point.ariaLabel.split("；"),
      );
      rect.addEventListener("click", () => this.focusDate(point.date));
      svg.appendChild(rect);
      bars.push(rect);

      // 具体字数：非零柱子上方（负值在柱子下方）直接标注数字
      if (point.value !== 0) {
        const valueLabel = document.createElementNS(SVG_NAMESPACE, "text");
        valueLabel.textContent = point.value.toLocaleString("zh-CN");
        valueLabel.setAttribute("x", String(x + barWidth / 2));
        valueLabel.setAttribute(
          "y",
          String(point.direction === "negative" ? baseline + barHeight + 12 : y - 3),
        );
        valueLabel.setAttribute("text-anchor", "middle");
        valueLabel.classList.add("wc-demo-bar-value", `is-${point.direction}`);
        svg.appendChild(valueLabel);
      }
    });
    svg.addEventListener("keydown", (event) => {
      if (!(event.target instanceof SVGRectElement)) return;
      const index = bars.indexOf(event.target);
      const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!delta) return;
      const target = bars[index + delta];
      if (!target) return;
      event.preventDefault();
      event.target.setAttribute("tabindex", "-1");
      target.setAttribute("tabindex", "0");
      target.focus();
    });

    const labelCount = Math.min(7, points.length);
    for (let tick = 0; tick < labelCount; tick += 1) {
      const index = Math.round((tick * (points.length - 1)) / Math.max(1, labelCount - 1));
      const point = points[index];
      const text = document.createElementNS(SVG_NAMESPACE, "text");
      text.textContent = point.date.slice(5);
      text.setAttribute("x", String(32 + index * step + step / 2));
      text.setAttribute("y", "206");
      text.setAttribute("text-anchor", "middle");
      text.classList.add("wc-axis-label");
      svg.appendChild(text);
    }
  }

  private renderHeatmapModule(container: HTMLElement, snapshot: DashboardSnapshot, today: string): void {
    const section = this.moduleElement(container, "heatmap");
    const metric = this.host.settings.selectedMetric;
    const head = section.createDiv({ cls: "wc-demo-module-head" });
    head.createEl("h2", { text: "热力图", attr: { id: "wc-demo-heatmap-heading" } });
    head.createSpan({
      cls: "wc-demo-module-kicker",
      text: `${optionLabel(METRIC_OPTIONS, metric)} · ${optionLabel(HEATMAP_RANGE_OPTIONS, this.host.settings.heatmapRange)}`,
    });

    const cells = buildHeatmapCells({
      anchor: today,
      range: this.host.settings.heatmapRange,
      metric,
      daily: snapshot.daily,
    });
    const manualByDate = new Map(snapshot.daily.map((day) => [day.localDate, day.manual]));
    const streaks = summarizeStreaks(manualByDate, today);
    section.createDiv({
      cls: "wc-streak-summary",
      text: `活跃 ${streaks.activeDays} 天 · 当前连续 ${streaks.currentStreak} 天 · 最长 ${streaks.longestStreak} 天`,
    });

    const scroll = section.createDiv({ cls: "wc-heatmap-scroll wc-demo-heatmap-scroll" });
    const months = scroll.createDiv({ cls: "wc-heatmap-months", attr: { "aria-hidden": "true" } });
    // 倒序显示：最近日期在最左，旧日期向右。
    // 按「列」反转（最近一周在最左），列内仍保持 周一→周日，星期行标签不错位。
    const startDate = new Date(`${cells[0]?.date ?? today}T00:00:00Z`);
    const offset = (startDate.getUTCDay() + 6) % 7;
    const columnCount = Math.max(1, Math.ceil((cells.length + offset) / 7));
    // 月份轨道与热力网格共用同一列宽模板并按实际列数生成，保证对齐不错位
    months.setCssProps({ "--wc-heat-columns": String(columnCount) });
    for (const mark of buildHeatmapMonthMarks(cells, offset, columnCount)) {
      // 倒序布局：标签起点 = 该月在反转后最左的一列（而非右端），跨度用真实列数，
      // 保证标签与月份色块逐列对齐。
      // gridRow 必须显式钉在第 1 行：倒序遍历时视觉列号递减，网格的稀疏自动摆放
      // 会把每个标签挤到新的一行，形成“楼梯”错位。
      const label = months.createSpan({ text: mark.text });
      const visualStart = columnCount - 1 - (mark.forwardColumn + mark.columnSpan - 1);
      const span = Math.max(1, Math.min(mark.columnSpan, columnCount - visualStart));
      label.addClass("wc-heatmap-month-label");
      label.setCssProps({ "--wc-heat-label-column": `${visualStart + 1} / span ${span}` });
    }
    const heatBody = scroll.createDiv({ cls: "wc-heatmap-body" });
    const weekdayLabels = heatBody.createDiv({ cls: "wc-heatmap-weekdays", attr: { "aria-hidden": "true" } });
    for (const label of ["一", "", "三", "", "五", "", "日"]) weekdayLabels.createSpan({ text: label });
    const grid = heatBody.createDiv({ cls: "wc-heatmap-grid", attr: { role: "grid", "aria-label": "每日写作热力图" } });
    const buttons: HTMLButtonElement[] = [];
    for (let column = columnCount - 1; column >= 0; column -= 1) {
      for (let row = 0; row < 7; row += 1) {
        const index = column * 7 + row - offset;
        if (index < 0 || index >= cells.length) {
          grid.createSpan({ cls: "wc-heatmap-spacer", attr: { "aria-hidden": "true" } });
          continue;
        }
        const cell = cells[index];
        const button = grid.createEl("button", {
          cls: `wc-heat-cell is-level-${cell.level}${cell.value < 0 ? " is-negative" : ""}`,
          attr: {
            type: "button",
            role: "gridcell",
            // 不用 aria-label：Obsidian 会对带 aria-label 的元素显示原生黑色提示，
            // 改用浅色自定义提示；可读信息由视觉隐藏文字提供。
            "aria-current": cell.date === today ? "date" : "false",
            "data-date": cell.date,
            tabindex: cell.date === today ? "0" : "-1",
          },
        });
        const label = button.createSpan({ cls: "wc-visually-hidden", text: cell.ariaLabel });
        bindLightTooltip(button, this.contentEl, () => label.textContent?.split("；") ?? []);
        button.addEventListener("click", () => this.focusDate(cell.date));
        buttons.push(button);
      }
    }
    grid.addEventListener("keydown", (event) => {
      if (!(event.target instanceof HTMLButtonElement)) return;
      const index = buttons.indexOf(event.target);
      const offsets: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
      const delta = offsets[event.key];
      if (!delta) return;
      const target = buttons[index + delta];
      if (!target) return;
      event.preventDefault();
      event.target.tabIndex = -1;
      target.tabIndex = 0;
      target.focus();
    });
    const legend = section.createDiv({ cls: "wc-heatmap-legend", attr: { "aria-label": "颜色越深表示数值越高" } });
    legend.createSpan({ text: "少" });
    for (let level = 0; level <= 4; level += 1) legend.createSpan({ cls: `wc-legend-cell is-level-${level}`, attr: { "aria-hidden": "true" } });
    legend.createSpan({ text: "多" });
  }

  private renderRecentDocumentsModule(container: HTMLElement, snapshot: DashboardSnapshot): void {
    const section = this.moduleElement(container, "recent-documents");
    const head = section.createDiv({ cls: "wc-demo-module-head" });
    head.createEl("h2", { text: "最近文档", attr: { id: "wc-demo-recent-documents-heading" } });

    const documents = computeRecentDocuments(snapshot.daily, 6);
    if (documents.length === 0) {
      section.createDiv({ cls: "wc-demo-empty", text: "暂无写作活动记录" });
      return;
    }
    const list = section.createEl("ul", { cls: "wc-demo-doc-list" });
    for (const document of documents) {
      const item = list.createEl("li", { attr: { role: "button", tabIndex: 0 } });
      const line = item.createDiv({ cls: "wc-demo-doc-line" });
      line.createSpan({ cls: "wc-demo-doc-path", text: document.path });
      line.createSpan({ cls: "wc-demo-doc-value", text: plusNumber(document.lastIncrement) });
      item.createSpan({ cls: "wc-demo-doc-date", text: document.lastDate });
      item.addEventListener("click", () => this.openDocument(document.path));
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.openDocument(document.path);
      });
    }
  }

  private openDocument(path: string): void {
    const file = this.host.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      void this.host.app.workspace.getLeaf("tab").openFile(file);
    } else {
      new Notice(t(`文件不存在：${path}`));
    }
  }

  private renderGoalModule(container: HTMLElement, snapshot: DashboardSnapshot, today: string): void {
    const section = this.moduleElement(container, "goal");
    const head = section.createDiv({ cls: "wc-demo-module-head" });
    head.createEl("h2", { text: "写作目标", attr: { id: "wc-demo-goal-heading" } });
    head.createSpan({
      cls: "wc-demo-module-kicker",
      text: `指标：${optionLabel(METRIC_OPTIONS, this.host.settings.goalMetric)}`,
    });

    const metric = this.host.settings.goalMetric;
    const daily = computeDailyGoal(snapshot, metric, this.host.settings.goalTarget);
    const week = computeGoalPeriod(snapshot, metric, this.host.settings.goalWeekTarget, today, "week");
    const month = computeGoalPeriod(snapshot, metric, this.host.settings.goalMonthTarget, today, "month");
    if (!daily.enabled && !week.enabled && !month.enabled) {
      section.createDiv({
        cls: "wc-demo-placeholder",
        text: "暂未设置写作目标，可在设置中配置每日 / 周 / 月目标",
      });
      return;
    }

    // 每日目标：环形图在左（每篇贡献文档一段），右侧为进度与贡献文档
    if (daily.enabled) {
      const body = section.createDiv({ cls: "wc-demo-goal" });
      body.createSpan({ cls: "wc-demo-goal-kicker", text: "今日目标" });
      if (daily.achieved) body.addClass("is-achieved");

      const segments = buildGoalSegments(daily.contributions);
      const wrap = body.createDiv({ cls: "wc-demo-goal-ring-wrap" });
      const circumference = 2 * Math.PI * 42;
      const svg = document.createElementNS(SVG_NAMESPACE, "svg");
      svg.classList.add("wc-demo-goal-ring");
      svg.setAttribute("viewBox", "0 0 100 100");
      const track = document.createElementNS(SVG_NAMESPACE, "circle");
      track.setAttribute("cx", "50");
      track.setAttribute("cy", "50");
      track.setAttribute("r", "42");
      track.classList.add("wc-demo-goal-ring-track");
      svg.append(track);
      let consumed = 0;
      segments.forEach((segment, index) => {
        const fraction = Math.max(0, segment.value) / daily.target;
        const drawn = Math.min(fraction, Math.max(0, 1 - consumed));
        consumed += drawn;
        if (drawn <= 0) return;
        const arc = document.createElementNS(SVG_NAMESPACE, "circle");
        arc.setAttribute("cx", "50");
        arc.setAttribute("cy", "50");
        arc.setAttribute("r", "42");
        const length = circumference * drawn;
        arc.setAttribute("stroke-dasharray", `${length} ${circumference - length}`);
        arc.setAttribute("stroke-dashoffset", String(-circumference * (consumed - drawn)));
        // 贡献越高亮度越深：第 1 名用色条最深的第 5 档，依次递减
        arc.classList.add("wc-demo-goal-ring-arc", `is-tier-${GOAL_SEGMENT_COLORS - index}`);
        if (segment.isOther) arc.classList.add("is-other");
        svg.appendChild(arc);
      });
      wrap.appendChild(svg);
      const center = wrap.createDiv({ cls: "wc-demo-goal-ring-center" });
      center.setText(`${Math.round(daily.progress * 100)}%`);

      const info = body.createDiv({ cls: "wc-demo-goal-info" });
      info.createDiv({
        cls: "wc-demo-goal-progress",
        text: `今日 ${formatMetricValue(daily.metric, daily.value)} / 目标 ${daily.target.toLocaleString("zh-CN")}`,
      });
      if (segments.length === 0) {
        info.createDiv({ cls: "wc-demo-goal-docs", text: "今日还没有文档对目标有贡献" });
      } else {
        const list = info.createDiv({ cls: "wc-demo-goal-docs" });
        segments.forEach((segment, index) => {
          const row = list.createDiv({ cls: "wc-demo-goal-doc-row" });
          if (!segment.isOther) row.setAttribute("title", segment.label);
          row.createSpan({
            cls: `wc-demo-goal-swatch ${segment.isOther ? "is-other" : `is-tier-${GOAL_SEGMENT_COLORS - index}`}`,
          });
          row.createSpan({ cls: "wc-demo-goal-doc-name", text: basename(segment.label) });
          row.createSpan({ cls: "wc-demo-goal-doc-value", text: formatMetricValue(daily.metric, segment.value) });
        });
      }
    }

    const goalLayout = section.createDiv({
      cls: daily.enabled ? "wc-demo-goal-layout has-aside" : "wc-demo-goal-layout",
    });
    const goalMain = goalLayout.createDiv({ cls: "wc-demo-goal-main" });

    if (week.enabled || month.enabled) {
      const periodGoals = goalMain.createDiv({ cls: "wc-demo-goal-section" });
      periodGoals.createSpan({ cls: "wc-demo-goal-section-title", text: "累计写作目标" });
      if (week.enabled) this.renderGoalPeriodBar(periodGoals, "本周目标", week);
      if (month.enabled) this.renderGoalPeriodBar(periodGoals, "本月目标", month);
    }

    if (daily.enabled) {
      const dailyHistory = goalMain.createDiv({ cls: "wc-demo-goal-section" });
      dailyHistory.createSpan({ cls: "wc-demo-goal-section-title", text: "每日目标达成" });
      this.renderWeekOverview(dailyHistory, snapshot, metric, daily.target, today);
      const goalAside = goalLayout.createDiv({ cls: "wc-demo-goal-aside" });
      this.renderMonthCheckin(goalAside, snapshot, metric, daily.target, today);
    }
  }

  private renderGoalPeriodBar(container: HTMLElement, label: string, progress: GoalPeriodProgress): void {
    const row = container.createDiv({ cls: "wc-demo-goal-period" });
    if (progress.achieved) row.addClass("is-achieved");
    const line = row.createDiv({ cls: "wc-demo-goal-period-line" });
    line.createSpan({ cls: "wc-demo-goal-period-label", text: label });
    line.createSpan({
      cls: "wc-demo-goal-period-value",
      text: `${formatMetricValue(progress.metric, progress.current)} / ${progress.target.toLocaleString("zh-CN")}`,
    });
    const track = row.createDiv({ cls: "wc-demo-goal-period-track" });
    track.createDiv({ cls: "wc-demo-goal-period-fill", attr: { style: `width: ${Math.round(progress.progress * 100)}%` } });
  }

  /** 近一周每日目标回顾：横向极细条状图，今天在最上方。 */
  private renderWeekOverview(
    container: HTMLElement,
    snapshot: DashboardSnapshot,
    metric: ActivityMetric,
    target: number,
    today: string,
  ): void {
    const block = container.createDiv({ cls: "wc-demo-goal-week" });
    block.createSpan({ cls: "wc-demo-goal-kicker", text: "近一周回顾" });
    // 今天在最上方：computeGoalHistory 返回旧→新，反转为新→旧
    const history = computeGoalHistory(snapshot, metric, target, today, 7).reverse();
    const rows = block.createDiv({ cls: "wc-demo-goal-hbars" });
    for (const day of history) {
      const percent = Math.round(day.progress * 100);
      const row = rows.createDiv({
        cls: [
          "wc-demo-goal-hbar-row",
          day.achieved ? "is-achieved" : "",
          day.date === today ? "is-today" : "",
        ].filter(Boolean).join(" "),
      });
      row.createSpan({ cls: "wc-demo-goal-hbar-day", text: shortDate(day.date) });
      const track = row.createDiv({ cls: "wc-demo-goal-hbar-track" });
      track.createDiv({ cls: "wc-demo-goal-hbar-fill", attr: { style: `width: ${percent}%` } });
      row.createSpan({ cls: "wc-demo-goal-hbar-value", text: `${percent}%` });
      bindLightTooltip(row, this.contentEl, () => [
        day.date,
        `当日 ${formatMetricValue(metric, day.value)} / 目标 ${day.target.toLocaleString("zh-CN")}`,
        day.achieved ? "已达成" : "未达标",
      ]);
    }
  }

  /** 月度完成情况：带摘要、图例和日期编号的每日目标打卡。 */
  private renderMonthCheckin(
    container: HTMLElement,
    snapshot: DashboardSnapshot,
    metric: ActivityMetric,
    target: number,
    today: string,
  ): void {
    const block = container.createDiv({ cls: "wc-demo-goal-checkin-block" });
    const data = computeMonthCheckins(snapshot, metric, target, today);
    const achievedDays = data.days.filter((day) => day.isPast && day.achieved).length;

    const head = block.createDiv({ cls: "wc-demo-goal-checkin-head" });
    const title = head.createDiv({ cls: "wc-demo-goal-checkin-title" });
    const titleIcon = title.createSpan({ attr: { "aria-hidden": "true" } });
    setIcon(titleIcon, "calendar-days");
    title.createEl("h3", { text: "本月打卡" });
    head.createSpan({ cls: "wc-demo-goal-checkin-summary", text: `达标 ${achievedDays} 天` });

    const legend = block.createDiv({ cls: "wc-demo-goal-checkin-legend", attr: { "aria-label": "打卡图例" } });
    for (const [label, state] of [["已达标", "is-achieved"], ["未达标", "is-empty"], ["今天", "is-today"]] as const) {
      const item = legend.createSpan({ cls: "wc-demo-goal-checkin-legend-item" });
      item.createSpan({ cls: `wc-demo-goal-checkin-legend-dot ${state}`, attr: { "aria-hidden": "true" } });
      item.createSpan({ text: label });
    }

    const progress = block.createDiv({ cls: "wc-demo-goal-checkin-progress" });
    const track = progress.createDiv({ cls: "wc-demo-goal-checkin-progress-track" });
    track.createDiv({
      cls: "wc-demo-goal-checkin-progress-fill",
      attr: { style: `width: ${Math.round((achievedDays / Math.max(data.days.length, 1)) * 100)}%` },
    });
    progress.createSpan({ text: `${achievedDays} / ${data.days.length} 天` });

    const grid = block.createDiv({ cls: "wc-demo-goal-checkin", attr: { role: "grid", "aria-label": "本月每日目标打卡" } });
    for (const day of data.days) {
      const item = grid.createDiv({ cls: "wc-demo-goal-checkin-item" });
      item.createSpan({ cls: "wc-demo-goal-checkin-day-number", text: String(Number(day.date.slice(-2))) });
      if (!day.isPast) {
        item.createSpan({ cls: "wc-demo-goal-checkin-day is-future", attr: { "aria-hidden": "true" } });
        continue;
      }
      const cell = item.createEl("button", {
        cls: [
          "wc-demo-goal-checkin-day",
          day.achieved ? "is-achieved" : "",
          day.date === today ? "is-today" : "",
        ].filter(Boolean).join(" "),
        attr: {
          type: "button",
          role: "gridcell",
          "aria-current": day.date === today ? "date" : "false",
          "data-date": day.date,
        },
      });
      cell.createSpan({
        cls: "wc-visually-hidden",
        text: `${day.date} 当日 ${formatMetricValue(metric, day.value)} / 目标 ${target.toLocaleString("zh-CN")}，${day.achieved ? "已达成" : "未达标"}`,
      });
      bindLightTooltip(cell, this.contentEl, () => [
        day.date,
        `当日 ${formatMetricValue(metric, day.value)} / 目标 ${target.toLocaleString("zh-CN")}`,
        day.achieved ? "已达成" : "未达标",
      ]);
    }
  }

  private renderFooterNote(container: HTMLElement): void {
    container.createDiv({
      cls: "wc-demo-footer-note",
      text: `v${this.host.version} · 字数活动来自本地账本；专注时间只在主动开启番茄钟时记录。`,
    });
  }
}
