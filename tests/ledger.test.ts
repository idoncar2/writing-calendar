import { describe, expect, it } from "vitest";

import {
  decodeJsonl,
  encodeJsonl,
} from "../src/ledger/jsonl";
import {
  mergeEvents,
} from "../src/ledger/merge";
import type { ActivityEvent } from "../src/ledger/types";

const event = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  eventId: "event-a",
  deviceId: "device-a",
  timestamp: "2026-08-24T01:02:03.000Z",
  localDate: "2026-08-24",
  timezone: "Asia/Shanghai",
  fileId: "file-a",
  path: "notes/chapter.md",
  source: "typing",
  counts: {
    typed: 3,
    paste: 0,
    otherInserted: 0,
    deleted: 0,
  },
  formatVersion: 1,
  ...overrides,
});

describe("ledger JSONL", () => {
  it("round-trips events as newline-delimited JSON and ignores empty lines", () => {
    const first = event({ eventId: "event-a" });
    const second = event({ eventId: "event-b", deviceId: "device-b" });

    const encoded = encodeJsonl([first, second]);
    expect(encoded).toBe(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
    expect(decodeJsonl(`\n${encoded}\n`).events).toEqual([first, second]);
  });

  it("retains both creative and body-character count buckets in the ledger", () => {
    const dualBucket = event({
      eventId: "dual-count",
      bodyCharacterCounts: {
        typed: 30,
        paste: 20,
        otherInserted: 10,
        deleted: 5,
      },
    });

    expect(decodeJsonl(encodeJsonl([dualBucket])).events[0]).toMatchObject({
      counts: dualBucket.counts,
      bodyCharacterCounts: dualBucket.bodyCharacterCounts,
    });
  });

  it("keeps valid events around malformed middle and trailing rows and reports warnings", () => {
    const first = event({ eventId: "event-a" });
    const second = event({ eventId: "event-b" });
    const input = `${JSON.stringify(first)}\n\nnot-json\n${JSON.stringify(second)}\n{\"truncated\":`;

    const decoded = decodeJsonl(input);

    expect(decoded.events).toEqual([first, second]);
    expect(decoded.warnings).toEqual([
      expect.objectContaining({ line: 3 }),
      expect.objectContaining({ line: 5 }),
    ]);
  });

  it("does not turn unrelated external JSON changes into activity events", () => {
    const decoded = decodeJsonl(
      JSON.stringify({ path: "notes/chapter.md", changedBytes: 120 }),
    );

    expect(decoded.events).toEqual([]);
    expect(decoded.warnings).toHaveLength(1);
  });
});

describe("ledger merge", () => {
  it("deduplicates stable event IDs and sorts merged device ledgers deterministically", () => {
    const first = event({
      eventId: "event-b",
      timestamp: "2026-08-24T01:02:04.000Z",
    });
    const second = event({
      eventId: "event-a",
      timestamp: "2026-08-24T01:02:03.000Z",
    });
    const third = event({
      eventId: "event-c",
      timestamp: "2026-08-24T01:02:04.000Z",
      deviceId: "device-b",
    });

    expect(mergeEvents([[first, second], [third, first]])).toEqual([
      second,
      first,
      third,
    ]);
  });

  it("chooses the same duplicate representation regardless of device file order", () => {
    const olderCopy = event({
      eventId: "same-id",
      path: "notes/old.md",
      counts: { typed: 1, paste: 0, otherInserted: 0, deleted: 0 },
    });
    const newerCopy = event({
      eventId: "same-id",
      path: "notes/new.md",
      counts: { typed: 2, paste: 0, otherInserted: 0, deleted: 0 },
    });

    expect(mergeEvents([[olderCopy], [newerCopy]])).toEqual(
      mergeEvents([[newerCopy], [olderCopy]]),
    );
  });
});
