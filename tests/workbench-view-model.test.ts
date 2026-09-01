import { describe, expect, it } from "vitest";

import { FileIndex } from "../src/index/file-index";
import type { ActivityEvent } from "../src/ledger/types";
import { WritingCalendarEngine } from "../src/service/engine";
import {
  buildGoalSegments,
  computeDailyGoal,
  computeDayDetail,
  computeGoalHistory,
  computeGoalPeriod,
  computeMonthCheckins,
  GOAL_SEGMENT_COLORS,
} from "../src/views/workbench-view-model";

const event = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  eventId: "e1",
  deviceId: "pc-a",
  timestamp: "2026-08-27T12:00:00.000Z",
  localDate: "2026-08-27",
  timezone: "Asia/Shanghai",
  fileId: "file-a",
  path: "正文/第一章.md",
  source: "typing",
  counts: { typed: 10, paste: 0, otherInserted: 0, deleted: 0 },
  bodyCharacterCounts: { typed: 16, paste: 0, otherInserted: 0, deleted: 0 },
  formatVersion: 1,
  ...overrides,
});

function snapshotForToday(events: ActivityEvent[]) {
  let seq = 0;
  const index = new FileIndex(() => `file-${(seq += 1)}`);
  index.upsert({ path: "正文/第一章.md", mtime: 1, creative: 100, bodyCharacters: 160, properties: {} });
  index.upsert({ path: "正文/第二章.md", mtime: 2, creative: 50, bodyCharacters: 80, properties: {} });
  const engine = new WritingCalendarEngine({ fileIndex: index, events });
  return engine.dashboard("all", "creative", false, "2026-08-27");
}

describe("computeDailyGoal", () => {
  // 两个文件当天都有事件，但第二个文件当天手动输入为 0。
  const snapshot = snapshotForToday([
    event({ eventId: "e1", fileId: "file-1", path: "正文/第一章.md" }),
    event({
      eventId: "e2",
      fileId: "file-2",
      path: "正文/第二章.md",
      counts: { typed: 0, paste: 0, otherInserted: 0, deleted: 0 },
      bodyCharacterCounts: { typed: 0, paste: 0, otherInserted: 0, deleted: 0 },
    }),
  ]);

  it("reaches the daily goal and clamps progress at 100%", () => {
    const goal = computeDailyGoal(snapshot, "manual", 4);
    expect(goal.enabled).toBe(true);
    expect(goal.value).toBe(10);
    expect(goal.progress).toBe(1);
    expect(goal.achieved).toBe(true);
    expect(goal.contributions).toEqual([{ path: "正文/第一章.md", value: 10 }]);
  });

  it("keeps partial progress below the target", () => {
    const goal = computeDailyGoal(snapshot, "manual", 20);
    expect(goal.value).toBe(10);
    expect(goal.progress).toBe(0.5);
    expect(goal.achieved).toBe(false);
  });

  it("is disabled when the target is 0", () => {
    const goal = computeDailyGoal(snapshot, "manual", 0);
    expect(goal.enabled).toBe(false);
    expect(goal.progress).toBe(0);
    expect(goal.achieved).toBe(false);
    expect(goal.contributions).toEqual([]);
  });

  it("uses the current display path for presentation without changing the historical path", () => {
    const snapshot = snapshotForToday([event()]);
    snapshot.today.files[0].displayPath = "正文/当前名称.md";

    expect(computeDailyGoal(snapshot, "manual", 1).contributions).toEqual([
      { path: "正文/当前名称.md", value: 10 },
    ]);
    expect(computeDayDetail(snapshot, "2026-08-27").files).toEqual([
      { path: "正文/当前名称.md", increment: 10 },
    ]);
    expect(snapshot.today.files[0].path).toBe("正文/第一章.md");
  });
});

describe("buildGoalSegments", () => {
  const contributions = [
    { path: "正文/一.md", value: 40 },
    { path: "正文/二.md", value: 30 },
    { path: "正文/三.md", value: 15 },
  ];

  it("keeps one segment per document while the color scale covers them", () => {
    expect(buildGoalSegments(contributions)).toEqual([
      { label: "正文/一.md", value: 40, isOther: false },
      { label: "正文/二.md", value: 30, isOther: false },
      { label: "正文/三.md", value: 15, isOther: false },
    ]);
  });

  it("merges the lowest contributors into 其他 once the color scale runs out", () => {
    const many = GOAL_SEGMENT_COLORS + 2;
    const wide = Array.from({ length: many }, (_, index) => ({
      path: `正文/${index + 1}.md`,
      value: many - index,
    }));

    const segments = buildGoalSegments(wide);

    expect(segments).toHaveLength(GOAL_SEGMENT_COLORS);
    expect(segments.slice(0, GOAL_SEGMENT_COLORS - 1).map((segment) => segment.label)).toEqual([
      "正文/1.md",
      "正文/2.md",
      "正文/3.md",
      "正文/4.md",
    ]);
    expect(segments[GOAL_SEGMENT_COLORS - 1]).toEqual({
      label: "其他",
      value: 3 + 2 + 1,
      isOther: true,
    });
  });
});

describe("computeGoalHistory", () => {
  const snapshot = snapshotForToday([
    // 今天 08-27：手动输入 10
    event({ eventId: "e2", fileId: "file-1", path: "正文/第一章.md" }),
    // 昨天 08-26：手动输入 4
    event({
      eventId: "e1",
      fileId: "file-1",
      path: "正文/第一章.md",
      timestamp: "2026-08-26T12:00:00.000Z",
      localDate: "2026-08-26",
      counts: { typed: 4, paste: 0, otherInserted: 0, deleted: 0 },
      bodyCharacterCounts: { typed: 4, paste: 0, otherInserted: 0, deleted: 0 },
    }),
  ]);

  it("lists each day's value, target, and achievement over the 14-day window", () => {
    const history = computeGoalHistory(snapshot, "manual", 4, "2026-08-27", 14);
    expect(history).toHaveLength(14);
    expect(history[0].date).toBe("2026-08-14");
    expect(history[12]).toEqual({ date: "2026-08-26", value: 4, target: 4, achieved: true, progress: 1 });
    expect(history[13]).toEqual({ date: "2026-08-27", value: 10, target: 4, achieved: true, progress: 1 });
  });

  it("marks a day as missed when the value is below the target", () => {
    const history = computeGoalHistory(snapshot, "manual", 20, "2026-08-27", 14);
    expect(history[13]).toEqual({ date: "2026-08-27", value: 10, target: 20, achieved: false, progress: 0.5 });
  });

  it("is inert when the target is 0", () => {
    const history = computeGoalHistory(snapshot, "manual", 0, "2026-08-27", 14);
    expect(history[13]).toEqual({ date: "2026-08-27", value: 10, target: 0, achieved: false, progress: 0 });
  });
});

describe("computeGoalPeriod", () => {
  // 08-23 是周日、08-24 是周一、08-27 是周四；每处手动输入 10
  const snapshot = snapshotForToday([
    event({
      eventId: "e-sun",
      fileId: "file-1",
      path: "正文/第一章.md",
      timestamp: "2026-08-23T12:00:00.000Z",
      localDate: "2026-08-23",
    }),
    event({
      eventId: "e-mon",
      fileId: "file-1",
      path: "正文/第一章.md",
      timestamp: "2026-08-24T12:00:00.000Z",
      localDate: "2026-08-24",
    }),
    event({ eventId: "e-thu", fileId: "file-1", path: "正文/第一章.md" }),
  ]);

  it("sums the ISO week from Monday through today", () => {
    const week = computeGoalPeriod(snapshot, "manual", 30, "2026-08-27", "week");
    expect(week.current).toBe(20); // 08-24 + 08-27；周日 08-23 属于上一周
    expect(week.progress).toBeCloseTo(20 / 30);
    expect(week.achieved).toBe(false);
  });

  it("sums the calendar month regardless of week boundaries", () => {
    const month = computeGoalPeriod(snapshot, "manual", 25, "2026-08-27", "month");
    expect(month.current).toBe(30);
    expect(month.progress).toBe(1);
    expect(month.achieved).toBe(true);
  });

  it("is disabled when the target is 0", () => {
    const week = computeGoalPeriod(snapshot, "manual", 0, "2026-08-27", "week");
    expect(week.progress).toBe(0);
    expect(week.achieved).toBe(false);
  });
});

describe("computeMonthCheckins", () => {
  // 08-01 是周六（周一为首列时 leading = 5）；08-03 手动 2 未达标，08-27 手动 10 达标
  const snapshot = snapshotForToday([
    event({
      eventId: "e-0303",
      fileId: "file-1",
      path: "正文/第一章.md",
      timestamp: "2026-08-03T12:00:00.000Z",
      localDate: "2026-08-03",
      counts: { typed: 2, paste: 0, otherInserted: 0, deleted: 0 },
      bodyCharacterCounts: { typed: 2, paste: 0, otherInserted: 0, deleted: 0 },
    }),
    event({ eventId: "e-0827", fileId: "file-1", path: "正文/第一章.md" }),
  ]);

  it("lays out the current month from Monday with per-day achievement", () => {
    const checkins = computeMonthCheckins(snapshot, "manual", 4, "2026-08-27");

    expect(checkins.year).toBe(2026);
    expect(checkins.month).toBe(8);
    expect(checkins.leading).toBe(5); // 08-01 是周六
    expect(checkins.days).toHaveLength(31);
    expect(checkins.days[2]).toEqual({
      date: "2026-08-03",
      value: 2,
      achieved: false,
      isToday: false,
      isPast: true,
    });
    expect(checkins.days[26]).toEqual({
      date: "2026-08-27",
      value: 10,
      achieved: true,
      isToday: true,
      isPast: true,
    });
    expect(checkins.days[30].date).toBe("2026-08-31");
    expect(checkins.days[30].isPast).toBe(false);
    expect(checkins.days[30].achieved).toBe(false);
  });

  it("never marks a day as achieved when the target is 0", () => {
    const checkins = computeMonthCheckins(snapshot, "manual", 0, "2026-08-27");
    expect(checkins.days[26].achieved).toBe(false);
  });
});
