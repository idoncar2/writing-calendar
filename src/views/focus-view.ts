import { ItemView, WorkspaceLeaf } from "obsidian";
import { localizeRoot, t } from "../i18n";

import { applyViewAccent } from "./components";
import type { WritingCalendarViewHost } from "./host";
import { renderFocusTimer } from "./focus-components";

export const WRITING_CALENDAR_FOCUS_VIEW_TYPE = "writing-calendar-focus";

/** Independent sidebar view backed by the same controller as the calendar module. */
export class WritingCalendarFocusView extends ItemView {
  private unsubscribe?: () => void;

  constructor(leaf: WorkspaceLeaf, private readonly host: WritingCalendarViewHost) {
    super(leaf);
  }

  getViewType(): string {
    return WRITING_CALENDAR_FOCUS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("专注计时");
  }

  getIcon(): string {
    return "timer";
  }

  async onOpen(): Promise<void> {
    this.unsubscribe = this.host.focusController.subscribe(() => this.render());
    this.render();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("wc-view", "wc-focus-view");
    localizeRoot(container);
    applyViewAccent(container, this.host.settings.colorSource, this.host.settings.customColor);
    renderFocusTimer(container, this.host, { compact: false });
  }
}
