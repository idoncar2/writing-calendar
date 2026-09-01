import { App, getAllTags, Notice, Platform, TFile } from "obsidian";

import { countBodyCharacters, countCreativeWords, countMarkdown } from "../core/counting";
import {
  buildDataDiagnosticSnapshot,
  type DataDiagnosticSnapshot,
  type DiagnosticDeviceEvent,
  type DiagnosticDeviceMetadata,
  type DiagnosticLedgerInput,
  type DiagnosticBaseline,
  type DiagnosticFileSnapshot,
} from "../diagnostics/model";
import { LocalDiagnosticBaselineStore, type DiagnosticBaselineStore } from "../diagnostics/storage";
import { FileIndex } from "../index/file-index";
import { missingVaultPaths } from "../index/reconcile";
import { retryFailedItems } from "../index/scan";
import type { ActivityEvent } from "../ledger/types";
import { resolveProjectVersions, createProjectVersion, type ProjectVersionConflict, type ProjectVersionRecord } from "../projects/versions";
import type { ProjectDefinition, ProjectFilter } from "../projects/types";
import { isWorkspaceScopeId, WORKSPACE_SCOPE_NAME } from "../projects/workspace";
import type { DashboardSnapshot } from "../query/dashboard";
import type { WritingCalendarSettings } from "../settings/model";
import {
  CalendarStorage,
  type DataFolderStatus,
  type DeviceMetadataRecord,
  type LoadedEvents,
  type StorageWarning,
} from "../storage/calendar-storage";
import type { TrackedEditorActivity } from "../tracking/codemirror";
import { buildActivityEvent } from "./activity-event";
import { WritingCalendarEngine, type WritingProjectOption } from "./engine";

export interface RuntimeDiagnostic {
  severity: "info" | "warning" | "error";
  message: string;
  path?: string;
}

export interface RuntimeState {
  dataFolderStatus: DataFolderStatus;
  paused: boolean;
  lastLedgerRead: string;
  diagnostics: RuntimeDiagnostic[];
  projectConflicts: ProjectVersionConflict[];
}

export interface WritingCalendarRuntimeOptions {
  app: App;
  settings: WritingCalendarSettings;
  fileIndex: FileIndex;
  saveLocalState: () => Promise<void>;
  diagnosticBaselineStore?: DiagnosticBaselineStore;
}

function newId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function platformLabel(): string {
  if (Platform.isIosApp) return "iOS";
  if (Platform.isAndroidApp) return "Android";
  if (Platform.isMacOS) return "macOS";
  if (Platform.isWin) return "Windows";
  if (Platform.isLinux) return "Linux";
  return Platform.isMobile ? "Mobile" : "Desktop";
}

function serializableProperties(value: unknown, depth = 0): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) return {};
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
      result[key] = entry;
    } else if (Array.isArray(entry)) {
      result[key] = entry.filter(
        (item): item is string | number | boolean | null =>
          item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return result;
}

function emptyLedgerReport(): DiagnosticLedgerInput {
  return {
    fileCount: 0,
    eventCount: 0,
    rawEventCount: 0,
    duplicateEventIds: [],
    warnings: [],
    deviceEvents: [],
  };
}

function diagnosticLedgerReport(loaded: LoadedEvents): DiagnosticLedgerInput {
  return {
    fileCount: loaded.files.length,
    eventCount: loaded.events.length,
    rawEventCount: loaded.rawEventCount,
    duplicateEventIds: loaded.duplicateEventIds,
    warnings: loaded.warnings.map((warning) => ({
      path: warning.path,
      ...(warning.line === undefined ? {} : { line: warning.line }),
      message: warning.message,
    })),
    deviceEvents: loaded.events.map<DiagnosticDeviceEvent>((event) => ({
      deviceId: event.deviceId,
      timestamp: event.timestamp,
    })),
  };
}

function diagnosticDevices(records: readonly DeviceMetadataRecord[]): DiagnosticDeviceMetadata[] {
  return records.map((record) => ({
    deviceId: record.deviceId,
    ...(record.userAgent === undefined ? {} : { userAgent: record.userAgent }),
  }));
}

export class WritingCalendarRuntime {
  private storage: CalendarStorage;
  private readonly engine: WritingCalendarEngine;
  private events: ActivityEvent[] = [];
  private projectVersions: ProjectVersionRecord[] = [];
  private ledgerReport: DiagnosticLedgerInput = emptyLedgerReport();
  private deviceMetadata: DiagnosticDeviceMetadata[] = [];
  private readonly diagnosticBaselineStore: DiagnosticBaselineStore;
  private diagnosticBaseline: DiagnosticBaseline | null;
  private diagnosticRefresh?: Promise<DataDiagnosticSnapshot>;
  private readonly listeners = new Set<() => void>();
  private readonly activityListeners = new Set<(event: ActivityEvent) => void>();
  private readonly scanTimers = new Map<string, number>();
  private scanAllFilesTask?: Promise<void>;
  private scanAgain = false;
  private notifyTimer?: number;
  private saveTimer?: number;
  private reloadTimer?: number;
  private disposed = false;
  private state: RuntimeState = {
    dataFolderStatus: "missing",
    paused: true,
    lastLedgerRead: "",
    diagnostics: [],
    projectConflicts: [],
  };

  readonly app: App;
  readonly settings: WritingCalendarSettings;
  readonly fileIndex: FileIndex;

  constructor(private readonly options: WritingCalendarRuntimeOptions) {
    this.app = options.app;
    this.settings = options.settings;
    this.fileIndex = options.fileIndex;
    this.storage = new CalendarStorage(this.app.vault.adapter, this.settings.dataFolder);
    this.diagnosticBaselineStore = options.diagnosticBaselineStore
      ?? new LocalDiagnosticBaselineStore(this.app.vault.getName());
    this.diagnosticBaseline = this.diagnosticBaselineStore.load();
    this.engine = new WritingCalendarEngine({
      fileIndex: this.fileIndex,
    });
  }

  async initialize(): Promise<void> {
    const returningUser = this.settings.activationDate.length > 0;
    this.state.dataFolderStatus = await this.storage.ensureDataFolder(!returningUser);
    this.state.paused = this.state.dataFolderStatus === "missing";
    if (this.state.paused) {
      this.addDiagnostic("warning", "未发现写作日历数据目录。请先完成 Remotely Save 同步，或在设置中确认新建目录。");
      new Notice("写作日历：等待同步数据目录，活动记录已暂停。", 8000);
    } else {
      await this.writeDeviceMetadata();
      await this.reloadSyncedData(false);
    }
    await this.scanAllFiles();
    if (!this.settings.activationDate) this.settings.activationDate = localDateString();
    await this.options.saveLocalState();
    this.scheduleNotify();
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.scanTimers.values()) window.clearTimeout(timer);
    this.scanTimers.clear();
    if (this.notifyTimer !== undefined) window.clearTimeout(this.notifyTimer);
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    if (this.reloadTimer !== undefined) window.clearTimeout(this.reloadTimer);
    this.activityListeners.clear();
    void this.options.saveLocalState();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeActivity(listener: (event: ActivityEvent) => void): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  getState(): RuntimeState {
    return {
      ...this.state,
      diagnostics: [...this.state.diagnostics],
      projectConflicts: [...this.state.projectConflicts],
    };
  }

  getDataDiagnostics(): DataDiagnosticSnapshot {
    return buildDataDiagnosticSnapshot({
      now: new Date(),
      dataFolder: {
        path: this.settings.dataFolder,
        status: this.state.dataFolderStatus,
        paused: this.state.paused,
      },
      lastReadAt: this.state.lastLedgerRead || null,
      currentDevice: {
        deviceId: this.settings.deviceId,
        userAgent: typeof navigator === "undefined" ? undefined : platformLabel(),
      },
      ledger: this.ledgerReport,
      devices: this.deviceMetadata,
      fileIndex: this.fileIndex.inspect(),
      currentFiles: this.currentDiagnosticFiles(),
      baseline: this.diagnosticBaseline,
      countMode: this.settings.countMode,
    });
  }

  async refreshDataDiagnostics(): Promise<DataDiagnosticSnapshot> {
    if (this.diagnosticRefresh) return this.diagnosticRefresh;
    const task = (async (): Promise<DataDiagnosticSnapshot> => {
      await this.reloadSyncedData(false);
      await this.scanAllFiles();
      const snapshot = this.getDataDiagnostics();
      this.scheduleNotify();
      return snapshot;
    })();
    this.diagnosticRefresh = task;
    try {
      return await task;
    } finally {
      if (this.diagnosticRefresh === task) this.diagnosticRefresh = undefined;
    }
  }

  setDiagnosticBaseline(): void {
    const baseline: DiagnosticBaseline = {
      formatVersion: 1,
      createdAt: Date.now(),
      files: this.currentDiagnosticFiles(),
    };
    this.diagnosticBaseline = baseline;
    this.diagnosticBaselineStore.save(baseline);
    this.scheduleNotify();
  }

  getProjects(): WritingProjectOption[] {
    return this.engine.listProjects();
  }

  getDashboard(today = localDateString()): DashboardSnapshot {
    const projectId = this.getProjects().some((project) => project.id === this.settings.selectedProjectId)
      ? this.settings.selectedProjectId
      : "all";
    return this.engine.dashboard(
      projectId,
      this.settings.countMode,
      this.settings.includePasteInManual,
      today,
    );
  }

  /** Run a workbench-only filter as the whole scope, not as an intersection. */
  getDashboardForFilter(filter: ProjectFilter, today = localDateString()): DashboardSnapshot {
    return this.engine.dashboardForDefinition(
      filter,
      this.settings.countMode,
      this.settings.includePasteInManual,
      today,
    );
  }

  async updatePreferences(patch: Partial<WritingCalendarSettings>): Promise<void> {
    Object.assign(this.settings, patch);
    await this.options.saveLocalState();
    this.scheduleNotify();
  }

  async createMissingDataFolder(): Promise<void> {
    this.state.dataFolderStatus = await this.storage.ensureDataFolder(true);
    this.state.paused = false;
    await this.writeDeviceMetadata();
    await this.reloadSyncedData();
  }

  async reloadSyncedData(notify = true): Promise<void> {
    if (this.state.paused) return;
    const [loadedEvents, loadedProjects, loadedDevices] = await Promise.all([
      this.storage.loadEvents(),
      this.storage.loadProjectVersions(),
      this.storage.loadDeviceMetadata(),
    ]);
    this.events = loadedEvents.events;
    this.ledgerReport = diagnosticLedgerReport(loadedEvents);
    this.deviceMetadata = diagnosticDevices(loadedDevices.records);
    this.projectVersions = loadedProjects.records;
    this.engine.setEvents(this.events);
    this.applyProjectResolution();
    this.state.lastLedgerRead = new Date().toISOString();
    this.state.diagnostics = this.state.diagnostics.filter((item) => !item.path?.startsWith(this.settings.dataFolder));
    for (const warning of loadedEvents.warnings) this.addDiagnostic("warning", warning.message, warning.path);
    for (const warning of loadedProjects.warnings) this.addStorageWarning(warning);
    for (const warning of loadedDevices.warnings) this.addStorageWarning(warning);
    if (notify) this.scheduleNotify();
  }

  scheduleSyncedDataReload(): void {
    if (this.reloadTimer !== undefined) window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = undefined;
      void this.reloadSyncedData().catch((error) => this.reportError("重新读取同步数据失败", error));
    }, 500);
  }

  isDataPath(path: string): boolean {
    return path === this.settings.dataFolder || path.startsWith(`${this.settings.dataFolder}/`);
  }

  async recordActivity(file: TFile, activity: TrackedEditorActivity): Promise<void> {
    if (this.state.paused || this.disposed || this.isDataPath(file.path)) return;
    let snapshot = this.fileIndex.getByPath(file.path);
    if (!snapshot) snapshot = await this.scanFile(file);
    if (!snapshot) return;
    const now = new Date();
    const event = buildActivityEvent({
      activity,
      eventId: newId("evt"),
      deviceId: this.settings.deviceId,
      fileId: snapshot.fileId,
      path: snapshot.path,
      timestamp: now,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      localDate: localDateString(now),
    });
    try {
      await this.storage.appendEvent(event);
      this.events.push(event);
      this.ledgerReport = {
        ...this.ledgerReport,
        eventCount: this.ledgerReport.eventCount + 1,
        rawEventCount: this.ledgerReport.rawEventCount + 1,
        deviceEvents: [
          ...this.ledgerReport.deviceEvents,
          { deviceId: event.deviceId, timestamp: event.timestamp },
        ],
      };
      this.engine.addEvent(event);
      for (const listener of this.activityListeners) listener(event);
      this.scheduleNotify();
    } catch (error) {
      this.reportError("写入活动账本失败，统计记录已暂停", error);
      this.state.paused = true;
      new Notice("写作日历：活动账本写入失败，已暂停记录。", 8000);
    }
  }

  scheduleFileScan(file: TFile): void {
    if (this.isDataPath(file.path)) {
      this.scheduleSyncedDataReload();
      return;
    }
    const previous = this.scanTimers.get(file.path);
    if (previous !== undefined) window.clearTimeout(previous);
    const timer = window.setTimeout(() => {
      this.scanTimers.delete(file.path);
      void this.scanFile(file).then(() => this.scheduleNotify()).catch((error) => this.reportError("更新文件统计失败", error, file.path));
    }, 1_000);
    this.scanTimers.set(file.path, timer);
  }

  handleRename(file: TFile, oldPath: string): void {
    if (this.isDataPath(oldPath) || this.isDataPath(file.path)) {
      this.scheduleSyncedDataReload();
      return;
    }
    this.fileIndex.rename(oldPath, file.path, file.stat.ctime);
    this.scheduleFileScan(file);
    this.scheduleLocalSave();
  }

  /**
   * Reconcile a folder rename without guessing from paths alone. The index
   * inherits IDs only when every indexed descendant has a matching file in
   * the post-rename Vault snapshot; otherwise the normal scan safely creates
   * tombstones/new IDs and leaves a diagnostic for the user.
   */
  async handleFolderRename(oldPath: string, newPath: string): Promise<void> {
    if (this.isDataPath(oldPath) || this.isDataPath(newPath)) {
      this.scheduleSyncedDataReload();
      return;
    }

    try {
      const result = this.fileIndex.renameFolder(
        oldPath,
        newPath,
        this.app.vault.getFiles().map((file) => ({ path: file.path, ctime: file.stat.ctime })),
      );
      if (result.missingPaths.length > 0) {
        this.addDiagnostic(
          "warning",
          `文件夹改名未能可靠映射，已保留旧文件历史并交由全量扫描确认：${result.missingPaths.join("、")}`,
          oldPath,
        );
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.addDiagnostic("warning", `文件夹改名未能可靠映射：${detail}`, oldPath);
    }
    await this.scanAllFiles();
  }

  handleDelete(file: TFile): void {
    if (this.isDataPath(file.path)) {
      this.scheduleSyncedDataReload();
      return;
    }
    this.fileIndex.remove(file.path);
    this.scheduleLocalSave();
    this.scheduleNotify();
  }

  async scanAllFiles(): Promise<void> {
    if (this.scanAllFilesTask) {
      this.scanAgain = true;
      return this.scanAllFilesTask;
    }

    const task = (async () => {
      do {
        this.scanAgain = false;
        await this.performFullScan();
      } while (this.scanAgain && !this.disposed);
    })();
    this.scanAllFilesTask = task;
    try {
      await task;
    } finally {
      if (this.scanAllFilesTask === task) this.scanAllFilesTask = undefined;
    }
  }

  private async performFullScan(): Promise<void> {
    const allowed = this.allowedExtensions();
    const candidates = this.app.vault
      .getFiles()
      .filter((file) => !this.isDataPath(file.path) && allowed.has(file.extension.toLowerCase()));
    const failedFiles: TFile[] = [];
    for (let offset = 0; offset < candidates.length; offset += 12) {
      const batch = candidates.slice(offset, offset + 12);
      const results = await Promise.all(
        batch.map(async (file) => ({
          file,
          snapshot: await this.scanFile(file, false),
        })),
      );
      failedFiles.push(...results.filter(({ snapshot }) => !snapshot).map(({ file }) => file));
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    const unresolvedFiles = await retryFailedItems(
      failedFiles,
      async (file) => Boolean(await this.scanFile(file, false)),
      2,
    );
    for (const file of unresolvedFiles) {
      this.addDiagnostic("warning", "扫描未完成：文件暂时无法读取，请稍后重新扫描。", file.path);
    }
    const missing = missingVaultPaths(
      this.fileIndex.listCurrent().map((snapshot) => snapshot.path),
      candidates.map((file) => file.path),
    );
    for (const path of missing) this.fileIndex.remove(path);
    await this.options.saveLocalState();
    this.scheduleNotify();
  }

  async saveProject(definition: ProjectDefinition): Promise<void> {
    const id = definition.id?.trim() || newId("project");
    const normalized: ProjectDefinition = {
      ...definition,
      id,
      name: isWorkspaceScopeId(id) ? WORKSPACE_SCOPE_NAME : definition.name?.trim() || "未命名项目",
    };
    const projectId = normalized.id as string;
    const parents = this.currentProjectHeads(projectId);
    const record = createProjectVersion({
      definition: normalized,
      deviceId: this.settings.deviceId,
      timestamp: new Date().toISOString(),
      revisionId: newId("rev"),
      parents,
    });
    await this.storage.writeProjectVersion(record);
    this.projectVersions.push(record);
    this.applyProjectResolution();
    await this.scanAllFiles();
  }

  async deleteProject(projectId: string): Promise<void> {
    if (isWorkspaceScopeId(projectId)) return;
    const current = this.getProjects().find((project) => project.id === projectId)?.definition;
    if (!current) return;
    const record = createProjectVersion({
      definition: current,
      deviceId: this.settings.deviceId,
      timestamp: new Date().toISOString(),
      revisionId: newId("rev"),
      parents: this.currentProjectHeads(projectId),
      deleted: true,
    });
    await this.storage.writeProjectVersion(record);
    this.projectVersions.push(record);
    this.applyProjectResolution();
    if (this.settings.selectedProjectId === projectId) this.settings.selectedProjectId = "all";
    await this.options.saveLocalState();
    this.scheduleNotify();
  }

  private async scanFile(file: TFile, reportFailure = true): Promise<ReturnType<FileIndex["getByPath"]>> {
    if (this.isDataPath(file.path) || !this.allowedExtensions().has(file.extension.toLowerCase())) return undefined;
    try {
      const text = await this.app.vault.cachedRead(file);
      const vector = countMarkdown(text);
      const metadata = file.extension.toLowerCase() === "md"
        ? this.app.metadataCache.getFileCache(file)
        : undefined;
      const properties = serializableProperties(metadata?.frontmatter);
      const tags = metadata ? [...new Set((getAllTags(metadata) ?? []).filter((tag): tag is string => typeof tag === "string"))] : [];
      const snapshot = this.fileIndex.upsert({
        path: file.path,
        ctime: file.stat.ctime,
        mtime: file.stat.mtime,
        creative: countCreativeWords(vector),
        bodyCharacters: countBodyCharacters(vector),
        tags,
        properties,
      });
      this.scheduleLocalSave();
      return snapshot;
    } catch (error) {
      if (reportFailure) this.reportError("读取正文失败，已跳过该文件", error, file.path);
      return undefined;
    }
  }

  private allowedExtensions(): Set<string> {
    const extensions = new Set(["md"]);
    for (const project of this.engine.listProjects()) {
      for (const extension of project.definition?.extensions ?? []) {
        const normalized = extension.trim().toLowerCase().replace(/^\*?\./, "");
        if (normalized) extensions.add(normalized);
      }
    }
    return extensions;
  }

  private applyProjectResolution(): void {
    const resolution = resolveProjectVersions(this.projectVersions);
    this.state.projectConflicts = resolution.conflicts;
    this.engine.setProjects(resolution.projects.map((record) => record.definition));
    for (const conflict of resolution.conflicts) {
      this.addDiagnostic("warning", `项目“${conflict.projectId}”存在 ${conflict.heads.length} 个并行版本，请在设置中确认后保存。`);
    }
  }

  private currentProjectHeads(projectId: string): ProjectVersionRecord[] {
    const records = this.projectVersions.filter((record) => record.projectId === projectId);
    const parents = new Set(records.flatMap((record) => record.parentRevisionIds));
    return records.filter((record) => !parents.has(record.revisionId));
  }

  private async writeDeviceMetadata(): Promise<void> {
    await this.storage.writeDeviceMetadata(this.settings.deviceId, {
      formatVersion: 1,
      deviceId: this.settings.deviceId,
      lastSeenAt: new Date().toISOString(),
      userAgent: platformLabel(),
    });
  }

  private scheduleLocalSave(): void {
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      void this.options.saveLocalState().catch((error) => this.reportError("保存本地索引失败", error));
    }, 500);
  }

  private scheduleNotify(): void {
    if (this.notifyTimer !== undefined || this.disposed) return;
    this.notifyTimer = window.setTimeout(() => {
      this.notifyTimer = undefined;
      for (const listener of this.listeners) listener();
    }, 80);
  }

  private addStorageWarning(warning: StorageWarning): void {
    this.addDiagnostic("warning", warning.message, warning.path);
  }

  private currentDiagnosticFiles(): DiagnosticFileSnapshot[] {
    return this.fileIndex.listCurrent().map((snapshot) => ({
      fileId: snapshot.fileId,
      path: snapshot.path,
      creative: snapshot.creative,
      bodyCharacters: snapshot.bodyCharacters,
      mtime: snapshot.mtime,
    }));
  }

  private addDiagnostic(severity: RuntimeDiagnostic["severity"], message: string, path?: string): void {
    const key = `${severity}\0${path ?? ""}\0${message}`;
    const exists = this.state.diagnostics.some(
      (item) => `${item.severity}\0${item.path ?? ""}\0${item.message}` === key,
    );
    if (!exists) this.state.diagnostics.push({ severity, message, ...(path ? { path } : {}) });
  }

  private reportError(message: string, error: unknown, path?: string): void {
    const detail = error instanceof Error ? error.message : String(error);
    this.addDiagnostic("error", `${message}：${detail}`, path);
    this.scheduleNotify();
  }
}
