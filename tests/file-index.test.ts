import { describe, expect, it } from "vitest";

import { FileIndex } from "../src/index/file-index";

describe("FileIndex", () => {
  it("preserves an internal id and path alias across renames", () => {
    let sequence = 0;
    const index = new FileIndex(() => `file-${++sequence}`);
    const created = index.upsert({
      path: "正文/第一章.md",
      mtime: 1,
      creative: 10,
      bodyCharacters: 20,
      properties: { status: "draft" },
    });

    index.rename("正文/第一章.md", "正文/序章.md");
    const renamed = index.getByPath("正文/序章.md");

    expect(renamed).toMatchObject({ fileId: created.fileId, path: "正文/序章.md" });
    expect(renamed?.aliases).toEqual(["正文/第一章.md"]);
    expect(index.getByPath("正文/第一章.md")).toBeUndefined();
  });

  it("keeps one file id and all aliases across repeated cross-folder moves", () => {
    let sequence = 0;
    const index = new FileIndex(() => `file-${++sequence}`);
    const created = index.upsert({
      path: "A.md",
      mtime: 1,
      creative: 10,
      bodyCharacters: 20,
      properties: {},
    });

    index.rename("A.md", "B.md", 200);
    index.rename("B.md", "草稿/B.md");
    index.rename("草稿/B.md", "正文/第一章.md");

    expect(index.getByPath("正文/第一章.md")).toMatchObject({
      fileId: created.fileId,
      path: "正文/第一章.md",
      aliases: ["A.md", "B.md", "草稿/B.md"],
    });
  });

  it("renames all indexed descendants of a folder when every new path is confirmed", () => {
    let sequence = 0;
    const index = new FileIndex(() => `file-${++sequence}`);
    const first = index.upsert({
      path: "示例作品/第一章.md",
      mtime: 1,
      creative: 10,
      bodyCharacters: 20,
      properties: {},
    });
    const second = index.upsert({
      path: "示例作品/章节/第二章.md",
      mtime: 2,
      creative: 30,
      bodyCharacters: 40,
      properties: {},
    });

    const result = index.renameFolder("示例作品", "示例正文", [
      "示例正文/第一章.md",
      "示例正文/章节/第二章.md",
    ]);

    expect(result.missingPaths).toEqual([]);
    expect(result.renamed.map((snapshot) => snapshot.fileId)).toEqual([first.fileId, second.fileId]);
    expect(index.getByPath("示例正文/第一章.md")).toMatchObject({
      fileId: first.fileId,
      aliases: ["示例作品/第一章.md"],
    });
    expect(index.getByPath("示例正文/章节/第二章.md")).toMatchObject({
      fileId: second.fileId,
      aliases: ["示例作品/章节/第二章.md"],
    });
  });

  it("does not partially rename a folder when a corresponding new path is missing", () => {
    let sequence = 0;
    const index = new FileIndex(() => `file-${++sequence}`);
    index.upsert({
      path: "示例作品/第一章.md",
      mtime: 1,
      creative: 10,
      bodyCharacters: 20,
      properties: {},
    });
    index.upsert({
      path: "示例作品/第二章.md",
      mtime: 2,
      creative: 30,
      bodyCharacters: 40,
      properties: {},
    });

    const result = index.renameFolder("示例作品", "示例正文", ["示例正文/第一章.md"]);

    expect(result.renamed).toEqual([]);
    expect(result.missingPaths).toEqual(["示例正文/第二章.md"]);
    expect(index.getByPath("示例作品/第一章.md")).toBeDefined();
    expect(index.getByPath("示例作品/第二章.md")).toBeDefined();
    expect(index.getByPath("示例正文/第一章.md")).toBeUndefined();
  });

  it("retains a tombstone but gives a recreated same-name file a new id", () => {
    let sequence = 0;
    const index = new FileIndex(() => `file-${++sequence}`);
    const original = index.upsert({
      path: "正文/第一章.md",
      mtime: 1,
      creative: 10,
      bodyCharacters: 20,
      properties: {},
    });
    index.remove("正文/第一章.md", 2);
    const recreated = index.upsert({
      path: "正文/第一章.md",
      mtime: 3,
      creative: 1,
      bodyCharacters: 2,
      properties: {},
    });

    expect(recreated.fileId).not.toBe(original.fileId);
    expect(index.getById(original.fileId)).toMatchObject({ deleted: true, deletedAt: 2 });
    expect(index.listCurrent()).toEqual([recreated]);
  });

  it("does not reuse an id when the same path has a different creation time", () => {
    let sequence = 0;
    const index = new FileIndex(() => `file-${++sequence}`);
    const originalInput = {
      path: "正文/第一章.md",
      ctime: 100,
      mtime: 110,
      creative: 10,
      bodyCharacters: 20,
      properties: {},
    };
    const original = index.upsert(originalInput);
    const recreated = index.upsert({
      ...originalInput,
      ctime: 200,
      mtime: 210,
      creative: 1,
      bodyCharacters: 2,
    });

    expect(recreated.fileId).not.toBe(original.fileId);
    expect(index.getById(original.fileId)).toMatchObject({ deleted: true });
    expect(index.getByPath("正文/第一章.md")).toMatchObject({
      fileId: recreated.fileId,
      ctime: 200,
    });
  });

  it("uses the old snapshot mtime to detect recreation for legacy indexes without ctime", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          {
            fileId: "file-old",
            path: "正文/第一章.md",
            aliases: [],
            mtime: 100,
            creative: 10,
            bodyCharacters: 20,
            properties: {},
            deleted: false,
          },
        ],
      },
      () => "file-new",
    );

    const recreated = index.upsert({
      path: "正文/第一章.md",
      ctime: 200,
      mtime: 210,
      creative: 1,
      bodyCharacters: 2,
      properties: {},
    });

    expect(recreated.fileId).toBe("file-new");
    expect(index.getById("file-old")).toMatchObject({ deleted: true });
  });

  it("keeps an explicitly renamed file id even when its creation metadata changes", () => {
    const index = new FileIndex(() => "file-a");
    const originalInput = {
      path: "A.md",
      ctime: 100,
      mtime: 110,
      creative: 10,
      bodyCharacters: 20,
      properties: {},
    };
    const original = index.upsert(originalInput);
    index.rename("A.md", "B.md", 200);
    const moved = index.upsert({ ...originalInput, path: "B.md", ctime: 200, mtime: 210 });

    expect(moved.fileId).toBe(original.fileId);
    expect(moved.path).toBe("B.md");
  });

  it("round-trips its local cache without storing document text", () => {
    const index = new FileIndex(() => "file-a");
    index.upsert({
      path: "正文/第一章.md",
      mtime: 1,
      creative: 10,
      bodyCharacters: 20,
      properties: { tags: ["writing"] },
    });

    const serialized = index.serialize();
    expect(JSON.stringify(serialized)).not.toContain("documentText");
    const restored = FileIndex.from(serialized, () => "file-b");
    expect(restored.getByPath("正文/第一章.md")).toMatchObject({
      fileId: "file-a",
      creative: 10,
      properties: { tags: ["writing"] },
    });
  });

  it("reports current, deleted, aliased, and inconsistent index state", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          {
            fileId: "file-a",
            path: "正文/第一章.md",
            aliases: ["草稿/第一章.md"],
            mtime: 1,
            creative: 10,
            bodyCharacters: 20,
            properties: {},
            deleted: false,
          },
          {
            fileId: "file-b",
            path: "正文/第二章.md",
            aliases: [],
            mtime: 2,
            creative: 30,
            bodyCharacters: 40,
            properties: {},
            deleted: true,
            deletedAt: 3,
          },
        ],
      },
      () => "unused",
    );

    expect(index.inspect()).toEqual({
      healthy: true,
      issues: [],
      currentFileCount: 1,
      deletedFileCount: 1,
      aliasedFileCount: 1,
    });

    const inconsistent = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          {
            fileId: "file-a",
            path: "正文/重复.md",
            aliases: [],
            mtime: 1,
            creative: 1,
            bodyCharacters: 1,
            properties: {},
            deleted: false,
          },
          {
            fileId: "file-b",
            path: "正文/重复.md",
            aliases: [],
            mtime: 2,
            creative: 2,
            bodyCharacters: 2,
            properties: {},
            deleted: false,
          },
        ],
      },
      () => "unused",
    );

    expect(inconsistent.inspect()).toMatchObject({ healthy: false });
    expect(inconsistent.inspect().issues.length).toBeGreaterThan(0);
  });

  it("reports malformed persisted entries instead of treating the index as healthy", () => {
    const index = FileIndex.from(
      {
        formatVersion: 1,
        snapshots: [
          null,
          {
            fileId: "file-a",
            path: "正文/第一章.md",
            aliases: [],
            mtime: 1,
            creative: 1,
            bodyCharacters: 1,
            properties: {},
            deleted: false,
          },
        ],
      },
      () => "unused",
    );

    expect(index.inspect()).toMatchObject({ healthy: false });
    expect(index.inspect().issues).toContain("存在无法读取的文件索引记录");
  });
});
