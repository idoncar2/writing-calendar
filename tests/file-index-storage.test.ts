import { afterEach, describe, expect, it, vi } from "vitest";
import { FileIndex, type SerializedFileIndex } from "../src/index/file-index";
import { decodeFileIndex, encodeFileIndex, backupBeforeIndexCompression } from "../src/storage/file-index-storage";
import { WritingCalendarEngine } from "../src/service/engine";
import type { ActivityEvent } from "../src/ledger/types";

function largeIndex(): SerializedFileIndex {
  return { formatVersion: 1, snapshots: Array.from({ length: 2000 }, (_, index) => ({
    fileId: `file-${index}`, path: "归档/小说.md", aliases: ["草稿/小说.md"], tags: ["#小说"],
    properties: { status: "draft", custom: ["甲", 2, false, null] },
    mtime: index + 1, ...(index % 2 ? { ctime: index } : {}),
    creative: index, bodyCharacters: index * 2, deleted: index !== 1999,
    ...(index !== 1999 ? { deletedAt: index + 2 } : {}),
  })) };
}

afterEach(() => vi.unstubAllGlobals());

describe("lossless index storage", () => {
  it("compresses a large index and restores every field and file identity", async () => {
    const original = largeIndex();
    const stored = await encodeFileIndex(original);
    expect(stored.formatVersion).toBe(2);
    expect(JSON.stringify(stored).length).toBeLessThan(JSON.stringify(original).length / 2);
    expect(await decodeFileIndex(JSON.parse(JSON.stringify(stored)))).toEqual(original);
  });

  it("preserves deleted-file project filtering, display paths, totals and goals", async () => {
    const original = largeIndex();
    const restored = await decodeFileIndex(await encodeFileIndex(original));
    const events: ActivityEvent[] = [{ formatVersion: 1, eventId: "event", deviceId: "pc",
      timestamp: "2026-09-14T00:00:00Z", localDate: "2026-09-14", timezone: "UTC",
      fileId: "file-0", path: "草稿/小说.md", source: "typing",
      counts: { typed: 1000, paste: 0, otherInserted: 0, deleted: 20 },
      bodyCharacterCounts: { typed: 1500, paste: 0, otherInserted: 0, deleted: 30 },
    }];
    const engine = (value: unknown) => new WritingCalendarEngine({
      fileIndex: FileIndex.from(value, () => "unused"), events,
      projects: [{ id: "novel", includeTags: ["小说"],
        advancedQuery: 'property("status") = "draft"' }],
    });
    for (const mode of ["creative", "body-characters"] as const) {
      const before = engine(original).dashboard("novel", mode, false, "2026-09-14");
      expect(before.today.manual).toBe(mode === "creative" ? 1000 : 1500);
      expect(engine(restored).dashboard("novel", mode, false, "2026-09-14")).toEqual(before);
      expect(engine(restored).goalSnapshot("novel", "manual", 2000, mode, false, "2026-09-14"))
        .toEqual(engine(original).goalSnapshot("novel", "manual", 2000, mode, false, "2026-09-14"));
    }
  });

  it("reads old indexes and keeps small indexes in their original format", async () => {
    const legacy = { formatVersion: 1 as const, snapshots: [] };
    expect(await decodeFileIndex(legacy)).toEqual(legacy);
    expect(await decodeFileIndex(undefined)).toBeUndefined();
    expect(await encodeFileIndex(legacy)).toEqual(legacy);
  });

  it("falls back to the old format on hosts without compression support", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    expect(await encodeFileIndex(largeIndex())).toEqual(largeIndex());
  });

  it("rejects corrupt or unknown compressed data instead of returning an empty index", async () => {
    await expect(decodeFileIndex({ formatVersion: 2, encoding: "gzip-base64", data: "broken" }))
      .rejects.toThrow();
    await expect(decodeFileIndex({ formatVersion: 3, snapshots: [] })).rejects.toThrow();
    const stored = await encodeFileIndex(largeIndex());
    vi.stubGlobal("DecompressionStream", undefined);
    await expect(decodeFileIndex(stored)).rejects.toThrow();
  });
});

describe("first compression backup", () => {
  it("allows a first save in a large vault with no existing plugin data", async () => {
    const read = vi.fn().mockRejectedValue(new Error("missing"));
    const write = vi.fn();
    await expect(backupBeforeIndexCompression({ exists: async () => false, read, write }, "plugin"))
      .resolves.toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it("backs up original bytes once and never overwrites the previous backup", async () => {
    const files = new Map([["plugin/data.json", "{\n  \"original\": true\n}"]]);
    const adapter = {
      exists: async (path: string) => files.has(path),
      read: async (path: string) => files.get(path)!,
      write: async (path: string, data: string) => { files.set(path, data); },
    };
    await backupBeforeIndexCompression(adapter, "plugin");
    expect(files.get("plugin/data.pre-compression.json")).toBe(files.get("plugin/data.json"));
    files.set("plugin/data.json", "updated");
    await backupBeforeIndexCompression(adapter, "plugin");
    expect(files.get("plugin/data.pre-compression.json")).toBe('{\n  "original": true\n}');
  });

  it("rejects a failed backup verification before migration can proceed", async () => {
    let written = false;
    const adapter = {
      exists: async (path: string) => path === "plugin/data.json" || written,
      read: async () => written ? "truncated" : "original",
      write: async () => { written = true; },
    };
    await expect(backupBeforeIndexCompression(adapter, "plugin")).rejects.toThrow();
  });
});
