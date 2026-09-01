export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const fallbackValues = new Map<string, string>();

export function deviceIdentityStorageKey(vaultName: string): string {
  return `writing-calendar:${vaultName}:device-id`;
}

export function getBrowserLocalStorage(): LocalStorageLike | undefined {
  try {
    return typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function generatedDeviceId(): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `device-${value}`;
}

/** A vault-scoped identity that is deliberately independent of sync settings. */
export class LocalDeviceIdentity {
  private readonly key: string;

  constructor(
    private readonly vaultName: string,
    private readonly storage: LocalStorageLike | undefined = getBrowserLocalStorage(),
  ) {
    this.key = deviceIdentityStorageKey(vaultName);
  }

  getOrCreate(createId: () => string = generatedDeviceId): string {
    const existing = this.read();
    if (existing) return existing;

    const deviceId = createId();
    try {
      if (this.storage) this.storage.setItem(this.key, deviceId);
      else fallbackValues.set(this.key, deviceId);
    } catch {
      fallbackValues.set(this.key, deviceId);
    }
    return deviceId;
  }

  private read(): string | null {
    try {
      const value = this.storage ? this.storage.getItem(this.key) : fallbackValues.get(this.key) ?? null;
      return value?.trim() || null;
    } catch {
      return fallbackValues.get(this.key)?.trim() || null;
    }
  }
}
