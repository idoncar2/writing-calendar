import {
  getBrowserLocalStorage,
  type LocalStorageLike,
} from "../focus/identity";
import type { DiagnosticBaseline, DiagnosticFileSnapshot } from "./model";

const fallbackValues = new Map<string, string>();

export function diagnosticBaselineStorageKey(vaultName: string): string {
  return `writing-calendar:${vaultName}:diagnostic-baseline`;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFileSnapshot(value: unknown): value is DiagnosticFileSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const file = value as Partial<DiagnosticFileSnapshot>;
  return (
    typeof file.fileId === "string" && file.fileId.length > 0
    && typeof file.path === "string" && file.path.length > 0
    && finiteNonNegative(file.creative)
    && finiteNonNegative(file.bodyCharacters)
    && finiteNonNegative(file.mtime)
  );
}

function parseBaseline(value: unknown): DiagnosticBaseline | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<DiagnosticBaseline>;
  // A missing formatVersion is accepted for the first local prototype shape;
  // unknown future versions remain unread rather than being misinterpreted.
  if (candidate.formatVersion !== undefined && candidate.formatVersion !== 1) return null;
  if (!finiteNonNegative(candidate.createdAt) || !Array.isArray(candidate.files)) return null;
  const files = candidate.files.filter(isFileSnapshot);
  if (files.length !== candidate.files.length) return null;
  const ids = new Set(files.map((file) => file.fileId));
  if (ids.size !== files.length) return null;
  return {
    formatVersion: 1,
    createdAt: candidate.createdAt,
    files: files.map((file) => ({
      fileId: file.fileId,
      path: file.path,
      creative: file.creative,
      bodyCharacters: file.bodyCharacters,
      mtime: file.mtime,
    })),
  };
}

export interface DiagnosticBaselineStore {
  load(): DiagnosticBaseline | null;
  save(baseline: DiagnosticBaseline): void;
}

export class LocalDiagnosticBaselineStore implements DiagnosticBaselineStore {
  private readonly key: string;

  constructor(
    vaultName: string,
    private readonly storage: LocalStorageLike | undefined = getBrowserLocalStorage(),
  ) {
    this.key = diagnosticBaselineStorageKey(vaultName);
  }

  load(): DiagnosticBaseline | null {
    let raw: string | null;
    try {
      raw = this.storage ? this.storage.getItem(this.key) : fallbackValues.get(this.key) ?? null;
    } catch {
      raw = fallbackValues.get(this.key) ?? null;
    }
    if (!raw) return null;
    try {
      return parseBaseline(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  save(baseline: DiagnosticBaseline): void {
    const raw = JSON.stringify(baseline);
    try {
      if (this.storage) this.storage.setItem(this.key, raw);
      else fallbackValues.set(this.key, raw);
    } catch {
      fallbackValues.set(this.key, raw);
    }
  }
}
