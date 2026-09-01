import { describe, expect, it } from "vitest";

import { buildActivityEvent } from "../src/service/activity-event";
import type { TrackedEditorActivity } from "../src/tracking/codemirror";

const tracked = (overrides: Partial<TrackedEditorActivity> = {}): TrackedEditorActivity => ({
  docChanged: true,
  insertedText: "你好 world 2026!",
  deletedText: "旧",
  userEvents: ["input.type"],
  source: "typing",
  countsAsManual: true,
  recordsActivity: true,
  hasInsertion: true,
  hasDeletion: true,
  ...overrides,
});

describe("activity event builder", () => {
  it("stores creative and compatible body-character buckets independently", () => {
    const event = buildActivityEvent({
      activity: tracked(),
      eventId: "event-a",
      deviceId: "pc-a",
      fileId: "file-a",
      path: "正文/第一章.md",
      timestamp: new Date("2026-08-24T12:00:00.000Z"),
      timezone: "Asia/Shanghai",
      localDate: "2026-08-24",
    });

    expect(event.counts).toEqual({ typed: 4, paste: 0, otherInserted: 0, deleted: 1 });
    expect(event.bodyCharacterCounts).toEqual({ typed: 12, paste: 0, otherInserted: 0, deleted: 1 });
  });

  it("keeps paste separate and redo outside manual input", () => {
    const base = {
      eventId: "event-a",
      deviceId: "pc-a",
      fileId: "file-a",
      path: "正文/第一章.md",
      timestamp: new Date("2026-08-24T12:00:00.000Z"),
      timezone: "Asia/Shanghai",
      localDate: "2026-08-24",
    };
    const pasted = buildActivityEvent({
      ...base,
      activity: tracked({ source: "paste", countsAsManual: false, insertedText: "粘贴", deletedText: "", hasDeletion: false }),
    });
    const redone = buildActivityEvent({
      ...base,
      eventId: "event-b",
      activity: tracked({ source: "redo", countsAsManual: false, insertedText: "重做", deletedText: "", hasDeletion: false }),
    });

    expect(pasted.counts).toMatchObject({ typed: 0, paste: 2, otherInserted: 0 });
    expect(redone.counts).toMatchObject({ typed: 0, paste: 0, otherInserted: 2 });
  });
});
