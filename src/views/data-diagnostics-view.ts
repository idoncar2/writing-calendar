import { ItemView, Notice, setIcon, WorkspaceLeaf } from "obsidian";

import {
  formatDiagnosticReport,
  type DataDiagnosticSnapshot,
  type DiagnosticDevice,
  type DiagnosticFileChange,
} from "../diagnostics/model";
import { applyViewAccent } from "./components";
import type { WritingCalendarViewHost } from "./host";

export const WRITING_CALENDAR_DIAGNOSTICS_VIEW_TYPE = "writing-calendar-diagnostics";

type DiagnosticStatus = "ok" | "info" | "warning" | "error";

function number(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatDateTime(value: string | null): string {
  if (!value) return "尚未读取";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  ) return time;
  return `${date.toLocaleDateString("zh-CN")} ${time}`;
}

function statusIcon(status: DiagnosticStatus): string {
  if (status === "error") return "circle-x";
  if (status === "warning") return "alert-triangle";
  if (status === "info") return "info";
  return "circle-check";
}

function staleDeviceText(device: DiagnosticDevice): string {
  return `${device.label}设备 ${device.daysSinceLastEvent ?? 0} 天没有新记录`;
}

function changeLabel(change: DiagnosticFileChange): string {
  if (change.kind === "decreased") return "字数减少";
  if (change.kind === "deleted") return "文件消失";
  if (change.kind === "added") return "新增文件";
  return "改名/移动";
}

function changeIcon(change: DiagnosticFileChange): string {
  if (change.kind === "decreased") return "trending-down";
  if (change.kind === "deleted") return "file-minus";
  if (change.kind === "added") return "file-plus";
  return "move";
}

function changeStatus(change: DiagnosticFileChange): DiagnosticStatus {
  return change.kind === "decreased" || change.kind === "deleted" ? "warning" : "info";
}

function changeDetail(change: DiagnosticFileChange): string | undefined {
  if (change.kind === "decreased") {
    return `${number(change.previousValue ?? 0)} → ${number(change.currentValue ?? 0)}（变化 ${number(change.delta ?? 0)}）`;
  }
  if (change.kind === "deleted") return `上次：${number(change.previousValue ?? 0)} 字`;
  if (change.kind === "added") return `${number(change.currentValue ?? 0)} 字`;
  return `${change.previousPath ?? "未知路径"} → ${change.path}`;
}

export class DataDiagnosticsView extends ItemView {
  private unsubscribe?: () => void;
  private snapshot?: DataDiagnosticSnapshot;
  private loading = false;
  private errorMessage?: string;
  private feedback?: string;

  constructor(leaf: WorkspaceLeaf, private readonly host: WritingCalendarViewHost) {
    super(leaf);
  }

  getViewType(): string {
    return WRITING_CALENDAR_DIAGNOSTICS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "数据诊断";
  }

  getIcon(): string {
    return "shield-check";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.host.runtime.subscribe(() => this.render());
    this.snapshot = this.host.runtime.getDataDiagnostics();
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("wc-view", "wc-diagnostics-view");
    container.setAttribute("aria-busy", String(this.loading));
    applyViewAccent(container, this.host.settings.colorSource, this.host.settings.customColor);

    const inner = container.createDiv({ cls: "wc-diagnostics-inner" });
    const header = inner.createEl("header", { cls: "wc-diagnostics-header" });
    const titleGroup = header.createDiv({ cls: "wc-diagnostics-title-group" });
    titleGroup.createEl("h1", { text: "数据诊断" });
    titleGroup.createDiv({
      cls: "wc-diagnostics-subtitle",
      text: "只检查统计数据状态，不修改历史账本。",
    });
    const actions = header.createDiv({ cls: "wc-diagnostics-actions" });
    const refresh = actions.createEl("button", {
      cls: "mod-cta wc-diagnostics-refresh",
      attr: { type: "button", "aria-label": "重新检查数据" },
    });
    const refreshIcon = refresh.createSpan({ cls: "wc-diagnostics-refresh-icon", attr: { "aria-hidden": "true" } });
    setIcon(refreshIcon, "refresh-cw");
    refresh.createSpan({ text: this.loading ? "检查中…" : "重新检查" });
    refresh.disabled = this.loading;
    refresh.addEventListener("click", () => void this.refresh());

    const baseline = actions.createEl("button", {
      cls: "wc-diagnostics-secondary-action",
      attr: { type: "button", "aria-label": "设为当前诊断基线" },
    });
    const baselineIcon = baseline.createSpan({ cls: "wc-diagnostics-action-icon", attr: { "aria-hidden": "true" } });
    setIcon(baselineIcon, this.snapshot?.baseline ? "bookmark-check" : "bookmark-plus");
    baseline.createSpan({ text: this.snapshot?.baseline ? "设为当前基线" : "建立当前基线" });
    baseline.disabled = this.loading || !this.snapshot;
    baseline.addEventListener("click", () => this.saveBaseline());

    const copy = actions.createEl("button", {
      cls: "wc-diagnostics-secondary-action",
      attr: { type: "button", "aria-label": "复制诊断报告" },
    });
    const copyIcon = copy.createSpan({ cls: "wc-diagnostics-action-icon", attr: { "aria-hidden": "true" } });
    setIcon(copyIcon, "copy");
    copy.createSpan({ text: "复制诊断报告" });
    copy.disabled = this.loading || !this.snapshot;
    copy.addEventListener("click", () => void this.copyReport());

    const status = inner.createDiv({ cls: "wc-diagnostics-live-status", attr: { role: "status", "aria-live": "polite" } });
    if (this.loading) status.setText("正在读取同步数据并扫描当前文件…");
    else if (this.errorMessage) status.setText(`检查失败：${this.errorMessage}`);
    else if (this.feedback) status.setText(this.feedback);

    if (!this.snapshot) {
      inner.createDiv({ cls: "wc-diagnostics-empty", text: "正在准备数据诊断…" });
      return;
    }

    const snapshot = this.snapshot;
    const meta = inner.createDiv({ cls: "wc-diagnostics-meta" });
    meta.createSpan({ text: `上次检查：${formatDateTime(snapshot.checkedAt)}` });
    meta.createSpan({
      text: snapshot.baseline
        ? `诊断基线：${formatDateTime(new Date(snapshot.baseline.createdAt).toISOString())}`
        : "暂无诊断基线",
    });
    meta.createSpan({ text: `数据目录：${snapshot.dataFolder.path}` });

    this.renderGroup(inner, "数据读取", [
      {
        label: "数据目录",
        value: snapshot.dataFolder.status === "missing" || snapshot.dataFolder.paused ? "缺失或已暂停" : "正常",
        status: snapshot.dataFolder.status === "missing" || snapshot.dataFolder.paused ? "error" : "ok",
        detail: snapshot.dataFolder.status === "missing" ? "请先完成同步，或在设置中确认新建数据目录。" : undefined,
      },
      {
        label: "最近一次读取",
        value: formatDateTime(snapshot.lastReadAt),
        status: snapshot.lastReadAt ? "ok" : "warning",
      },
      { label: "当前设备", value: snapshot.currentDevice.label, status: "ok" },
      { label: "已发现设备", value: `${snapshot.deviceCount} 个`, status: "ok" },
      { label: "写作记录", value: `${number(snapshot.ledger.eventCount)} 条`, status: "ok" },
    ]);

    const warningDetails = snapshot.ledger.warnings
      .slice(0, 3)
      .map((warning) => `${warning.path}${warning.line === undefined ? "" : `:${warning.line}`}：${warning.message}`)
      .join("\n");
    const indexDetails = snapshot.fileIndex.issues.slice(0, 3).join("\n");
    this.renderGroup(inner, "数据完整性", [
      {
        label: "重复 eventId",
        value: snapshot.ledger.duplicateEventIds.length === 0
          ? "未发现重复 eventId"
          : `发现 ${snapshot.ledger.duplicateEventIds.length} 个重复 eventId`,
        status: snapshot.ledger.duplicateEventIds.length === 0 ? "ok" : "error",
      },
      {
        label: "JSONL",
        value: snapshot.ledger.warnings.length === 0
          ? "未发现损坏 JSONL"
          : `${snapshot.ledger.warnings.length} 条记录无法读取`,
        status: snapshot.ledger.warnings.length === 0 ? "ok" : "error",
        detail: warningDetails || undefined,
      },
      {
        label: "文件索引",
        value: snapshot.fileIndex.healthy
          ? "当前文件索引正常"
          : `发现 ${snapshot.fileIndex.issues.length} 个索引问题`,
        status: snapshot.fileIndex.healthy ? "ok" : "error",
        detail: indexDetails || undefined,
      },
    ]);

    this.renderComparison(inner, snapshot);

    const reminders = [] as Array<{ label: string; value: string; detail?: string; status: DiagnosticStatus }>;
    if (snapshot.deletedFileCount > 0) {
      reminders.push({
        label: "已删除文件",
        value: `${snapshot.deletedFileCount} 个文件已删除`,
        detail: "当前总字数已移除，历史写作记录仍然保留。",
        status: "warning",
      });
    }
    if (snapshot.aliasedFileCount > 0) {
      reminders.push({
        label: "历史别名",
        value: `${snapshot.aliasedFileCount} 个文件有历史别名`,
        detail: "这通常表示文件曾经被改名或移动。",
        status: "warning",
      });
    }
    for (const device of snapshot.staleDevices) {
      reminders.push({ label: "设备记录", value: staleDeviceText(device), status: "warning" });
    }
    if (reminders.length === 0) {
      const section = inner.createEl("section", { cls: "wc-diagnostics-group wc-diagnostics-reminders", attr: { "aria-label": "需要注意" } });
      section.createEl("h2", { text: "需要注意" });
      section.createDiv({ cls: "wc-diagnostics-empty", text: "当前未发现明显异常。" });
    } else {
      this.renderGroup(inner, "需要注意", reminders);
    }
  }

  private renderComparison(container: HTMLElement, snapshot: DataDiagnosticSnapshot): void {
    const comparison = snapshot.comparison;
    if (!comparison.hasBaseline) {
      this.renderGroup(container, "基线对比", [
        { label: "当前文件", value: `${number(comparison.currentFileCount)} 个`, status: "ok" },
        { label: "当前字数", value: `${number(comparison.currentTotal)} 字`, status: "ok" },
        {
          label: "诊断基线",
          value: "暂无诊断基线",
          detail: "建立基线后，以后的检查可以发现文件和字数变化。",
          status: "info",
        },
      ]);
      return;
    }

    this.renderGroup(container, "基线对比", [
      { label: "当前文件", value: `${number(comparison.currentFileCount)} 个`, status: "ok" },
      { label: "基线文件", value: `${number(comparison.baselineFileCount ?? 0)} 个`, status: "ok" },
      {
        label: "字数减少",
        value: `${number(comparison.decreasedCount)} 个文件`,
        status: comparison.decreasedCount > 0 ? "warning" : "ok",
      },
      {
        label: "文件消失",
        value: `${number(comparison.deletedCount)} 个文件`,
        status: comparison.deletedCount > 0 ? "warning" : "ok",
      },
      { label: "新增文件", value: `${number(comparison.addedCount)} 个文件`, status: "info" },
      { label: "改名/移动", value: `${number(comparison.movedCount)} 个文件`, status: "info" },
    ]);

    if (comparison.changes.length === 0) {
      this.renderGroup(container, "变化详情", [
        { label: "检查结果", value: "未发现异常变化", status: "ok" },
      ]);
      return;
    }

    const visibleChanges = comparison.changes.slice(0, 100);
    this.renderGroup(
      container,
      "变化详情",
      visibleChanges.map((change) => ({
        label: changeLabel(change),
        value: change.path,
        detail: changeDetail(change),
        status: changeStatus(change),
        icon: changeIcon(change),
      })),
    );
    if (comparison.changes.length > visibleChanges.length) {
      const note = container.createDiv({ cls: "wc-diagnostics-change-overflow" });
      note.setText(`还有 ${number(comparison.changes.length - visibleChanges.length)} 项变化未在页面展开，复制报告可查看全部。`);
    }
  }

  private renderGroup(
    container: HTMLElement,
    title: string,
    rows: ReadonlyArray<{ label: string; value: string; detail?: string; status: DiagnosticStatus; icon?: string }>,
  ): void {
    const section = container.createEl("section", {
      cls: "wc-diagnostics-group",
      attr: { "aria-label": title },
    });
    section.createEl("h2", { text: title });
    const list = section.createDiv({ cls: "wc-diagnostics-list" });
    for (const row of rows) {
      const item = list.createDiv({ cls: `wc-diagnostics-row is-${row.status}` });
      const icon = item.createSpan({ cls: "wc-diagnostics-status-icon", attr: { "aria-hidden": "true" } });
      setIcon(icon, row.icon ?? statusIcon(row.status));
      const body = item.createDiv({ cls: "wc-diagnostics-row-body" });
      body.createSpan({ cls: "wc-diagnostics-row-label", text: row.label });
      body.createSpan({ cls: "wc-diagnostics-row-value", text: row.value });
      if (row.detail) body.createDiv({ cls: "wc-diagnostics-row-detail", text: row.detail });
    }
  }

  private async refresh(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.errorMessage = undefined;
    this.feedback = undefined;
    this.render();
    try {
      this.snapshot = await this.host.runtime.refreshDataDiagnostics();
      this.feedback = `检查完成：${formatDateTime(this.snapshot.checkedAt)}`;
      new Notice("数据诊断已完成");
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      new Notice("数据诊断失败，请稍后重试", 5000);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private saveBaseline(): void {
    if (this.loading || !this.snapshot) return;
    try {
      this.host.runtime.setDiagnosticBaseline();
      this.snapshot = this.host.runtime.getDataDiagnostics();
      this.feedback = "已将当前状态设为诊断基线";
      this.errorMessage = undefined;
      new Notice("已设为当前基线");
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      new Notice("保存诊断基线失败，请稍后重试", 5000);
    }
    this.render();
  }

  private async copyReport(): Promise<void> {
    if (this.loading || !this.snapshot) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("当前环境不支持剪贴板");
      await navigator.clipboard.writeText(formatDiagnosticReport(this.snapshot));
      this.feedback = "诊断报告已复制";
      this.errorMessage = undefined;
      new Notice("诊断报告已复制");
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
      new Notice("复制诊断报告失败，请稍后重试", 5000);
    }
    this.render();
  }
}
