import { describe, expect, it } from "vitest";

import { FileIndex } from "../src/index/file-index";
import type { ActivityEvent } from "../src/ledger/types";
import { WritingCalendarEngine } from "../src/service/engine";

const activity = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  eventId: "e1",
  deviceId: "pc-a",
  timestamp: "2026-08-24T12:00:00.000Z",
  localDate: "2026-08-24",
  timezone: "Asia/Shanghai",
  fileId: "file-a",
  path: "草稿/第一章.md",
  source: "typing",
  counts: { typed: 10, paste: 0, otherInserted: 0, deleted: 0 },
  bodyCharacterCounts: { typed: 16, paste: 0, otherInserted: 0, deleted: 0 },
  formatVersion: 1,
  ...overrides,
});

describe("WritingCalendarEngine", () => {
  it("keeps historical paths for project attribution while exposing the current display path", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          {
            fileId: "file-a",
            path: "归档/第一章.md",
            aliases: ["示例作品/第一章.md"],
            mtime: 1,
            creative: 100,
            bodyCharacters: 160,
            properties: { status: "draft" },
            deleted: false,
          },
        ],
      },
      () => "unused",
    );
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [
        activity({
          eventId: "before-move",
          path: "示例作品/第一章.md",
          localDate: "2026-08-01",
          timestamp: "2026-08-01T12:00:00.000Z",
          counts: { typed: 10, paste: 0, otherInserted: 0, deleted: 0 },
        }),
        activity({
          eventId: "after-move",
          path: "归档/第一章.md",
          localDate: "2026-08-20",
          timestamp: "2026-08-20T12:00:00.000Z",
          counts: { typed: 5, paste: 0, otherInserted: 0, deleted: 0 },
        }),
      ],
      projects: [
        { id: "original", name: "示例作品", includeFolders: ["示例作品"] },
        { id: "discard", name: "归档", includeFolders: ["归档"] },
      ],
    });

    const original = engine.dashboard("original", "creative", false, "2026-08-20");
    expect(original.currentTotal).toBe(0);
    expect(original.daily.reduce((sum, day) => sum + day.manual, 0)).toBe(10);
    expect(original.daily[0].files[0]).toMatchObject({
      path: "示例作品/第一章.md",
      displayPath: "归档/第一章.md",
    });

    const discard = engine.dashboard("discard", "creative", false, "2026-08-20");
    expect(discard.currentTotal).toBe(100);
    expect(discard.daily.reduce((sum, day) => sum + day.manual, 0)).toBe(5);
    expect(discard.today.files[0].path).toBe("归档/第一章.md");
  });

  it("allows overlapping projects without duplicating the global total", () => {
    const index = new FileIndex(() => "file-a");
    index.upsert({ path: "正文/第一章.md", mtime: 1, creative: 100, bodyCharacters: 160, properties: {} });
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [activity({ path: "正文/第一章.md" })],
      projects: [
        { id: "folder", name: "正文", includeFolders: ["正文"] },
        { id: "markdown", name: "Markdown", extensions: ["md"] },
      ],
    });

    expect(engine.dashboard("folder", "creative", false, "2026-08-24").today.manual).toBe(10);
    expect(engine.dashboard("markdown", "creative", false, "2026-08-24").today.manual).toBe(10);
    expect(engine.dashboard("all", "creative", false, "2026-08-24").today.manual).toBe(10);
  });

  it("always offers an independent workspace scope, even before it is configured", () => {
    const engine = new WritingCalendarEngine({
      fileIndex: new FileIndex(() => "file-a"),
      events: [],
      projects: [],
    });

    expect(engine.listProjects()).toContainEqual(expect.objectContaining({
      id: "workspace",
      name: "统计工作区",
    }));
  });

  it("uses a saved workspace scope to combine folder and tag statistics", () => {
    let nextFileId = 0;
    const index = new FileIndex(() => `file-${++nextFileId}`);
    const novelFile = index.upsert({
      path: "正文/第一章.md",
      mtime: 1,
      creative: 100,
      bodyCharacters: 160,
      properties: { status: "draft" },
      tags: ["#小说"],
    });
    const essayFile = index.upsert({
      path: "正文/随笔.md",
      mtime: 2,
      creative: 50,
      bodyCharacters: 80,
      properties: { status: "draft" },
      tags: ["#随笔"],
    });
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [
        activity({ eventId: "novel", fileId: novelFile.fileId, path: "正文/第一章.md" }),
        activity({ eventId: "essay", fileId: essayFile.fileId, path: "正文/随笔.md" }),
      ],
      projects: [{
        id: "workspace",
        name: "统计工作区",
        advancedQuery: 'folder("正文") AND tag("#小说")',
      }],
    });

    const snapshot = engine.dashboard("workspace", "creative", false, "2026-08-24");
    expect(snapshot.currentTotal).toBe(100);
    expect(snapshot.today.manual).toBe(10);
  });

  it("uses the calendar's own indexed tag metadata for project statistics", () => {
    const index = new FileIndex(() => "file-a");
    index.upsert({
      path: "作品/第一章.md",
      mtime: 1,
      creative: 100,
      bodyCharacters: 160,
      properties: {},
      tags: ["#小说"],
    });
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [activity({ path: "作品/第一章.md" })],
      projects: [{ id: "novel", name: "小说", includeTags: ["小说"] }],
    });

    const snapshot = engine.dashboard("novel", "creative", false, "2026-08-24");
    expect(snapshot.currentTotal).toBe(100);
    expect(snapshot.today.manual).toBe(10);
  });

  it("uses the retained last path for deleted files and switches count modes", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          {
            fileId: "file-a",
            path: "正文/已删.md",
            aliases: [],
            mtime: 1,
            creative: 0,
            bodyCharacters: 0,
            properties: {},
            deleted: true,
            deletedAt: 2,
          },
        ],
      },
      () => "unused",
    );
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [activity({ path: "正文/已删.md" })],
      projects: [{ id: "novel", name: "小说", includeFolders: ["正文"] }],
    });

    expect(engine.dashboard("novel", "body-characters", false, "2026-08-24").today.manual).toBe(16);
  });

  it("removes deleted files from the current total without changing historical activity", () => {
    const index = new FileIndex(() => "file-a");
    const file = index.upsert({
      path: "正文/已删.md",
      mtime: 1,
      creative: 100,
      bodyCharacters: 160,
      properties: {},
    });
    index.remove(file.path, 2);
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [activity({ fileId: file.fileId, path: "正文/已删.md" })],
    });

    const snapshot = engine.dashboard("all", "creative", false, "2026-08-24");
    expect(snapshot.currentTotal).toBe(0);
    expect(snapshot.today.manual).toBe(10);
    expect(snapshot.today.files[0]).toMatchObject({ path: "正文/已删.md", net: 10 });
  });

  it("scopes the dashboard to ad-hoc workspace folders without a registered project", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          { fileId: "file-a", path: "正文/第一章.md", aliases: [], mtime: 1, creative: 100, bodyCharacters: 160, properties: {}, deleted: false },
          { fileId: "file-c", path: "外篇/随笔.md", aliases: [], mtime: 3, creative: 50, bodyCharacters: 80, properties: {}, deleted: false },
        ],
      },
      () => "unused",
    );
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [
        activity({ eventId: "e1", fileId: "file-a", path: "正文/第一章.md" }),
        activity({ eventId: "e2", fileId: "file-c", path: "外篇/随笔.md" }),
      ],
    });

    expect(engine.dashboard("all", "creative", false, "2026-08-24").today.manual).toBe(20);
    const scoped = engine.dashboardForDefinition({ includeFolders: ["正文"] }, "creative", false, "2026-08-24");
    expect(scoped.today.manual).toBe(10);
    expect(scoped.today.files.map((file) => file.path)).toEqual(["正文/第一章.md"]);
  });

  it("computes the goal snapshot scoped to the project", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          { fileId: "file-a", path: "正文/第一章.md", aliases: [], mtime: 1, creative: 100, bodyCharacters: 160, properties: {}, deleted: false },
          { fileId: "file-b", path: "正文/第二章.md", aliases: [], mtime: 2, creative: 200, bodyCharacters: 320, properties: {}, deleted: false },
          { fileId: "file-c", path: "外篇/随笔.md", aliases: [], mtime: 3, creative: 50, bodyCharacters: 80, properties: {}, deleted: false },
        ],
      },
      () => "unused",
    );
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [
        activity({ eventId: "e1", fileId: "file-a", path: "正文/第一章.md", localDate: "2026-08-24", counts: { typed: 30, paste: 0, otherInserted: 0, deleted: 0 } }),
        activity({ eventId: "e2", fileId: "file-b", path: "正文/第二章.md", localDate: "2026-08-25", counts: { typed: 40, paste: 0, otherInserted: 0, deleted: 10 } }),
        activity({ eventId: "e3", fileId: "file-c", path: "外篇/随笔.md", localDate: "2026-08-26", counts: { typed: 999, paste: 0, otherInserted: 0, deleted: 0 } }),
      ],
      projects: [{ id: "novel", name: "小说", includeFolders: ["正文"] }],
    });

    const goal = engine.goalSnapshot("novel", "increment", 100, "creative", false, "2026-08-26");
    expect(goal.enabled).toBe(true);
    expect(goal.metric).toBe("increment");
    expect(goal.target).toBe(100);
    expect(goal.current).toBe(70); // 正文/第一章 30 + 正文/第二章 40；外篇不计入
    expect(goal.activeDocuments).toBe(2);
    expect(goal.totalDocuments).toBe(2);
  });

  it("reports the goal as disabled when the target is zero", () => {
    const engine = new WritingCalendarEngine({
      fileIndex: new FileIndex(() => "file-a"),
      events: [],
      projects: [],
    });
    const goal = engine.goalSnapshot("all", "increment", 0, "creative", false, "2026-08-26");
    expect(goal.enabled).toBe(false);
    expect(goal.current).toBe(0);
    expect(goal.activeDocuments).toBe(0);
    expect(goal.totalDocuments).toBe(0);
  });

  it("accumulates net and deletion metrics per file", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          { fileId: "file-a", path: "正文/第一章.md", aliases: [], mtime: 1, creative: 100, bodyCharacters: 160, properties: {}, deleted: false },
          { fileId: "file-b", path: "正文/第二章.md", aliases: [], mtime: 2, creative: 200, bodyCharacters: 320, properties: {}, deleted: false },
        ],
      },
      () => "unused",
    );
    const engine = new WritingCalendarEngine({
      fileIndex: index,
      events: [
        activity({ eventId: "e1", fileId: "file-a", path: "正文/第一章.md", localDate: "2026-08-24", counts: { typed: 30, paste: 0, otherInserted: 0, deleted: 0 } }),
        activity({ eventId: "e2", fileId: "file-b", path: "正文/第二章.md", localDate: "2026-08-25", counts: { typed: 40, paste: 0, otherInserted: 0, deleted: 10 } }),
      ],
      projects: [{ id: "novel", name: "小说", includeFolders: ["正文"] }],
    });

    // net = increment − deletion；deletion 以正数幅值存储
    expect(engine.goalSnapshot("novel", "net", 0, "creative", false, "2026-08-26").current).toBe(60);
    expect(engine.goalSnapshot("novel", "deletion", 0, "creative", false, "2026-08-26").current).toBe(10);
  });
});
