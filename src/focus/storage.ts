import type { TextVaultAdapter } from "../storage/calendar-storage";
import { safePathSegment } from "../ledger/paths";
import { FOCUS_SESSION_FORMAT_VERSION } from "./types";

/** The subset of the Obsidian Vault adapter needed by focus storage. */
export type FocusVaultAdapter = TextVaultAdapter;

export type FocusStorageWarningKind = "invalid-json" | "invalid-record";

export interface FocusStorageWarning {
  path: string;
  line: number;
  raw: string;
  kind: FocusStorageWarningKind;
  recoverable: true;
  message: string;
}

export interface LoadedFocusSessions<T extends object> {
  records: T[];
  warnings: FocusStorageWarning[];
  files: string[];
}

/**
 * The storage layer intentionally keeps the record generic.  The focus
 * controller owns the domain type; storage only needs these stable fields to
 * select a month and reject obviously damaged rows when loading JSONL.
 */
export type FocusSessionRecordLike = Record<string, unknown> & {
  deviceId?: unknown;
  endTime?: unknown;
  formatVersion?: unknown;
};

function normalizeRoot(root: string): string {
  const normalized = root.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "..")) {
    throw new Error("Invalid writing calendar data folder.");
  }
  return normalized;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function endingMonth(value: unknown): string {
  if (typeof value !== "string") throw new Error("Focus session ending timestamp is required.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid focus session ending timestamp.");
  return date.toISOString().slice(0, 7);
}

function recordDeviceId<T extends object>(
  record: T,
  explicitDeviceId: string | undefined,
): string {
  const value = explicitDeviceId ?? (record as FocusSessionRecordLike).deviceId;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Focus session deviceId is required.");
  }
  return value;
}

/** Resolve the append path without exposing any host filesystem API. */
export function focusSessionPath(root: string, deviceId: string, endTime: string): string {
  return `${normalizeRoot(root)}/focus/${safePathSegment(deviceId)}/${endingMonth(endTime)}.jsonl`;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

function isFocusSessionRecord(value: unknown): value is FocusSessionRecordLike {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const identity = record.id ?? record.sessionId;
  if (typeof identity !== "string" || identity.length === 0) return false;
  if (!isValidDateString(record.startTime) || !isValidDateString(record.endTime)) return false;

  const numericFields = [
    record.plannedDurationMs,
    record.inputCharacters,
    record.activeMs,
    record.idleMs,
  ];
  if (numericFields.some((field) => !isFiniteNonNegative(field))) return false;
  if (typeof record.netCharacters !== "number" || !Number.isFinite(record.netCharacters)) return false;
  if (record.awayMs !== undefined && !isFiniteNonNegative(record.awayMs)) return false;
  if (record.formatVersion !== undefined && record.formatVersion !== FOCUS_SESSION_FORMAT_VERSION) return false;
  if (record.deviceId !== undefined && (typeof record.deviceId !== "string" || record.deviceId.length === 0)) {
    return false;
  }
  if (record.endReason !== undefined && typeof record.endReason !== "string") return false;
  return true;
}

function invalidWarning(
  path: string,
  line: number,
  raw: string,
  kind: FocusStorageWarningKind,
  message: string,
): FocusStorageWarning {
  return { path, line, raw, kind, recoverable: true, message };
}

function currentFormatRecord<T extends object>(record: T): T {
  const version = (record as FocusSessionRecordLike).formatVersion;
  if (version !== undefined && version !== FOCUS_SESSION_FORMAT_VERSION) {
    throw new Error(`Unsupported focus session format version: ${String(version)}`);
  }
  // Do not mutate the caller's object. The existing JSONL bytes are never
  // rewritten; only this newly appended row receives the current version.
  return { ...record, formatVersion: FOCUS_SESSION_FORMAT_VERSION } as T;
}

/**
 * Append-only focus-session storage.  A per-instance queue prevents two
 * sessions finishing at the same time from racing on the same month file.
 */
export class FocusStorage<T extends object = FocusSessionRecordLike> {
  private appendQueue: Promise<void> = Promise.resolve();
  private readonly normalizedRoot: string;

  constructor(
    private readonly adapter: FocusVaultAdapter,
    root: string,
  ) {
    this.normalizedRoot = normalizeRoot(root);
  }

  /** Append one immutable record and return the vault-relative JSONL path. */
  async appendSession(record: T, deviceId?: string): Promise<string> {
    const owner = recordDeviceId(record, deviceId);
    const path = focusSessionPath(
      this.normalizedRoot,
      owner,
      String((record as FocusSessionRecordLike).endTime),
    );
    const operation = async (): Promise<void> => {
      await this.ensureDirectory(parentPath(path));
      const line = `${JSON.stringify(currentFormatRecord(record))}\n`;
      if (await this.adapter.exists(path)) await this.adapter.append(path, line);
      else await this.adapter.write(path, line);
    };
    const task = this.appendQueue.then(operation, operation);
    this.appendQueue = task.then(
      () => undefined,
      () => undefined,
    );
    await task;
    return path;
  }

  /** Read all focus records from every device/month file under the data folder. */
  async loadSessions(): Promise<LoadedFocusSessions<T>> {
    const root = `${this.normalizedRoot}/focus`;
    if (!(await this.adapter.exists(root))) return { records: [], warnings: [], files: [] };

    const files = (await this.collectFiles(root))
      .filter((path) => path.toLowerCase().endsWith(".jsonl"))
      .sort();
    const records: T[] = [];
    const warnings: FocusStorageWarning[] = [];

    for (const path of files) {
      let input: string;
      try {
        input = await this.adapter.read(path);
      } catch (error) {
        warnings.push(
          invalidWarning(
            path,
            0,
            "",
            "invalid-json",
            error instanceof Error ? error.message : "无法读取专注记录",
          ),
        );
        continue;
      }

      const lines = input.replace(/^\uFEFF/, "").split(/\n/);
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const raw = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (raw.trim().length === 0) return;

        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Invalid JSON";
          warnings.push(
            invalidWarning(path, lineNumber, raw, "invalid-json", `Invalid JSON on line ${lineNumber}: ${detail}`),
          );
          return;
        }

        if (!isFocusSessionRecord(value)) {
          warnings.push(
            invalidWarning(
              path,
              lineNumber,
              raw,
              "invalid-record",
              `JSON on line ${lineNumber} is not a complete focus session record`,
            ),
          );
          return;
        }
        records.push(value as T);
      });
    }

    return { records, warnings, files };
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

  private async ensureDirectory(path: string): Promise<void> {
    if (!path || (await this.adapter.exists(path))) return;
    const parent = parentPath(path);
    if (parent) await this.ensureDirectory(parent);
    if (!(await this.adapter.exists(path))) await this.adapter.mkdir(path);
  }
}
