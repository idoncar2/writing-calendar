import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";

const host = {
  Platform: { isMobile: false, isIosApp: false, isAndroidApp: false, isMacOS: false, isWin: true, isLinux: false },
  Notice: class {},
  getAllTags: () => [],
  TFile: class {},
};
const bundle = buildSync({
  entryPoints: ["src/service/runtime.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
}).outputFiles[0].text;
const compiled = { exports: {} as Record<string, any> };
const require = createRequire(import.meta.url);
new Function("require", "module", "exports", bundle)(
  (name: string) => name === "obsidian" ? host : require(name),
  compiled, compiled.exports,
);
const Runtime = compiled.exports.WritingCalendarRuntime;

function setup() {
  const file = { path: "writing/draft.md", extension: "md", stat: { ctime: 100, mtime: 200, size: 25 } };
  const other = { path: "writing/changed.md", extension: "md", stat: { ctime: 101, mtime: 201, size: 28 } };
  const snapshots: Record<string, any> = {
    [file.path]: { path: file.path, fileId: "existing", mtime: 200, size: 25 },
    [other.path]: { path: other.path, fileId: "other", mtime: 201, size: 20 },
  };
  const fileIndex = {
    getByPath: (path: string) => snapshots[path],
    getById: (id: string) => Object.values(snapshots).find((snapshot) => snapshot.fileId === id),
    listCurrent: () => [],
    upsert: vi.fn(),
  };
  const saves = vi.fn(async () => {});
  const app = {
    vault: {
      adapter: {},
      getName: () => "Test vault",
      getFiles: () => [file, other],
      cachedRead: vi.fn(async () => "test"),
    },
    metadataCache: { getFileCache: () => null },
  };
  const runtime = new Runtime({
    app,
    settings: { deviceId: "device-test", activationDate: "2026-10-01", dataFolder: "WritingCalendarData" },
    fileIndex,
    saveLocalState: saves,
    diagnosticBaselineStore: { load: () => null, save() {} },
    isMobile: true,
  }) as any;
  return { runtime, file, other, fileIndex, app, saves };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("nonblocking startup safety", () => {
  it("buffers edits before/during ledger loading and replays them in order with original timestamps", async () => {
    const { runtime, file } = setup();
    let finishLedger!: () => void;
    const ledgerLoading = new Promise<void>((resolve) => { finishLedger = resolve; });
    runtime.storage.ensureDataFolder = vi.fn(async () => "ready");
    runtime.writeDeviceMetadata = vi.fn(async () => {});
    runtime.reloadSyncedData = vi.fn(async () => ledgerLoading);
    runtime.scanAllFiles = vi.fn(async () => {});
    runtime.recordReadyActivity = vi.fn(async () => {});
    runtime.waitForHistoryIdle = vi.fn(async () => {});
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T09:00:00.000Z"));
    await runtime.recordActivity(file, { kind: "typing" });
    const firstAt = new Date();
    const task = runtime.initialize();
    vi.setSystemTime(new Date("2026-10-17T09:00:04.000Z"));
    await runtime.recordActivity(file, { kind: "paste" });
    const secondAt = new Date();
    // The writer drains both edits without waiting for historical ledger reads.
    await runtime.startRecording();
    expect(runtime.recordReadyActivity).toHaveBeenCalledTimes(2);
    expect(runtime.getState().recordingReady).toBe(true);
    finishLedger();
    await task;
    expect(runtime.recordReadyActivity).toHaveBeenCalledTimes(2);
    expect(runtime.recordReadyActivity.mock.calls[0][2]).toEqual(firstAt);
    expect(runtime.recordReadyActivity.mock.calls[1][2]).toEqual(secondAt);
    expect(runtime.scanAllFiles).toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });

  it("drains edits arriving during replay before marking history ready", async () => {
    const { runtime, file } = setup();
    runtime.storage.ensureDataFolder = vi.fn(async () => "ready");
    runtime.writeDeviceMetadata = vi.fn(async () => {});
    runtime.reloadSyncedData = vi.fn(async () => {});
    runtime.scanAllFiles = vi.fn(async () => {});
    let resumeFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => { resumeFirst = resolve; });
    let startedFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => { startedFirst = resolve; });
    runtime.waitForHistoryIdle = vi.fn(async () => {});
    runtime.recordReadyActivity = vi.fn(async () => {
      if (runtime.recordReadyActivity.mock.calls.length === 1) {
        startedFirst();
        await firstWrite;
      }
    });
    await runtime.recordActivity(file, { source: "typing" });
    const startup = runtime.initialize();
    await firstStarted;
    await runtime.recordActivity(file, { source: "paste" });
    expect(runtime.activityReady).toBe(false);
    resumeFirst();
    await startup;
    expect(runtime.recordReadyActivity).toHaveBeenCalledTimes(2);
    expect(runtime.activityReady).toBe(true);
    runtime.dispose();
  });

  it("actually writes an early edit into the existing file's ledger identity", async () => {
    const { runtime, file } = setup();
    runtime.storage.ensureDataFolder = vi.fn(async () => "ready");
    const appendEvent = vi.fn(async (_event: unknown) => {});
    runtime.storage.appendEvent = appendEvent;
    runtime.writeDeviceMetadata = vi.fn(async () => {});
    runtime.reloadSyncedData = vi.fn(async () => {});
    runtime.scanAllFiles = vi.fn(async () => {});
    runtime.waitForHistoryIdle = vi.fn(async () => {});
    const earlyAt = new Date("2026-10-17T08:30:15.000Z");
    expect(runtime.getState().initializing).toBe(true);
    await runtime.recordActivity(file, {
      source: "typing", insertedText: "你好", deletedText: "", userEvents: ["input.type"],
      docChanged: true, countsAsManual: true, recordsActivity: true,
      hasInsertion: true, hasDeletion: false,
    }, earlyAt);
    await runtime.initialize();
    expect(runtime.getState()).toMatchObject({ initializing: false, paused: false });
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(appendEvent.mock.calls[0][0]).toMatchObject({
      timestamp: earlyAt.toISOString(),
    });
    expect(appendEvent.mock.calls[0][0]).toMatchObject({
      fileId: "existing",
      path: file.path,
      source: "typing",
      counts: { typed: 2, paste: 0, otherInserted: 0, deleted: 0 },
    });
    expect(runtime.getDashboard().today.manual).toBe(2);
    runtime.dispose();
  });

  it("lets the recorder persist immediately without touching old ledgers", async () => {
    const { runtime, file } = setup();
    runtime.storage.ensureDataFolder = vi.fn(async () => "ready");
    const appendEvent = vi.fn(async (_event: unknown) => {});
    runtime.storage.appendEvent = appendEvent;
    runtime.storage.loadEvents = vi.fn(async () => { throw new Error("History is unavailable"); });
    await runtime.recordActivity(file, {
      source: "typing", insertedText: "开始", deletedText: "", userEvents: ["input.type"],
      docChanged: true, countsAsManual: true, recordsActivity: true,
      hasInsertion: true, hasDeletion: false,
    });
    await runtime.startRecording();
    expect(runtime.getState()).toMatchObject({ recordingReady: true, paused: false, initializing: true });
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(runtime.storage.loadEvents).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("preserves a freshly written event when a stale historical read resolves", async () => {
    const { runtime, file } = setup();
    runtime.storage.ensureDataFolder = vi.fn(async () => "ready");
    runtime.writeDeviceMetadata = vi.fn(async () => {});
    runtime.scanAllFiles = vi.fn(async () => {});
    runtime.waitForHistoryIdle = vi.fn(async () => {});
    const earlyAt = new Date("2026-10-17T09:00:00.000Z");
    const oldEvent = {
      eventId: "old", deviceId: "old-device", timestamp: "2026-10-16T09:00:00.000Z",
      localDate: "2026-10-16", timezone: "UTC",
      fileId: "existing", path: file.path, source: "typing", formatVersion: 1,
      counts: { typed: 1, paste: 0, otherInserted: 0, deleted: 0 },
      bodyCharacterCounts: { typed: 1, paste: 0, otherInserted: 0, deleted: 0 },
    };
    let finishRead!: (value: any) => void;
    const loadedEvents = new Promise<any>((resolve) => { finishRead = resolve; });
    runtime.storage.loadEvents = vi.fn(async () => loadedEvents);
    runtime.storage.loadProjectVersions = vi.fn(async () => ({ records: [], warnings: [] }));
    runtime.storage.loadDeviceMetadata = vi.fn(async () => ({ records: [], warnings: [], files: [] }));
    runtime.storage.appendEvent = vi.fn(async () => {});
    const initialization = runtime.initialize();
    await runtime.startRecording();
    expect(runtime.getState().recordingReady).toBe(true);
    await runtime.recordActivity(file, {
      source: "typing", insertedText: "你好", deletedText: "", userEvents: ["input.type"],
      docChanged: true, countsAsManual: true, recordsActivity: true,
      hasInsertion: true, hasDeletion: false,
    }, earlyAt);
    expect(runtime.getDashboard().today.manual).toBe(2);
    finishRead({
      events: [oldEvent], files: ["old.jsonl"], warnings: [],
      rawEventCount: 1, duplicateEventIds: [],
    });
    await initialization;
    expect(runtime.events.map((event: any) => event.eventId)).toContain("old");
    expect(runtime.events.length).toBe(2);
    expect(runtime.events.filter((event: any) => event.source === "typing" && event.deviceId === "device-test")).toHaveLength(1);
    expect(runtime.getDashboard().today.manual).toBe(2);
    expect(runtime.ledgerReport.eventCount).toBe(2);
    runtime.dispose();
  });

  it("re-reads only changed files during startup; an explicit rescan visits every file", async () => {
    vi.stubGlobal("window", globalThis);
    const { runtime, file, other, saves } = setup();
    runtime.activityReady = true;
    runtime.scanFile = vi.fn(async () => ({ fileId: "a" }));
    await runtime.scanAllFiles(true);
    expect(runtime.scanFile).toHaveBeenCalledTimes(1);
    expect(runtime.scanFile.mock.calls[0][0]).toBe(other);
    await runtime.scanAllFiles();
    expect(runtime.scanFile).toHaveBeenCalledTimes(3);
    expect(runtime.scanFile.mock.calls.slice(1).map((call: any[]) => call[0])).toEqual([file, other]);
    expect(saves).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });
});
