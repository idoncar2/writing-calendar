import { MarkdownView, Notice, Plugin, TFile, TFolder, type WorkspaceLeaf } from "obsidian";
import { disposeI18n, localizeRoot, setUiLanguage, t } from "./i18n";

import { FileExplorerCounts } from "./explorer-counts";
import { FileIndex, type SerializedFileIndex } from "./index/file-index";
import { FocusController } from "./focus/controller";
import { LocalDeviceIdentity } from "./focus/identity";
import { LocalFocusCheckpointStore } from "./focus/local-state";
import { mergeFocusSessions, type FocusMergeWarning } from "./focus/merge";
import { FocusStorage } from "./focus/storage";
import type { FocusSessionRecord } from "./focus/types";
import { activityCountsForMode } from "./ledger/types";
import {
  registerWritingModule,
  WRITING_CALENDAR_MODULE_META,
  type WritingToolsGlobal,
} from "./integration/module-api";
import { WritingCalendarRuntime } from "./service/runtime";
import { normalizeSettings, type WritingCalendarSettings } from "./settings/model";
import { WritingCalendarSettingTab } from "./settings/tab";
import { createActivityTrackingExtension } from "./tracking/codemirror";
import {
  WRITING_CALENDAR_VIEW_TYPE,
  WritingCalendarView,
} from "./views/calendar-view";
import type { WritingCalendarViewHost } from "./views/host";
import {
  WRITING_CALENDAR_WORKBENCH_VIEW_TYPE,
  WritingCalendarWorkbenchView,
} from "./views/workbench-view";
import { WRITING_CALENDAR_FOCUS_VIEW_TYPE, WritingCalendarFocusView } from "./views/focus-view";
import {
  WRITING_CALENDAR_DIAGNOSTICS_VIEW_TYPE,
  DataDiagnosticsView,
} from "./views/data-diagnostics-view";

interface PersistedPluginData {
  settings?: unknown;
  fileIndex?: SerializedFileIndex;
}

interface SettingsController {
  open(): void;
  openTabById(id: string): void;
}

function generatedId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

export default class WritingCalendarPlugin extends Plugin implements WritingCalendarViewHost {
  settings!: WritingCalendarSettings;
  runtime!: WritingCalendarRuntime;
  focusController!: FocusController;
  private fileIndex!: FileIndex;
  private focusStorage!: FocusStorage<FocusSessionRecord>;
  private focusCheckpointStore!: LocalFocusCheckpointStore;
  private focusRecords: FocusSessionRecord[] = [];
  private focusTickTimer?: number;
  private focusCheckpointTimer?: number;
  private focusReloadTimer?: number;
  private focusReloadGeneration = 0;
  private unsubscribeFocusActivity?: () => void;
  private readonly focusRecordsListeners = new Set<() => void>();
  private lastFocusEnabled = false;
  private lastFocusDisplayMode: WritingCalendarSettings["focusDisplayMode"] = "calendar";

  get version(): string {
    return this.manifest.version;
  }
  private statusBar?: HTMLElement;
  private saveQueue: Promise<void> = Promise.resolve();
  private unregisterModule?: () => void;
  private unsubscribeStatus?: () => void;
  private unsubscribeExplorer?: () => void;
  private explorerCounts!: FileExplorerCounts;

  async onload(): Promise<void> {
    const persisted = ((await this.loadData()) ?? {}) as PersistedPluginData & Record<string, unknown>;
    this.settings = normalizeSettings(persisted.settings ?? persisted);
    setUiLanguage(this.settings.uiLanguage);
    this.settings.deviceId = new LocalDeviceIdentity(this.app.vault.getName()).getOrCreate(() => generatedId("device"));
    this.fileIndex = FileIndex.from(persisted.fileIndex, () => generatedId("file"));
    this.focusCheckpointStore = new LocalFocusCheckpointStore(this.app.vault.getName());
    this.focusStorage = new FocusStorage(this.app.vault.adapter, this.settings.dataFolder);
    this.focusController = new FocusController({
      deviceId: this.settings.deviceId,
      activeGraceMs: this.settings.focusIdleThresholdMs,
      recordShortSessions: this.settings.focusRecordShortSessions,
      createId: () => generatedId("focus"),
      onSessionEnded: (record) => this.recordFocusSession(record),
      onShortSessionDiscarded: () => {
        this.focusCheckpointStore.clear();
        new Notice(t("专注不足 1 分钟，本次不记录"));
      },
    });
    this.runtime = new WritingCalendarRuntime({
      app: this.app,
      settings: this.settings,
      fileIndex: this.fileIndex,
      saveLocalState: () => this.saveLocalState(),
    });

    this.registerView(WRITING_CALENDAR_VIEW_TYPE, (leaf) => new WritingCalendarView(leaf, this));
    this.registerView(
      WRITING_CALENDAR_WORKBENCH_VIEW_TYPE,
      (leaf) => new WritingCalendarWorkbenchView(leaf, this),
    );
    this.registerView(WRITING_CALENDAR_FOCUS_VIEW_TYPE, (leaf) => new WritingCalendarFocusView(leaf, this));
    this.registerView(
      WRITING_CALENDAR_DIAGNOSTICS_VIEW_TYPE,
      (leaf) => new DataDiagnosticsView(leaf, this),
    );
    this.addSettingTab(new WritingCalendarSettingTab(this.app, this, this));
    this.addCommand({
      id: "open-writing-calendar",
      name: t("打开写作日历"),
      callback: () => void this.openCalendar(),
    });
    this.addCommand({
      id: "open-writing-statistics-workbench",
      name: t("打开统计工作台"),
      callback: () => void this.openWorkbench(),
    });
    this.addCommand({
      id: "open-focus-timer",
      name: t("打开专注计时"),
      callback: () => void this.openFocusView(),
    });
    this.addCommand({
      id: "rescan-writing-statistics",
      name: t("重新扫描当前文件统计"),
      callback: () => void this.runtime.scanAllFiles(),
    });

    this.registerEditorExtension(
      createActivityTrackingExtension((activity, editorView) => {
        if (!editorView.hasFocus) return;
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView?.file) return;
        void this.runtime.recordActivity(markdownView.file, activity);
      }),
    );
    this.registerVaultEvents();
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("wc-status-bar");
    localizeRoot(this.statusBar);
    this.statusBar.setAttribute("role", "button");
    this.statusBar.tabIndex = 0;
    this.statusBar.addEventListener("click", () => void this.openWorkbench());
    this.statusBar.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void this.openWorkbench();
    });

    await this.runtime.initialize();
    const loadedFocus = await this.focusStorage.loadSessions();
    this.focusRecords = this.mergeFocusRecords(loadedFocus.records);
    if (loadedFocus.warnings.length > 0) {
      new Notice(t(`写作日历：已跳过 ${loadedFocus.warnings.length} 条损坏的专注记录。`));
    }
    const localCheckpoint = this.focusCheckpointStore.load();
    if (localCheckpoint) this.focusController.recover(localCheckpoint);
    this.focusCheckpointStore.clear();
    this.unsubscribeFocusActivity = this.runtime.subscribeActivity((event) => {
      if (!this.settings.focusEnabled) return;
      const countMode = this.focusController.getCountMode();
      if (!countMode) return;
      const counts = activityCountsForMode(event, countMode);
      const input = counts.typed + counts.paste + counts.otherInserted;
      this.focusController.recordActivity(input, input - counts.deleted, new Date(event.timestamp).getTime());
    });
    this.lastFocusEnabled = this.settings.focusEnabled;
    this.lastFocusDisplayMode = this.settings.focusDisplayMode;
    this.startFocusTimers();
    this.registerFocusWindowEvents();
    this.unsubscribeStatus = this.runtime.subscribe(() => {
      this.updateStatusBar();
      this.reconcileFocusSettings();
    });
    this.updateStatusBar();
    // 左侧文件列表字数角标：跟随布局变化与扫描完成刷新
    this.explorerCounts = new FileExplorerCounts(this.app, this.settings, this.runtime);
    this.registerEvent(this.app.workspace.on("layout-change", () => this.explorerCounts.refresh()));
    this.unsubscribeExplorer = this.runtime.subscribe(() => this.explorerCounts.refresh());
    this.registerModuleApi();
    this.app.workspace.onLayoutReady(() => {
      this.explorerCounts.refresh();
      if (
        this.settings.focusEnabled &&
        this.settings.focusDisplayMode === "sidebar" &&
        this.app.workspace.getLeavesOfType(WRITING_CALENDAR_FOCUS_VIEW_TYPE).length === 0
      ) {
        void this.openFocusView();
      }
      if (this.app.workspace.getLeavesOfType(WRITING_CALENDAR_VIEW_TYPE).length > 0) return;
      // 布局里没有日历视图：可能是首次启用，也可能是上次启动失败/同步异常导致视图丢失。
      // 无论 sidebarIntroduced 处于什么状态都恢复日历，避免侧栏日历永久消失。
      void this.openCalendar().then(async () => {
        this.settings.sidebarIntroduced = true;
        await this.saveLocalState();
      });
    });
  }

  onunload(): void {
    if (this.focusTickTimer !== undefined) window.clearInterval(this.focusTickTimer);
    if (this.focusCheckpointTimer !== undefined) window.clearInterval(this.focusCheckpointTimer);
    if (this.focusReloadTimer !== undefined) window.clearTimeout(this.focusReloadTimer);
    this.unsubscribeFocusActivity?.();
    this.focusController?.end("shutdown", Date.now());
    this.focusCheckpointStore?.clear();
    this.unregisterModule?.();
    this.unsubscribeStatus?.();
    this.unsubscribeExplorer?.();
    this.explorerCounts?.clear();
    this.runtime?.dispose();
    disposeI18n();
  }

  async openCalendar(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(WRITING_CALENDAR_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf("split", "vertical");
      await leaf.setViewState({ type: WRITING_CALENDAR_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async openWorkbench(date?: string): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(WRITING_CALENDAR_WORKBENCH_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: WRITING_CALENDAR_WORKBENCH_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (date && leaf.view instanceof WritingCalendarWorkbenchView) leaf.view.focusDate(date);
  }

  async openDiagnostics(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(WRITING_CALENDAR_DIAGNOSTICS_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: WRITING_CALENDAR_DIAGNOSTICS_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  async openFocusView(): Promise<void> {
    if (!this.settings.focusEnabled) {
      new Notice(t("请先在写作日历设置中启用番茄钟。"), 5000);
      return;
    }
    let leaf = this.app.workspace.getLeavesOfType(WRITING_CALENDAR_FOCUS_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf("split", "vertical");
      await leaf.setViewState({ type: WRITING_CALENDAR_FOCUS_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  getFocusRecords(): readonly FocusSessionRecord[] {
    return this.focusRecords;
  }

  subscribeFocusRecords(listener: () => void): () => void {
    this.focusRecordsListeners.add(listener);
    return () => this.focusRecordsListeners.delete(listener);
  }

  openSettings(): void {
    const setting = (this.app as typeof this.app & { setting: SettingsController }).setting;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  private registerVaultEvents(): void {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) this.runtime.scheduleFileScan(file);
        if (this.focusDataPath(file.path)) this.scheduleFocusReload();
      }),
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) this.runtime.scheduleFileScan(file);
        else if (this.runtime.isDataPath(file.path)) this.runtime.scheduleSyncedDataReload();
        else if (file instanceof TFolder) {
          void this.runtime.scanAllFiles().catch((error) => console.error("写作日历：文件夹创建后扫描失败", error));
        }
        if (this.focusDataPath(file.path)) this.scheduleFocusReload();
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFile) this.runtime.handleRename(file, oldPath);
        else if (file instanceof TFolder) {
          void this.runtime.handleFolderRename(oldPath, file.path).catch((error) => {
            console.error("写作日历：文件夹改名处理失败", error);
          });
        }
        else if (this.runtime.isDataPath(oldPath) || this.runtime.isDataPath(file.path)) this.runtime.scheduleSyncedDataReload();
        if (this.focusDataPath(oldPath) || this.focusDataPath(file.path)) this.scheduleFocusReload();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) this.runtime.handleDelete(file);
        else if (this.runtime.isDataPath(file.path)) this.runtime.scheduleSyncedDataReload();
        else if (file instanceof TFolder) {
          void this.runtime.scanAllFiles().catch((error) => console.error("写作日历：文件夹删除后扫描失败", error));
        }
        if (this.focusDataPath(file.path)) this.scheduleFocusReload();
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => this.runtime.scheduleFileScan(file)),
    );
  }

  private registerFocusWindowEvents(): void {
    const setAway = (away: boolean) => {
      if (this.settings.focusEnabled) this.focusController.setAway(away, Date.now());
    };
    this.registerDomEvent(window, "blur", () => setAway(true));
    this.registerDomEvent(window, "focus", () => setAway(false));
    this.registerDomEvent(document, "visibilitychange", () => setAway(document.hidden));
  }

  private startFocusTimers(): void {
    this.focusTickTimer = window.setInterval(() => {
      if (this.settings.focusEnabled) this.focusController.tick(Date.now());
    }, 1_000);
    this.focusCheckpointTimer = window.setInterval(() => {
      if (!this.settings.focusEnabled) return;
      const checkpoint = this.focusController.checkpoint(Date.now());
      if (checkpoint) this.focusCheckpointStore.save(checkpoint);
      else this.focusCheckpointStore.clear();
    }, 30_000);
  }

  private reconcileFocusSettings(): void {
    this.focusController.setActiveGrace(this.settings.focusIdleThresholdMs);
    this.focusController.setRecordShortSessions(this.settings.focusRecordShortSessions);
    if (this.lastFocusEnabled && !this.settings.focusEnabled) {
      this.focusController.end("plugin-disabled", Date.now());
      this.focusCheckpointStore.clear();
      for (const leaf of this.app.workspace.getLeavesOfType(WRITING_CALENDAR_FOCUS_VIEW_TYPE)) leaf.detach();
    }
    if (
      this.settings.focusEnabled &&
      this.settings.focusDisplayMode === "sidebar" &&
      (!this.lastFocusEnabled || this.lastFocusDisplayMode !== "sidebar")
    ) {
      void this.openFocusView();
    }
    if (
      this.settings.focusDisplayMode === "calendar" &&
      this.lastFocusDisplayMode === "sidebar"
    ) {
      for (const leaf of this.app.workspace.getLeavesOfType(WRITING_CALENDAR_FOCUS_VIEW_TYPE)) leaf.detach();
    }
    this.lastFocusEnabled = this.settings.focusEnabled;
    this.lastFocusDisplayMode = this.settings.focusDisplayMode;
  }

  private async recordFocusSession(record: FocusSessionRecord): Promise<void> {
    this.focusCheckpointStore.clear();
    if (this.focusRecords.some((item) => item.id === record.id)) return;
    this.focusRecords = this.mergeFocusRecords([...this.focusRecords, record]);
    this.notifyFocusRecords();
    try {
      await this.focusStorage.appendSession(record);
      await this.saveLocalState();
    } catch (error) {
      console.error("写作日历：保存专注记录失败", error);
      new Notice(t("专注记录保存失败，请检查数据目录。"), 8000);
    }
  }

  private mergeFocusRecords(records: readonly FocusSessionRecord[]): FocusSessionRecord[] {
    return mergeFocusSessions(records, (warning) => this.warnFocusMerge(warning));
  }

  private warnFocusMerge(warning: FocusMergeWarning): void {
    console.warn(`写作日历：${warning.message}`);
  }

  private notifyFocusRecords(): void {
    for (const listener of this.focusRecordsListeners) listener();
  }

  private focusDataPath(path: string): boolean {
    const root = `${this.settings.dataFolder}/focus`;
    return path === root || path.startsWith(`${root}/`);
  }

  private scheduleFocusReload(): void {
    if (!this.focusStorage) return;
    if (this.focusReloadTimer !== undefined) window.clearTimeout(this.focusReloadTimer);
    this.focusReloadTimer = window.setTimeout(() => {
      this.focusReloadTimer = undefined;
      void this.reloadFocusSessions().catch((error) => {
        console.error("写作日历：重新读取专注记录失败", error);
      });
    }, 800);
  }

  private async reloadFocusSessions(): Promise<void> {
    const generation = ++this.focusReloadGeneration;
    const loaded = await this.focusStorage.loadSessions();
    if (generation !== this.focusReloadGeneration) return;
    this.focusRecords = this.mergeFocusRecords(loaded.records);
    for (const warning of loaded.warnings) {
      console.warn(`写作日历：跳过损坏的专注记录（${warning.path}:${warning.line}）：${warning.message}`);
    }
    this.notifyFocusRecords();
  }

  private updateStatusBar(): void {
    if (!this.statusBar) return;
    if (!this.settings.showStatusBar) {
      this.statusBar.hide();
      return;
    }
    const today = this.runtime.getDashboard().today;
    this.statusBar.show();
    this.statusBar.setText(`今日输入 ${today.manual.toLocaleString("zh-CN")} · 净增 ${today.net > 0 ? "+" : ""}${today.net.toLocaleString("zh-CN")}`);
    this.statusBar.setAttribute("aria-label", `打开写作统计工作台。今日手动输入 ${today.manual} 字，净增 ${today.net} 字。`);
  }

  private registerModuleApi(): void {
    const host = window as Window & WritingToolsGlobal;
    this.unregisterModule = registerWritingModule(host, {
      meta: WRITING_CALENDAR_MODULE_META,
      scopes: {
        protocolVersion: 1,
        getDefinitions: () => this.runtime
          .getProjects()
          .flatMap((project) => project.definition ? [project.definition] : []),
        saveDefinition: (definition) => this.runtime.saveProject(definition),
      },
      getProjects: () => this.runtime.getProjects(),
      getDashboard: () => this.runtime.getDashboard(),
      subscribe: (listener) => this.runtime.subscribe(listener),
      openCalendar: () => this.openCalendar(),
      openWorkbench: (date) => this.openWorkbench(date),
      saveProject: (definition) => this.runtime.saveProject(definition),
    });
  }

  private saveLocalState(): Promise<void> {
    const persist = async (): Promise<void> => {
      // The device identity and running focus checkpoint are local-only. Keep
      // the legacy settings field blank so synced plugin data cannot assign an
      // identity to another machine.
      const settings = { ...this.settings, deviceId: "" };
      await this.saveData({ settings, fileIndex: this.fileIndex.serialize() });
    };
    const task = this.saveQueue.then(persist, persist);
    this.saveQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}
