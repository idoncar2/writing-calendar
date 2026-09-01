import type { CountMode } from "../ledger/types";
import {
  getBrowserLocalStorage,
  type LocalStorageLike,
} from "./identity";
import type { FocusCheckpoint } from "./types";

const fallbackValues = new Map<string, string>();

export function focusCheckpointStorageKey(vaultName: string): string {
  return `writing-calendar:${vaultName}:focus-checkpoint`;
}

function isCountMode(value: unknown): value is CountMode {
  return value === "creative" || value === "body-characters";
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFocusCheckpoint(value: unknown): value is FocusCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const checkpoint = value as Partial<FocusCheckpoint>;
  return (
    checkpoint.version === 1 &&
    checkpoint.kind === "focus" &&
    typeof checkpoint.id === "string" &&
    checkpoint.id.length > 0 &&
    typeof checkpoint.deviceId === "string" &&
    checkpoint.deviceId.length > 0 &&
    isCountMode(checkpoint.countMode) &&
    typeof checkpoint.startTime === "string" &&
    !Number.isNaN(new Date(checkpoint.startTime).getTime()) &&
    isFiniteNonNegative(checkpoint.plannedDurationMs) &&
    typeof checkpoint.checkpointTime === "string" &&
    !Number.isNaN(new Date(checkpoint.checkpointTime).getTime()) &&
    isFiniteNonNegative(checkpoint.inputCharacters) &&
    typeof checkpoint.netCharacters === "number" &&
    Number.isFinite(checkpoint.netCharacters) &&
    isFiniteNonNegative(checkpoint.activeMs) &&
    isFiniteNonNegative(checkpoint.idleMs) &&
    isFiniteNonNegative(checkpoint.awayMs)
  );
}

/** Local-only persistence for the in-progress session checkpoint. */
export class LocalFocusCheckpointStore {
  private readonly key: string;

  constructor(
    vaultName: string,
    private readonly storage: LocalStorageLike | undefined = getBrowserLocalStorage(),
  ) {
    this.key = focusCheckpointStorageKey(vaultName);
  }

  load(): FocusCheckpoint | null {
    let raw: string | null;
    try {
      raw = this.storage ? this.storage.getItem(this.key) : fallbackValues.get(this.key) ?? null;
    } catch {
      raw = fallbackValues.get(this.key) ?? null;
    }
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isFocusCheckpoint(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(checkpoint: FocusCheckpoint): void {
    const raw = JSON.stringify(checkpoint);
    try {
      if (this.storage) this.storage.setItem(this.key, raw);
      else fallbackValues.set(this.key, raw);
    } catch {
      fallbackValues.set(this.key, raw);
    }
  }

  clear(): void {
    try {
      if (this.storage) this.storage.removeItem(this.key);
      else fallbackValues.delete(this.key);
    } catch {
      fallbackValues.delete(this.key);
    }
  }
}
