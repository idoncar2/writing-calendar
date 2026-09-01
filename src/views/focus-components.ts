import type { CountMode } from "../ledger/types";
import type { FocusSessionRecord, FocusSnapshot } from "../focus/types";
import type { WritingCalendarViewHost } from "./host";

export interface FocusTimerRenderOptions {
  /**
   * Compact mode is used below the calendar. The full mode is used by the
   * dedicated Focus View and keeps the same controller state and actions.
   */
  compact?: boolean;
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("zh-CN");
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}
const FOCUS_METRIC_TOOLTIPS: Record<string, string> = {
  "实际写作": "根据文字编辑活动估算",
  "空闲时间": "专注期间停留在 Obsidian，但较长时间没有编辑",
  "离开时间": "切出 Obsidian 或窗口不可见",
};

function countModeLabel(mode: CountMode): string {
  return mode === "body-characters" ? "正文字符" : "创作字数";
}

function endReasonLabel(record: FocusSessionRecord): string {
  switch (record.endReason) {
    case "completed":
      return "倒计时完成";
    case "manual":
      return "手动结束";
    case "shutdown":
      return "插件关闭时保存";
    case "plugin-disabled":
      return "关闭番茄钟时保存";
    case "recovered":
      return "从上次工作区恢复";
    default:
      return "已记录";
  }
}

function createButton(
  container: HTMLElement,
  text: string,
  onClick: () => void,
  className = "",
): HTMLButtonElement {
  const button = container.createEl("button", {
    cls: `wc-focus-action ${className}`.trim(),
    attr: { type: "button" },
    text,
  });
  button.addEventListener("click", onClick);
  return button;
}

function renderMetric(
  container: HTMLElement,
  label: string,
  value: string,
  className = "",
): void {
  const metric = container.createDiv({ cls: `wc-focus-metric ${className}`.trim() });
  const tooltip = FOCUS_METRIC_TOOLTIPS[label];
  if (tooltip) metric.setAttribute("title", tooltip);
  metric.createSpan({ cls: "wc-focus-metric-label", text: label });
  metric.createDiv({ cls: "wc-focus-metric-value", text: value });
}

function renderSessionMetrics(
  container: HTMLElement,
  session: NonNullable<FocusSnapshot["session"]>,
): void {
  const metrics = container.createDiv({ cls: "wc-focus-metrics" });
  renderMetric(metrics, "输入", `${formatNumber(session.inputCharacters)} 字`);
  renderMetric(metrics, "净增", `${formatSignedNumber(session.netCharacters)} 字`, session.netCharacters < 0 ? "is-negative" : "");
  renderMetric(metrics, "实际写作", formatDuration(session.activeMs));
  renderMetric(metrics, "空闲时间", formatDuration(session.idleMs), session.idleMs > 0 ? "is-muted" : "");
  renderMetric(metrics, "离开时间", formatDuration(session.awayMs), "is-muted");
}

function renderResult(
  container: HTMLElement,
  result: FocusSessionRecord,
  host: WritingCalendarViewHost,
): void {
  const summary = container.createDiv({ cls: "wc-focus-result" });
  summary.createDiv({ cls: "wc-focus-result-title", text: "本次专注已记录" });
  summary.createDiv({ cls: "wc-focus-result-note", text: `${endReasonLabel(result)} · ${countModeLabel(result.countMode)}` });
  renderSessionMetrics(summary, {
    inputCharacters: result.inputCharacters,
    netCharacters: result.netCharacters,
    activeMs: result.activeMs,
    idleMs: result.idleMs,
    awayMs: result.awayMs,
  });

  const actions = summary.createDiv({ cls: "wc-focus-actions" });
  if (host.settings.restDurationMs > 0) {
    createButton(actions, `开始休息 · ${formatDuration(host.settings.restDurationMs)}`, () => {
      host.focusController.startRest(host.settings.restDurationMs);
    }, "mod-cta");
  }
  createButton(actions, "再次开始", () => {
    host.focusController.startFocus(host.settings.focusDurationMs, host.settings.countMode);
  });
}

function renderRest(
  container: HTMLElement,
  snapshot: FocusSnapshot,
  host: WritingCalendarViewHost,
): void {
  container.createDiv({ cls: "wc-focus-status", text: "休息中" });
  const timer = container.createDiv({ cls: "wc-focus-countdown", text: formatClock(snapshot.remainingMs) });
  timer.setAttribute("role", "timer");
  timer.setAttribute("aria-label", `休息剩余 ${formatClock(snapshot.remainingMs)}`);
  const actions = container.createDiv({ cls: "wc-focus-actions" });
  createButton(actions, "跳过休息并开始专注", () => {
    host.focusController.startFocus(host.settings.focusDurationMs, host.settings.countMode);
  }, "mod-cta");
}

/**
 * Render the shared focus timer UI. Views own subscriptions; this function
 * only reads the controller snapshot and wires actions back to that controller.
 */
export function renderFocusTimer(
  container: HTMLElement,
  host: WritingCalendarViewHost,
  options: FocusTimerRenderOptions = {},
): void {
  const compact = options.compact ?? false;
  container.empty();
  if (!host.settings.focusEnabled) return;

  const snapshot = host.focusController.getSnapshot();
  const root = container.createDiv({
    cls: `wc-focus-timer${compact ? " is-compact" : " is-full"}`,
    attr: { role: "region", "aria-label": "专注计时" },
  });
  const header = root.createDiv({ cls: "wc-focus-header" });
  header.createDiv({ cls: "wc-focus-title", text: compact ? "专注计时" : "专注计时器" });
  if (snapshot.phase === "focus") header.createSpan({ cls: "wc-focus-state", text: "专注中" });
  else if (snapshot.phase === "paused") header.createSpan({ cls: "wc-focus-state", text: "已暂停" });
  else if (snapshot.phase === "rest") header.createSpan({ cls: "wc-focus-state", text: "休息中" });

  if (snapshot.phase === "rest") {
    renderRest(root, snapshot, host);
    return;
  }

  if (snapshot.phase === "result" && snapshot.lastResult) {
    renderResult(root, snapshot.lastResult, host);
    return;
  }

  const duration = snapshot.phase === "idle" ? host.settings.focusDurationMs : snapshot.remainingMs;
  const timer = root.createDiv({ cls: "wc-focus-countdown", text: formatClock(duration) });
  timer.setAttribute("role", "timer");
  timer.setAttribute("aria-label", `${snapshot.phase === "idle" ? "默认专注时长" : "专注剩余"} ${formatClock(duration)}`);

  if (snapshot.session) renderSessionMetrics(root, snapshot.session);
  else root.createDiv({ cls: "wc-focus-hint", text: `开始后统计输入、实际写作和空闲时间 · ${countModeLabel(host.settings.countMode)}` });

  const actions = root.createDiv({ cls: "wc-focus-actions" });
  if (snapshot.phase === "idle") {
    createButton(actions, "开始专注", () => {
      host.focusController.startFocus(host.settings.focusDurationMs, host.settings.countMode);
    }, "mod-cta");
  } else if (snapshot.phase === "paused") {
    createButton(actions, "继续", () => host.focusController.resume(), "mod-cta");
    createButton(actions, "结束", () => host.focusController.end("manual"));
  } else {
    createButton(actions, "暂停", () => host.focusController.pause());
    createButton(actions, "结束", () => host.focusController.end("manual"));
  }
}

