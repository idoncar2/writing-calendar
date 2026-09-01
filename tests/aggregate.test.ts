import { describe, expect, it } from "vitest";

import { aggregateEvents } from "../src/ledger/aggregate";
import type { ActivityEvent } from "../src/ledger/types";

const event = (
  eventId: string,
  localDate: string,
  path: string,
  counts: ActivityEvent["counts"],
  overrides: Partial<ActivityEvent> = {},
): ActivityEvent => ({
  eventId,
  deviceId: "device-a",
  timestamp: `${localDate}T01:02:03.000Z`,
  localDate,
  timezone: "Asia/Shanghai",
  fileId: "file-a",
  path,
  source: "typing",
  counts,
  formatVersion: 1,
  ...overrides,
});

describe("activity aggregation", () => {
  it("aggregates typed, paste, other insertion and deletion counts by local date and file", () => {
    const rows = aggregateEvents([
      event("typed", "2026-08-24", "notes/chapter.md", {
        typed: 5,
        paste: 0,
        otherInserted: 0,
        deleted: 0,
      }),
      event("paste", "2026-08-24", "notes/chapter.md", {
        typed: 0,
        paste: 3,
        otherInserted: 0,
        deleted: 0,
      }, { source: "paste" }),
      event("other", "2026-08-24", "notes/chapter.md", {
        typed: 0,
        paste: 0,
        otherInserted: 4,
        deleted: 0,
      }, { source: "drop" }),
      event("deleted", "2026-08-24", "notes/chapter.md", {
        typed: 0,
        paste: 0,
        otherInserted: 0,
        deleted: 6,
      }, { source: "delete" }),
    ]);

    expect(rows).toEqual([
      {
        localDate: "2026-08-24",
        fileId: "file-a",
        path: "notes/chapter.md",
        manual: 5,
        increment: 12,
        deletion: 6,
        net: 6,
        manualNet: -1,
      },
    ]);
  });

  it("can include paste in manual input without changing increment or deletion", () => {
    const rows = aggregateEvents(
      [
        event("typed", "2026-08-24", "notes/chapter.md", {
          typed: 5,
          paste: 0,
          otherInserted: 0,
          deleted: 0,
        }),
        event("paste", "2026-08-24", "notes/chapter.md", {
          typed: 0,
          paste: 3,
          otherInserted: 0,
          deleted: 0,
        }),
      ],
      { includePasteInManual: true },
    );

    expect(rows[0]).toMatchObject({ manual: 8, increment: 8, deletion: 0, net: 8, manualNet: 8 });
  });

  it("derives manualNet as manual input minus deletion, excluding paste and other insertions", () => {
    const rows = aggregateEvents([
      event("mixed", "2026-08-24", "notes/chapter.md", {
        typed: 10,
        paste: 2,
        otherInserted: 0,
        deleted: 3,
      }),
    ]);

    expect(rows[0]).toMatchObject({
      manual: 10,
      increment: 12,
      deletion: 3,
      net: 9,
      manualNet: 7,
    });
  });

  it("preserves separate local-date and path dimensions and allows negative net", () => {
    const rows = aggregateEvents([
      event("deleted", "2026-08-24", "notes/chapter.md", {
        typed: 0,
        paste: 0,
        otherInserted: 0,
        deleted: 10,
      }, { source: "delete" }),
      event("renamed", "2026-08-25", "notes/renamed.md", {
        typed: 2,
        paste: 0,
        otherInserted: 0,
        deleted: 0,
      }),
    ]);

    expect(rows).toEqual([
      {
        localDate: "2026-08-24",
        fileId: "file-a",
        path: "notes/chapter.md",
        manual: 0,
        increment: 0,
        deletion: 10,
        net: -10,
        manualNet: -10,
      },
      {
        localDate: "2026-08-25",
        fileId: "file-a",
        path: "notes/renamed.md",
        manual: 2,
        increment: 2,
        deletion: 0,
        net: 2,
        manualNet: 2,
      },
    ]);
  });

  it("switches between creative and body-character buckets without rewriting events", () => {
    const row = event("dual-count", "2026-08-24", "notes/chapter.md", {
      typed: 2,
      paste: 1,
      otherInserted: 3,
      deleted: 4,
    });
    Object.assign(row, {
      bodyCharacterCounts: {
        typed: 20,
        paste: 10,
        otherInserted: 30,
        deleted: 40,
      },
    });

    const rows = aggregateEvents(
      [row],
      { countMode: "body-characters" },
    );

    expect(rows[0]).toMatchObject({
      manual: 20,
      increment: 60,
      deletion: 40,
      net: 20,
      manualNet: -20,
    });
  });
});
