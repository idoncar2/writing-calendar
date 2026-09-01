import { describe, expect, it } from "vitest";

import {
  createProjectVersion,
  resolveProjectVersions,
  type ProjectVersionRecord,
} from "../src/projects/versions";

const record = (overrides: Partial<ProjectVersionRecord> = {}): ProjectVersionRecord => ({
  formatVersion: 1,
  projectId: "novel",
  revisionId: "r1",
  parentRevisionIds: [],
  deviceId: "pc-a",
  timestamp: "2026-08-24T01:00:00.000Z",
  deleted: false,
  definition: { id: "novel", name: "小说", includeFolders: ["正文"], extensions: ["md"] },
  ...overrides,
});

describe("project version history", () => {
  it("selects a single head and ignores superseded revisions", () => {
    const first = record();
    const second = record({
      revisionId: "r2",
      parentRevisionIds: ["r1"],
      timestamp: "2026-08-24T02:00:00.000Z",
      definition: { id: "novel", name: "新名字" },
    });

    const resolution = resolveProjectVersions([second, first]);
    expect(resolution.projects).toEqual([second]);
    expect(resolution.conflicts).toEqual([]);
  });

  it("preserves concurrent heads as an explicit conflict", () => {
    const left = record({ revisionId: "left", parentRevisionIds: ["r1"], deviceId: "pc-a" });
    const right = record({ revisionId: "right", parentRevisionIds: ["r1"], deviceId: "pc-b" });

    const resolution = resolveProjectVersions([record(), left, right]);
    expect(resolution.projects).toHaveLength(0);
    expect(resolution.conflicts).toEqual([
      expect.objectContaining({ projectId: "novel", heads: [left, right] }),
    ]);
  });

  it("creates immutable records whose parents are all currently selected heads", () => {
    const next = createProjectVersion({
      definition: { id: "novel", name: "合并后" },
      deviceId: "pc-a",
      timestamp: "2026-08-24T03:00:00.000Z",
      revisionId: "merged",
      parents: [record({ revisionId: "left" }), record({ revisionId: "right" })],
    });

    expect(next).toMatchObject({
      revisionId: "merged",
      parentRevisionIds: ["left", "right"],
      projectId: "novel",
      deleted: false,
    });
  });
});
