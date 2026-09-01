import { describe, expect, it } from "vitest";

import { mergeFocusSessions, type FocusMergeWarning } from "../src/focus/merge";
import type { FocusSessionRecord } from "../src/focus/types";

function record(id: string, overrides: Partial<FocusSessionRecord> = {}): FocusSessionRecord {
  return {
    id,
    deviceId: "pc-a",
    localDate: "2026-08-28",
    countMode: "creative",
    startTime: "2026-08-28T10:00:00.000Z",
    endTime: "2026-08-28T10:25:00.000Z",
    plannedDurationMs: 25 * 60_000,
    inputCharacters: 20,
    netCharacters: 18,
    activeMs: 10 * 60_000,
    idleMs: 12 * 60_000,
    awayMs: 3 * 60_000,
    endReason: "completed",
    formatVersion: 1,
    ...overrides,
  };
}

describe("mergeFocusSessions", () => {
  it("merges device sessions, deduplicates IDs, and sorts deterministically", () => {
    const first = record("session-b", { endTime: "2026-08-28T10:26:00.000Z" });
    const second = record("session-a", { endTime: "2026-08-28T10:25:00.000Z" });
    const third = record("session-c", {
      deviceId: "pc-b",
      endTime: "2026-08-28T10:26:00.000Z",
    });

    expect(mergeFocusSessions([[first, second], [third, first]])).toEqual([
      second,
      first,
      third,
    ]);
  });

  it("chooses one deterministic copy and warns when a session ID conflicts", () => {
    const left = record("same-session", { inputCharacters: 12, deviceId: "pc-a" });
    const right = record("same-session", { inputCharacters: 24, deviceId: "pc-b" });
    const warnings: FocusMergeWarning[] = [];

    const merged = mergeFocusSessions([[left], [right]], (warning) => warnings.push(warning));
    const reversed = mergeFocusSessions([[right], [left]], () => undefined);

    expect(merged).toHaveLength(1);
    expect(merged).toEqual(reversed);
    expect(warnings).toEqual([
      expect.objectContaining({
        id: "same-session",
        message: expect.stringContaining("同步冲突"),
      }),
    ]);
  });
});
