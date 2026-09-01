import { describe, expect, it } from "vitest";

import {
  LocalDeviceIdentity,
  deviceIdentityStorageKey,
} from "../src/focus/identity";
import {
  focusCheckpointStorageKey,
  LocalFocusCheckpointStore,
} from "../src/focus/local-state";
import type { FocusCheckpoint } from "../src/focus/types";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const checkpoint: FocusCheckpoint = {
  version: 1,
  kind: "focus",
  id: "focus-a",
  deviceId: "device-a",
  countMode: "creative",
  startTime: "2026-08-28T10:00:00.000Z",
  plannedDurationMs: 25 * 60_000,
  checkpointTime: "2026-08-28T10:05:00.000Z",
  inputCharacters: 12,
  netCharacters: 10,
  activeMs: 60_000,
  idleMs: 4 * 60_000,
  awayMs: 0,
};

describe("LocalDeviceIdentity", () => {
  it("keeps a vault-scoped device ID in local storage instead of settings", () => {
    const storage = new MemoryStorage();
    const first = new LocalDeviceIdentity("My Vault", storage).getOrCreate(() => "device-a");
    const second = new LocalDeviceIdentity("My Vault", storage).getOrCreate(() => "device-b");

    expect(first).toBe("device-a");
    expect(second).toBe("device-a");
    expect(storage.getItem(deviceIdentityStorageKey("My Vault"))).toBe("device-a");
  });

  it("does not share identity between vaults", () => {
    const storage = new MemoryStorage();

    expect(new LocalDeviceIdentity("Vault A", storage).getOrCreate(() => "device-a")).toBe("device-a");
    expect(new LocalDeviceIdentity("Vault B", storage).getOrCreate(() => "device-b")).toBe("device-b");
  });
});

describe("LocalFocusCheckpointStore", () => {
  it("round-trips a checkpoint locally and keeps it vault-scoped", () => {
    const storage = new MemoryStorage();
    const first = new LocalFocusCheckpointStore("My Vault", storage);
    first.save(checkpoint);

    expect(new LocalFocusCheckpointStore("My Vault", storage).load()).toEqual(checkpoint);
    expect(new LocalFocusCheckpointStore("Other Vault", storage).load()).toBeNull();
    expect(storage.getItem(focusCheckpointStorageKey("My Vault"))).toContain('"id":"focus-a"');
  });

  it("clears a completed checkpoint and ignores malformed local values", () => {
    const storage = new MemoryStorage();
    const store = new LocalFocusCheckpointStore("My Vault", storage);
    store.save(checkpoint);
    store.clear();
    expect(store.load()).toBeNull();

    storage.setItem(focusCheckpointStorageKey("My Vault"), JSON.stringify({ kind: "focus" }));
    expect(store.load()).toBeNull();
  });
});
