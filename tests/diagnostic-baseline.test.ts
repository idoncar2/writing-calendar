import { describe, expect, it } from "vitest";

import {
  buildDiagnosticComparison,
  formatDiagnosticReport,
  type DiagnosticBaseline,
  type DiagnosticFileSnapshot,
} from "../src/diagnostics/model";
import {
  diagnosticBaselineStorageKey,
  LocalDiagnosticBaselineStore,
} from "../src/diagnostics/storage";

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

const file = (
  fileId: string,
  path: string,
  creative: number,
  bodyCharacters = creative,
): DiagnosticFileSnapshot => ({
  fileId,
  path,
  creative,
  bodyCharacters,
  mtime: 1,
});

const baseline: DiagnosticBaseline = {
  formatVersion: 1,
  createdAt: Date.parse("2026-08-30T18:20:00.000Z"),
  files: [
    file("a", "塔昼/第一章.md", 5_231),
    file("b", "塔昼/第二章.md", 4_102),
    file("d", "草稿/第四章.md", 1_000),
    file("increase", "笔记/增长.md", 100),
  ],
};

describe("diagnostic baseline comparison", () => {
  it("does not report every current file as new without a baseline", () => {
    const comparison = buildDiagnosticComparison(null, [file("a", "第一章.md", 100)]);

    expect(comparison.hasBaseline).toBe(false);
    expect(comparison.changes).toEqual([]);
    expect(comparison.currentFileCount).toBe(1);
    expect(comparison.baselineFileCount).toBeNull();
  });

  it("reports decreases, disappearance, additions, and moves by fileId", () => {
    const comparison = buildDiagnosticComparison(baseline, [
      file("a", "塔昼/第一章.md", 4_980),
      file("d", "正文/第四章.md", 1_000),
      file("increase", "笔记/增长.md", 200),
      file("c", "塔昼/第三章.md", 3_260),
    ]);

    expect(comparison.decreasedCount).toBe(1);
    expect(comparison.deletedCount).toBe(1);
    expect(comparison.addedCount).toBe(1);
    expect(comparison.movedCount).toBe(1);
    expect(comparison.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "decreased",
        fileId: "a",
        previousValue: 5_231,
        currentValue: 4_980,
        delta: -251,
      }),
      expect.objectContaining({ kind: "deleted", fileId: "b", path: "塔昼/第二章.md", previousValue: 4_102 }),
      expect.objectContaining({ kind: "added", fileId: "c", path: "塔昼/第三章.md", currentValue: 3_260 }),
      expect.objectContaining({
        kind: "moved",
        fileId: "d",
        previousPath: "草稿/第四章.md",
        path: "正文/第四章.md",
      }),
    ]));
    expect(comparison.changes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "decreased", fileId: "increase" }),
    ]));
  });

  it("treats same-path recreation as a deletion and an addition", () => {
    const comparison = buildDiagnosticComparison(
      { ...baseline, files: [file("old", "第一章.md", 500)] },
      [file("new", "第一章.md", 20)],
    );

    expect(comparison.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "deleted", fileId: "old" }),
      expect.objectContaining({ kind: "added", fileId: "new" }),
    ]));
    expect(comparison.movedCount).toBe(0);
  });

  it("formats a report without including正文内容", () => {
    const report = formatDiagnosticReport({
      status: "warning",
      checkedAt: "2026-08-30T21:15:00.000Z",
      dataFolder: { path: "写作日历数据", status: "ready", paused: false },
      lastReadAt: "2026-08-30T21:15:00.000Z",
      currentDevice: { deviceId: "pc", label: "电脑" },
      deviceCount: 1,
      ledger: { fileCount: 1, eventCount: 10, rawEventCount: 10, duplicateEventIds: [], warnings: [] },
      fileIndex: { healthy: true, issues: [], currentFileCount: 1, deletedFileCount: 0, aliasedFileCount: 0 },
      deletedFileCount: 0,
      aliasedFileCount: 0,
      staleDevices: [],
      baseline: { createdAt: baseline.createdAt, fileCount: baseline.files.length },
      comparison: buildDiagnosticComparison(baseline, [file("a", "塔昼/第一章.md", 4_980)]),
    });

    expect(report).toContain("Writing Calendar 数据诊断");
    expect(report).toContain("第一章.md");
    expect(report).toContain("-251");
    expect(report).not.toContain("正文内容");
  });
});

describe("local diagnostic baseline", () => {
  it("round-trips a vault-scoped baseline and ignores malformed values", () => {
    const storage = new MemoryStorage();
    const store = new LocalDiagnosticBaselineStore("My Vault", storage);
    store.save(baseline);

    expect(new LocalDiagnosticBaselineStore("My Vault", storage).load()).toEqual(baseline);
    expect(new LocalDiagnosticBaselineStore("Other Vault", storage).load()).toBeNull();

    storage.setItem(diagnosticBaselineStorageKey("My Vault"), JSON.stringify({ formatVersion: 1, files: [] }));
    expect(store.load()).toBeNull();
  });
});
