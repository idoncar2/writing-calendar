import type { App } from "obsidian";

import type { WritingCalendarRuntime } from "../service/runtime";
import type { WritingCalendarSettings } from "../settings/model";
import type { FocusController } from "../focus/controller";
import type { FocusSessionRecord } from "../focus/types";

export interface WritingCalendarViewHost {
  app: App;
  runtime: WritingCalendarRuntime;
  settings: WritingCalendarSettings;
  focusController: FocusController;
  /** 插件版本号（来自 manifest），用于在界面上标注当前运行版本 */
  version: string;
  openWorkbench(date?: string): Promise<void>;
  openFocusView(): Promise<void>;
  getFocusRecords(): readonly FocusSessionRecord[];
  subscribeFocusRecords(listener: () => void): () => void;
  openSettings(): void;
  openDiagnostics(): Promise<void>;
}
