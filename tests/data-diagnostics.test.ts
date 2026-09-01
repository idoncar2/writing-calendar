import { describe, expect, it } from "vitest";

import {
  buildDataDiagnosticSnapshot,
  deviceLabelForUserAgent,
  type DataDiagnosticInput,
} from "../src/diagnostics/model";

const baseInput = (overrides: Partial<DataDiagnosticInput> = {}): DataDiagnosticInput => ({
  now: new Date("2026-08-30T12:00:00.000Z"),
  dataFolder: {
    path: "写作日历数据",
    status: "ready",
    paused: false,
  },
  lastReadAt: "2026-08-30T11:35:00.000Z",
  currentDevice: {
    deviceId: "pc-a",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  },
  ledger: {
    fileCount: 2,
    eventCount: 18_426,
    rawEventCount: 18_426,
    duplicateEventIds: [],
    warnings: [],
    deviceEvents: [
      { deviceId: "pc-a", timestamp: "2026-08-30T10:00:00.000Z" },
      { deviceId: "phone-b", timestamp: "2026-08-29T10:00:00.000Z" },
    ],
  },
  devices: [
    { deviceId: "pc-a", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    { deviceId: "phone-b", userAgent: "Mozilla/5.0 (Linux; Android 14; Mobile)" },
  ],
  fileIndex: {
    healthy: true,
    issues: [],
    currentFileCount: 4,
    deletedFileCount: 0,
    aliasedFileCount: 0,
  },
  ...overrides,
});

describe("data diagnostics model", () => {
  it("summarizes a healthy data set without inventing warnings", () => {
    const snapshot = buildDataDiagnosticSnapshot(baseInput());

    expect(snapshot).toMatchObject({
      status: "ok",
      lastReadAt: "2026-08-30T11:35:00.000Z",
      currentDevice: { deviceId: "pc-a", label: "电脑" },
      deviceCount: 2,
      ledger: { fileCount: 2, eventCount: 18_426, duplicateEventIds: [], warnings: [] },
      fileIndex: { healthy: true, deletedFileCount: 0, aliasedFileCount: 0 },
      staleDevices: [],
    });
  });

  it("reports integrity errors and lifecycle reminders separately", () => {
    const snapshot = buildDataDiagnosticSnapshot(baseInput({
      ledger: {
        fileCount: 3,
        eventCount: 10,
        rawEventCount: 12,
        duplicateEventIds: ["duplicate-a", "duplicate-b"],
        warnings: [
          { path: "写作日历数据/ledgers/pc-a/2026-08.jsonl", line: 8, message: "损坏记录" },
        ],
        deviceEvents: [
          { deviceId: "pc-a", timestamp: "2026-08-30T10:00:00.000Z" },
          { deviceId: "phone-b", timestamp: "2026-08-25T12:00:00.000Z" },
        ],
      },
      fileIndex: {
        healthy: false,
        issues: ["当前路径映射不一致"],
        currentFileCount: 3,
        deletedFileCount: 1,
        aliasedFileCount: 2,
      },
    }));

    expect(snapshot.status).toBe("error");
    expect(snapshot.ledger.duplicateEventIds).toHaveLength(2);
    expect(snapshot.ledger.warnings).toHaveLength(1);
    expect(snapshot.fileIndex.issues).toEqual(["当前路径映射不一致"]);
    expect(snapshot.deletedFileCount).toBe(1);
    expect(snapshot.aliasedFileCount).toBe(2);
    expect(snapshot.staleDevices).toEqual([
      expect.objectContaining({ deviceId: "phone-b", label: "手机", daysSinceLastEvent: 5 }),
    ]);
  });

  it("treats a missing data folder as an error and does not report stale devices", () => {
    const snapshot = buildDataDiagnosticSnapshot(baseInput({
      dataFolder: { path: "写作日历数据", status: "missing", paused: true },
      lastReadAt: null,
      devices: [],
      ledger: {
        fileCount: 0,
        eventCount: 0,
        rawEventCount: 0,
        duplicateEventIds: [],
        warnings: [],
        deviceEvents: [],
      },
    }));

    expect(snapshot.status).toBe("error");
    expect(snapshot.deviceCount).toBe(1);
    expect(snapshot.staleDevices).toEqual([]);
  });

  it("classifies common desktop and mobile user agents with a safe fallback", () => {
    expect(deviceLabelForUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("电脑");
    expect(deviceLabelForUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("手机");
    expect(deviceLabelForUserAgent(undefined)).toBe("设备");
  });
});
