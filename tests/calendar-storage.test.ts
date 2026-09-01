import { describe, expect, it } from "vitest";

import { CalendarStorage, type TextVaultAdapter } from "../src/storage/calendar-storage";
import type { ActivityEvent } from "../src/ledger/types";
import type { ProjectVersionRecord } from "../src/projects/versions";

class MemoryAdapter implements TextVaultAdapter {
  readonly files = new Map<string, string>();
  readonly folders = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.folders.add(path);
  }

  async read(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`Missing file: ${path}`);
    return value;
  }

  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }

  async append(path: string, data: string): Promise<void> {
    await Promise.resolve();
    this.files.set(path, `${this.files.get(path) ?? ""}${data}`);
  }

  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    const prefix = `${path}/`;
    const immediate = (candidate: string): boolean => {
      const rest = candidate.slice(prefix.length);
      return candidate.startsWith(prefix) && rest.length > 0 && !rest.includes("/");
    };
    return {
      files: [...this.files.keys()].filter(immediate),
      folders: [...this.folders].filter(immediate),
    };
  }
}

const event = (eventId: string, deviceId = "pc-a"): ActivityEvent => ({
  eventId,
  deviceId,
  timestamp: "2026-08-24T12:00:00.000Z",
  localDate: "2026-08-24",
  timezone: "Asia/Shanghai",
  fileId: "file-a",
  path: "正文/第一章.md",
  source: "typing",
  counts: { typed: 2, paste: 0, otherInserted: 0, deleted: 0 },
  bodyCharacterCounts: { typed: 3, paste: 0, otherInserted: 0, deleted: 0 },
  formatVersion: 1,
});

describe("CalendarStorage", () => {
  it("does not recreate a missing returning-user folder without permission", async () => {
    const adapter = new MemoryAdapter();
    const storage = new CalendarStorage(adapter, "写作日历数据");

    await expect(storage.ensureDataFolder(false)).resolves.toBe("missing");
    expect(adapter.folders.size).toBe(0);
    await expect(storage.ensureDataFolder(true)).resolves.toBe("created");
    expect(adapter.folders).toEqual(
      new Set(["写作日历数据", "写作日历数据/projects", "写作日历数据/ledgers", "写作日历数据/devices"]),
    );
  });

  it("serializes concurrent appends to the local device ledger and reads all devices", async () => {
    const adapter = new MemoryAdapter();
    const storage = new CalendarStorage(adapter, "写作日历数据");
    await storage.ensureDataFolder(true);

    await Promise.all([storage.appendEvent(event("a")), storage.appendEvent(event("b"))]);
    await adapter.mkdir("写作日历数据/ledgers/pc-b");
    await adapter.write(
      "写作日历数据/ledgers/pc-b/2026-08.jsonl",
      `${JSON.stringify(event("c", "pc-b"))}\n{truncated`,
    );

    const loaded = await storage.loadEvents();
    expect(loaded.events.map((item) => item.eventId)).toEqual(["a", "b", "c"]);
    expect(loaded.warnings).toEqual([
      expect.objectContaining({ path: "写作日历数据/ledgers/pc-b/2026-08.jsonl", line: 2 }),
    ]);
  });

  it("reports raw valid rows and duplicate event IDs while returning deduplicated events", async () => {
    const adapter = new MemoryAdapter();
    const storage = new CalendarStorage(adapter, "写作日历数据");
    await storage.ensureDataFolder(true);
    await adapter.mkdir("写作日历数据/ledgers/pc-a");
    const first = event("same-id", "pc-a");
    const duplicate = event("same-id", "pc-b");
    await adapter.write(
      "写作日历数据/ledgers/pc-a/2026-08.jsonl",
      `${JSON.stringify(first)}\n${JSON.stringify(duplicate)}\nnot-json\n`,
    );

    const loaded = await storage.loadEvents();

    expect(loaded.rawEventCount).toBe(2);
    expect(loaded.events).toHaveLength(1);
    expect(loaded.duplicateEventIds).toEqual(["same-id"]);
    expect(loaded.warnings).toHaveLength(1);
  });

  it("loads device metadata without exposing arbitrary metadata as diagnostics", async () => {
    const adapter = new MemoryAdapter();
    const storage = new CalendarStorage(adapter, "写作日历数据");
    await storage.ensureDataFolder(true);
    await adapter.write(
      "写作日历数据/devices/phone-b.json",
      JSON.stringify({
        formatVersion: 1,
        deviceId: "phone-b",
        userAgent: "Mozilla/5.0 (Linux; Android 14; Mobile)",
        lastSeenAt: "2026-08-25T12:00:00.000Z",
        privateField: "ignored",
      }),
    );

    const loaded = await storage.loadDeviceMetadata();

    expect(loaded.records).toEqual([
      {
        deviceId: "phone-b",
        userAgent: "Mozilla/5.0 (Linux; Android 14; Mobile)",
        lastSeenAt: "2026-08-25T12:00:00.000Z",
      },
    ]);
  });

  it("round-trips append-only project versions without overwriting a sibling", async () => {
    const adapter = new MemoryAdapter();
    const storage = new CalendarStorage(adapter, "写作日历数据");
    await storage.ensureDataFolder(true);
    const first: ProjectVersionRecord = {
      formatVersion: 1,
      projectId: "novel",
      revisionId: "r1",
      parentRevisionIds: [],
      deviceId: "pc-a",
      timestamp: "2026-08-24T12:00:00.000Z",
      deleted: false,
      definition: { id: "novel", name: "小说", includeFolders: ["正文"] },
    };
    const second = { ...first, revisionId: "r2", deviceId: "pc-b" };

    await storage.writeProjectVersion(first);
    await storage.writeProjectVersion(second);
    const loaded = await storage.loadProjectVersions();

    expect(loaded.records.map((item) => item.revisionId).sort()).toEqual(["r1", "r2"]);
    expect([...adapter.files.keys()].filter((path) => path.includes("/projects/novel/"))).toHaveLength(2);
  });
});
