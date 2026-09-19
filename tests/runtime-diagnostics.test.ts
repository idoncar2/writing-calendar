import { describe, expect, it } from "vitest";

import {
  appendDiagnosticDeviceEvent,
  compactDiagnosticDeviceEvents,
} from "../src/diagnostics/device-events";
import type { DiagnosticDeviceEvent } from "../src/diagnostics/model";

const event = (deviceId: string, timestamp: string): DiagnosticDeviceEvent => ({
  deviceId,
  timestamp,
});

describe("runtime diagnostic ledger retention", () => {
  it("keeps one device event per device while choosing the latest valid timestamp", () => {
    const compacted = compactDiagnosticDeviceEvents([
      // This sorts before the UTC row lexically but is later by absolute time.
      event("device-a", "2026-08-29T20:00:01-05:00"),
      event("device-a", "2026-08-30T00:00:00.000Z"),
      // Invalid-only devices still need to contribute to deviceCount.
      event("device-b", "not-a-date"),
      event("device-c", "2026-08-30T01:00:00.000Z"),
      event("device-c", "also-not-a-date"),
    ]);

    expect(compacted).toHaveLength(3);
    expect(new Map(compacted.map((item) => [item.deviceId, item.timestamp]))).toEqual(
      new Map([
        ["device-a", "2026-08-29T20:00:01-05:00"],
        ["device-b", "not-a-date"],
        ["device-c", "2026-08-30T01:00:00.000Z"],
      ]),
    );
  });

  it("updates a compact report without reintroducing historical rows", () => {
    const initial = compactDiagnosticDeviceEvents([
      event("device-a", "2026-08-30T01:00:00.000Z"),
      event("device-b", "not-a-date"),
    ]);

    const afterOlder = appendDiagnosticDeviceEvent(initial, event("device-a", "2026-08-29T01:00:00.000Z"));
    const afterInvalid = appendDiagnosticDeviceEvent(afterOlder, event("device-a", "also-not-a-date"));
    const afterNewer = appendDiagnosticDeviceEvent(afterInvalid, event("device-a", "2026-08-31T01:00:00.000Z"));

    expect(afterOlder).toHaveLength(2);
    expect(afterInvalid).toHaveLength(2);
    expect(afterNewer).toHaveLength(2);
    expect(afterNewer.find((item) => item.deviceId === "device-a")?.timestamp).toBe("2026-08-31T01:00:00.000Z");
  });
});
