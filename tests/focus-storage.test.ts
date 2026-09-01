import { describe, expect, it } from "vitest";

import { FocusStorage, type FocusVaultAdapter } from "../src/focus/storage";

interface FocusSessionRecordFixture {
  [key: string]: unknown;
  id: string;
  deviceId: string;
  startTime: string;
  plannedDurationMs: number;
  endTime: string;
  inputCharacters: number;
  netCharacters: number;
  activeMs: number;
  idleMs: number;
  awayMs: number;
  endReason: "completed" | "manual" | "shutdown" | "recovered";
}

class MemoryAdapter implements FocusVaultAdapter {
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

function record(
  id: string,
  deviceId = "pc-a",
  endTime = "2026-08-24T12:00:00.000Z",
): FocusSessionRecordFixture {
  return {
    id,
    deviceId,
    startTime: "2026-08-24T11:15:00.000Z",
    plannedDurationMs: 25 * 60_000,
    endTime,
    inputCharacters: 20,
    netCharacters: 14,
    activeMs: 10 * 60_000,
    idleMs: 2 * 60_000,
    awayMs: 0,
    endReason: "completed",
  };
}

describe("FocusStorage", () => {
  it("appends a completed session under its ending UTC month without overwriting", async () => {
    const adapter = new MemoryAdapter();
    const storage = new FocusStorage<FocusSessionRecordFixture>(adapter, "写作日历数据");

    await storage.appendSession(record("a"));
    await storage.appendSession(record("b"));

    expect([...adapter.files.keys()]).toEqual([
      "写作日历数据/focus/pc-a/2026-08.jsonl",
    ]);
    expect(adapter.files.get("写作日历数据/focus/pc-a/2026-08.jsonl")?.split("\n")).toHaveLength(3);
    expect(JSON.parse(adapter.files.get("写作日历数据/focus/pc-a/2026-08.jsonl")!.split("\n")[0]).id).toBe("a");
    expect(JSON.parse(adapter.files.get("写作日历数据/focus/pc-a/2026-08.jsonl")!.split("\n")[1]).id).toBe("b");
  });

  it("appends current-format rows without rewriting legacy bytes and tolerates additive fields", async () => {
    const adapter = new MemoryAdapter();
    const storage = new FocusStorage<FocusSessionRecordFixture>(adapter, "写作日历数据");
    const path = "写作日历数据/focus/pc-a/2026-08.jsonl";
    const legacyLine = JSON.stringify(record("legacy"));
    await adapter.write(path, `${legacyLine}\n`);

    await storage.appendSession({
      ...record("current"),
      futureOnlyField: { retainedByReader: true },
    });

    const lines = adapter.files.get(path)!.trimEnd().split("\n");
    expect(lines[0]).toBe(legacyLine);
    expect(JSON.parse(lines[1])).toMatchObject({
      id: "current",
      formatVersion: 1,
      futureOnlyField: { retainedByReader: true },
    });

    const loaded = await storage.loadSessions();
    expect(loaded.records.map((item) => item.id)).toEqual(["legacy", "current"]);
    expect(loaded.warnings).toEqual([]);
  });

  it("serializes concurrent appends and keeps device/month files separate", async () => {
    const adapter = new MemoryAdapter();
    const storage = new FocusStorage<FocusSessionRecordFixture>(adapter, "写作日历数据");

    await Promise.all([
      storage.appendSession(record("a", "pc-a", "2026-08-31T23:59:59.000Z")),
      storage.appendSession(record("b", "pc-a", "2026-09-01T00:00:00.000Z")),
      storage.appendSession(record("c", "pc-b", "2026-08-24T12:00:00.000Z")),
    ]);

    expect(adapter.files.get("写作日历数据/focus/pc-a/2026-08.jsonl")).toContain('"id":"a"');
    expect(adapter.files.get("写作日历数据/focus/pc-a/2026-09.jsonl")).toContain('"id":"b"');
    expect(adapter.files.get("写作日历数据/focus/pc-b/2026-08.jsonl")).toContain('"id":"c"');
  });

  it("loads every device/month file, skips damaged rows, and reports warnings", async () => {
    const adapter = new MemoryAdapter();
    const storage = new FocusStorage<FocusSessionRecordFixture>(adapter, "写作日历数据");
    await adapter.mkdir("写作日历数据");
    await adapter.mkdir("写作日历数据/focus");
    await adapter.mkdir("写作日历数据/focus/pc-a");
    await adapter.mkdir("写作日历数据/focus/pc-b");
    await adapter.write(
      "写作日历数据/focus/pc-a/2026-08.jsonl",
      `${JSON.stringify(record("a"))}\n{not-json}\n${JSON.stringify({ id: "incomplete" })}\n`,
    );
    await adapter.write(
      "写作日历数据/focus/pc-b/2026-09.jsonl",
      `${JSON.stringify(record("b", "pc-b", "2026-09-05T12:00:00.000Z"))}\n`,
    );

    const loaded = await storage.loadSessions();

    expect(loaded.records.map((item) => item.id)).toEqual(["a", "b"]);
    expect(loaded.files).toEqual([
      "写作日历数据/focus/pc-a/2026-08.jsonl",
      "写作日历数据/focus/pc-b/2026-09.jsonl",
    ]);
    expect(loaded.warnings).toHaveLength(2);
    expect(loaded.warnings).toEqual([
      expect.objectContaining({
        path: "写作日历数据/focus/pc-a/2026-08.jsonl",
        line: 2,
        kind: "invalid-json",
      }),
      expect.objectContaining({
        path: "写作日历数据/focus/pc-a/2026-08.jsonl",
        line: 3,
        kind: "invalid-record",
      }),
    ]);
  });

  it("returns empty results when the focus directory does not exist", async () => {
    const storage = new FocusStorage<FocusSessionRecordFixture>(new MemoryAdapter(), "写作日历数据");

    await expect(storage.loadSessions()).resolves.toEqual({ records: [], warnings: [], files: [] });
  });

  it("keeps legacy records without a format version and rejects unsupported versions", async () => {
    const adapter = new MemoryAdapter();
    const storage = new FocusStorage<FocusSessionRecordFixture>(adapter, "写作日历数据");
    await adapter.mkdir("写作日历数据");
    await adapter.mkdir("写作日历数据/focus");
    await adapter.mkdir("写作日历数据/focus/pc-a");
    await adapter.write(
      "写作日历数据/focus/pc-a/2026-08.jsonl",
      `${JSON.stringify(record("legacy"))}\n${JSON.stringify({ ...record("future"), formatVersion: 2 })}\n`,
    );

    const loaded = await storage.loadSessions();

    expect(loaded.records.map((item) => item.id)).toEqual(["legacy"]);
    expect(loaded.warnings).toEqual([
      expect.objectContaining({ line: 2, kind: "invalid-record" }),
    ]);
  });

  it("rejects unsafe roots, device identifiers, and invalid ending timestamps", async () => {
    const adapter = new MemoryAdapter();
    expect(() => new FocusStorage<FocusSessionRecordFixture>(adapter, "../outside")).toThrow();
    const storage = new FocusStorage<FocusSessionRecordFixture>(adapter, "写作日历数据");

    await expect(storage.appendSession(record("bad", "../pc"))).resolves.toBe(
      "写作日历数据/focus/pc/2026-08.jsonl",
    );
    await expect(
      storage.appendSession(record("bad-date", "pc-a", "not-a-date")),
    ).rejects.toThrow("Invalid focus session ending timestamp");
  });
});
