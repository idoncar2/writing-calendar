import { describe, expect, it } from "vitest";

import {
  deviceMetadataPath,
  ledgerPath,
  projectVersionPath,
  safePathSegment,
} from "../src/ledger/paths";

describe("synced data paths", () => {
  it("keeps every synced artifact inside the visible vault data folder", () => {
    expect(ledgerPath("写作日历数据", "pc-a", "2026-08-24T12:00:00.000Z")).toBe(
      "写作日历数据/ledgers/pc-a/2026-08.jsonl",
    );
    expect(deviceMetadataPath("写作日历数据", "pc-a")).toBe(
      "写作日历数据/devices/pc-a.json",
    );
    expect(projectVersionPath("写作日历数据", "novel", "pc-a", "2026-08-24T12:34:56.789Z")).toBe(
      "写作日历数据/projects/novel/20260824T123456789Z-pc-a.json",
    );
  });

  it("rejects traversal and normalizes identifiers to safe file segments", () => {
    expect(safePathSegment("../电脑 A/稿件")).toBe("电脑-A-稿件");
    expect(() => safePathSegment("...")) .toThrow();
  });
});
