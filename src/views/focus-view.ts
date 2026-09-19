import { isStatisticsViewVisible } from "./visibility";
import { ItemView, WorkspaceLeaf } from "obsidian";

import { applyViewAccent } from "./components";
import type { WritingCalendarViewHost } from "./host";
import { renderFocusTimer } from "./focus-components";

export const WRITING_CALENDAR_FOCUS_VIEW_TYPE = "writing-calendar-focus";

/** Independent sidebar view backed by the same controller as the calendar module. */
export class WritingCalendarFocusView extends ItemView {
  private unsubscribe?: () => void;
  private renderPending = false;

  constructor(leaf: WorkspaceLeaf, private readonly host: WritingCalendarViewHost) {
    super(leaf);
  }

  getViewType(): string {
    return WRITING_CALENDAR_FOCUS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "专注计时";
  }

  getIcon(): string {
    return "timer";
  }

  async onOpen(): Promise<void> {
    this.registerEvent(this.app.workspace.on("layout-change", () => this.onResize()));
    this.registerDomEvent(document, "visibilitychange", () => this.onResize());
    this.unsubscribe = this.host.focusController.subscribe(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
  }

  onResize(): void {
    if (this.renderPending) this.render();
  }

  private render(): void {
    if (!isStatisticsViewVisible(this.contentEl, this.leaf, this.app)) {
      this.renderPending = true;
      return;
    }
    this.renderPending = false;
    const container = this.contentEl;
    container.empty();
    container.addClass("wc-view", "wc-focus-view");
    applyViewAccent(container, this.host.settings.colorSource, this.host.settings.customColor);
    renderFocusTimer(container, this.host, { compact: false });
  }
}
