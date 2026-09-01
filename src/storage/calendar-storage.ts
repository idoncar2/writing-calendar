import { decodeJsonl, encodeJsonl } from "../ledger/jsonl";
import { mergeEvents } from "../ledger/merge";
import { deviceMetadataPath, ledgerPath, projectVersionPath } from "../ledger/paths";
import type { ActivityEvent, JsonlWarning } from "../ledger/types";
import type { ProjectVersionRecord } from "../projects/versions";

export interface TextVaultAdapter {
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  append(path: string, data: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

export interface StorageWarning {
  path: string;
  line?: number;
  message: string;
}

export interface LoadedEvents {
  events: ActivityEvent[];
  warnings: Array<JsonlWarning & { path: string }>;
  files: string[];
  rawEventCount: number;
  duplicateEventIds: string[];
}

export interface DeviceMetadataRecord {
  deviceId: string;
  userAgent?: string;
  lastSeenAt?: string;
}

export interface LoadedDeviceMetadata {
  records: DeviceMetadataRecord[];
  warnings: StorageWarning[];
  files: string[];
}

export interface LoadedProjectVersions {
  records: ProjectVersionRecord[];
  warnings: StorageWarning[];
}

export type DataFolderStatus = "ready" | "created" | "missing";

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function isProjectVersion(value: unknown): value is ProjectVersionRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<ProjectVersionRecord>;
  return (
    record.formatVersion === 1 &&
    typeof record.projectId === "string" &&
    typeof record.revisionId === "string" &&
    Array.isArray(record.parentRevisionIds) &&
    record.parentRevisionIds.every((parent) => typeof parent === "string") &&
    typeof record.deviceId === "string" &&
    typeof record.timestamp === "string" &&
    typeof record.deleted === "boolean" &&
    !!record.definition &&
    typeof record.definition === "object"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeviceMetadata(value: unknown): value is DeviceMetadataRecord {
  if (!isRecord(value) || typeof value.deviceId !== "string" || value.deviceId.length === 0) return false;
  if (value.userAgent !== undefined && typeof value.userAgent !== "string") return false;
  if (value.lastSeenAt !== undefined && typeof value.lastSeenAt !== "string") return false;
  return true;
}

export class CalendarStorage {
  private appendQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapter: TextVaultAdapter,
    readonly root: string,
  ) {}

  async ensureDataFolder(allowCreate: boolean): Promise<DataFolderStatus> {
    if (await this.adapter.exists(this.root)) {
      await this.ensureDirectories([`${this.root}/projects`, `${this.root}/ledgers`, `${this.root}/devices`]);
      return "ready";
    }
    if (!allowCreate) return "missing";
    await this.ensureDirectories([
      this.root,
      `${this.root}/projects`,
      `${this.root}/ledgers`,
      `${this.root}/devices`,
    ]);
    return "created";
  }

  async appendEvent(event: ActivityEvent): Promise<void> {
    const operation = async (): Promise<void> => {
      const path = ledgerPath(this.root, event.deviceId, event.timestamp);
      await this.ensureDirectory(parentPath(path));
      const line = encodeJsonl([event]);
      if (await this.adapter.exists(path)) await this.adapter.append(path, line);
      else await this.adapter.write(path, line);
    };
    const task = this.appendQueue.then(operation, operation);
    this.appendQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async loadEvents(): Promise<LoadedEvents> {
    const root = `${this.root}/ledgers`;
    if (!(await this.adapter.exists(root))) {
      return { events: [], warnings: [], files: [], rawEventCount: 0, duplicateEventIds: [] };
    }
    const files = (await this.collectFiles(root)).filter((path) => path.toLowerCase().endsWith(".jsonl")).sort();
    const ledgers: ActivityEvent[][] = [];
    const warnings: Array<JsonlWarning & { path: string }> = [];
    for (const path of files) {
      try {
        const decoded = decodeJsonl(await this.adapter.read(path));
        ledgers.push(decoded.events);
        warnings.push(...decoded.warnings.map((warning) => ({ ...warning, path })));
      } catch (error) {
        warnings.push({
          path,
          line: 0,
          raw: "",
          kind: "invalid-json",
          recoverable: true,
          message: error instanceof Error ? error.message : "无法读取账本",
        });
      }
    }
    const rawEvents = ledgers.flat();
    const counts = new Map<string, number>();
    for (const event of rawEvents) counts.set(event.eventId, (counts.get(event.eventId) ?? 0) + 1);
    return {
      events: mergeEvents(ledgers),
      warnings,
      files,
      rawEventCount: rawEvents.length,
      duplicateEventIds: [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([eventId]) => eventId)
        .sort(),
    };
  }

  async loadDeviceMetadata(): Promise<LoadedDeviceMetadata> {
    const root = `${this.root}/devices`;
    if (!(await this.adapter.exists(root))) return { records: [], warnings: [], files: [] };
    const files = (await this.collectFiles(root)).filter((path) => path.toLowerCase().endsWith(".json")).sort();
    const records: DeviceMetadataRecord[] = [];
    const warnings: StorageWarning[] = [];
    for (const path of files) {
      try {
        const parsed: unknown = JSON.parse(await this.adapter.read(path));
        if (!isDeviceMetadata(parsed)) throw new Error("设备元数据字段不完整");
        records.push({
          deviceId: parsed.deviceId,
          ...(parsed.userAgent === undefined ? {} : { userAgent: parsed.userAgent }),
          ...(parsed.lastSeenAt === undefined ? {} : { lastSeenAt: parsed.lastSeenAt }),
        });
      } catch (error) {
        warnings.push({ path, message: error instanceof Error ? error.message : "无法读取设备元数据" });
      }
    }
    return { records, warnings, files };
  }

  async writeDeviceMetadata(deviceId: string, metadata: Record<string, unknown>): Promise<void> {
    const path = deviceMetadataPath(this.root, deviceId);
    await this.ensureDirectory(parentPath(path));
    await this.adapter.write(path, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  async writeProjectVersion(record: ProjectVersionRecord): Promise<string> {
    const path = projectVersionPath(this.root, record.projectId, record.deviceId, record.timestamp);
    await this.ensureDirectory(parentPath(path));
    if (await this.adapter.exists(path)) {
      throw new Error(`Project version already exists: ${path}`);
    }
    await this.adapter.write(path, `${JSON.stringify(record, null, 2)}\n`);
    return path;
  }

  async loadProjectVersions(): Promise<LoadedProjectVersions> {
    const root = `${this.root}/projects`;
    if (!(await this.adapter.exists(root))) return { records: [], warnings: [] };
    const files = (await this.collectFiles(root)).filter((path) => path.toLowerCase().endsWith(".json")).sort();
    const records: ProjectVersionRecord[] = [];
    const warnings: StorageWarning[] = [];
    for (const path of files) {
      try {
        const parsed: unknown = JSON.parse(await this.adapter.read(path));
        if (!isProjectVersion(parsed)) throw new Error("项目版本记录字段不完整");
        records.push(parsed);
      } catch (error) {
        warnings.push({ path, message: error instanceof Error ? error.message : "无法读取项目版本" });
      }
    }
    return { records, warnings };
  }

  private async collectFiles(root: string): Promise<string[]> {
    const result: string[] = [];
    const pending = [root];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current) continue;
      const listed = await this.adapter.list(current);
      result.push(...listed.files);
      pending.push(...listed.folders);
    }
    return result;
  }

  private async ensureDirectories(paths: readonly string[]): Promise<void> {
    for (const path of paths) await this.ensureDirectory(path);
  }

  private async ensureDirectory(path: string): Promise<void> {
    if (!path || (await this.adapter.exists(path))) return;
    const parent = parentPath(path);
    if (parent) await this.ensureDirectory(parent);
    if (!(await this.adapter.exists(path))) await this.adapter.mkdir(path);
  }
}
