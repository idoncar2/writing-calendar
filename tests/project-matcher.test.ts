import { describe, expect, it } from "vitest";

import {
  evaluateProject,
  explainProjectMatch,
  matchesProject,
  type ProjectDefinition,
} from "../src/projects/matcher";

const project: ProjectDefinition = {
  id: "novel",
  name: "Novel",
  includeFolders: ["稿件\\正文", "短篇"],
  excludeFolders: ["稿件/正文/归档"],
  extensions: [".MD"],
  filenameGlobs: ["章节-??.md", "**/特别篇-*.md"],
  properties: [
    { key: "status", operator: "equals", value: "draft" },
    { key: "tags", operator: "contains", value: "writing" },
  ],
};

describe("project matcher", () => {
  it("combines active categories with AND and rules within a category with OR", () => {
    const result = evaluateProject(
      {
        path: "稿件\\正文\\章节-01.md",
        properties: { status: "draft", tags: ["writing", "novel"] },
      },
      project,
    );

    expect(result.matched).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(matchesProject({ path: "短篇/特别篇-序章.md", properties: { status: "draft", tags: "writing" } }, project)).toBe(
      true,
    );
  });

  it("gives exclusion rules priority and respects folder path boundaries", () => {
    expect(
      evaluateProject(
        { path: "稿件/正文/归档/章节-01.md", properties: { status: "draft", tags: ["writing"] } },
        project,
      ),
    ).toMatchObject({ matched: false, reasons: [{ code: "exclude-folder" }] });

    const boundary = evaluateProject(
      { path: "稿件/正文-旧/章节-01.md", properties: { status: "draft", tags: ["writing"] } },
      project,
    );
    expect(boundary.matched).toBe(false);
    expect(boundary.reasons.some((reason) => reason.code === "include-folder")).toBe(true);
  });

  it("treats empty categories as no filter and extensions case-insensitively", () => {
    const result = evaluateProject(
      {
        path: "任何地方/README.Md",
        properties: { status: "draft", tags: ["writing"] },
      },
      { extensions: [], includeFolders: [], excludeFolders: [], filenameGlobs: [], properties: [] },
    );

    expect(result.matched).toBe(true);
    expect(
      evaluateProject({ path: "稿件/正文/章节-01.mD" }, { extensions: [".MD"] }).matched,
    ).toBe(true);
  });

  it("supports * ? and ** filename globs against the filename or normalized path", () => {
    expect(
      evaluateProject(
        { path: "短篇/特别篇-春.md", properties: { status: "draft", tags: ["writing"] } },
        project,
      ).matched,
    ).toBe(true);
    expect(
      evaluateProject(
        { path: "短篇/特别篇-春.txt", properties: { status: "draft", tags: ["writing"] } },
        project,
      ).matched,
    ).toBe(false);
  });

  it("evaluates property predicates for scalars, arrays, null and missing values", () => {
    const rules: ProjectDefinition = {
      properties: [
        { key: "published", operator: "exists" },
        { key: "archived", operator: "missing" },
        { key: "title", operator: "contains", value: "draft" },
        { key: "tags", operator: "contains", value: "writing" },
        { key: "kind", operator: "not-equals", value: "outline" },
      ],
    };

    expect(
      evaluateProject(
        {
          path: "notes/one.md",
          properties: {
            published: null,
            title: "draft chapter",
            tags: ["writing", "novel"],
            kind: "chapter",
          },
        },
        rules,
      ).matched,
    ).toBe(true);

    const failed = explainProjectMatch(
      { path: "notes/two.md", properties: { published: true, title: "final", tags: ["novel"], kind: "outline" } },
      rules,
    );
    expect(failed.matched).toBe(false);
    expect(failed.reasons.filter((reason) => reason.code === "property")).toHaveLength(3);
  });

  it("matches independently configured Obsidian tags and lets exclusions win", () => {
    const tagScoped: ProjectDefinition = {
      includeTags: ["#小说", "写作"],
      excludeTags: ["#归档"],
    };

    expect(
      evaluateProject({ path: "笔记/随笔.md", tags: ["#随笔"] }, tagScoped),
    ).toMatchObject({
      matched: false,
      reasons: [{ code: "include-tag", category: "include-tags" }],
    });

    expect(
      evaluateProject({ path: "小说/第一章.md", tags: ["小说"] }, tagScoped).matched,
    ).toBe(true);
    expect(
      evaluateProject({ path: "小说/归档.md", tags: ["#小说", "归档"] }, tagScoped),
    ).toMatchObject({
      matched: false,
      reasons: [{ code: "exclude-tag", category: "exclude-tags" }],
    });
  });

  it("evaluates a saved advanced query across folders, tags and Properties", () => {
    const complexScope: ProjectDefinition = {
      advancedQuery: '(folder("正文") OR folder("短篇")) AND tag("#小说") AND property("status") != "archived"',
    };

    expect(matchesProject({
      path: "正文/第一章.md",
      tags: ["小说"],
      properties: { status: "draft" },
    }, complexScope)).toBe(true);
    expect(matchesProject({
      path: "正文/随笔.md",
      tags: ["随笔"],
      properties: { status: "draft" },
    }, complexScope)).toBe(false);
    expect(matchesProject({
      path: "短篇/归档.md",
      tags: ["#小说"],
      properties: { status: "archived" },
    }, complexScope)).toBe(false);
  });

  it("evaluates visual scope conditions with ordered AND / OR joins", () => {
    const visualScope = {
      conditionTree: {
        id: "root",
        kind: "group",
        children: [
          {
            id: "folder-choice",
            kind: "group",
            join: "and",
            children: [
              { id: "folder-main", kind: "folder", join: "and", value: "正文" },
              { id: "folder-short", kind: "folder", join: "or", value: "短篇" },
            ],
          },
          { id: "novel-tag", kind: "tag", join: "and", value: "#小说" },
          {
            id: "not-archived",
            kind: "property",
            join: "and",
            key: "status",
            operator: "not-equals",
            value: "archived",
          },
        ],
      },
    } as unknown as ProjectDefinition;

    expect(matchesProject({
      path: "短篇/春天.md",
      tags: ["小说"],
      properties: { status: "draft" },
    }, visualScope)).toBe(true);
    expect(matchesProject({
      path: "素材/春天.md",
      tags: ["小说"],
      properties: { status: "draft" },
    }, visualScope)).toBe(false);
    expect(matchesProject({
      path: "正文/旧稿.md",
      tags: ["小说"],
      properties: { status: "archived" },
    }, visualScope)).toBe(false);
  });

  it("supports visual NOT groups without depending on another plugin", () => {
    const visualScope = {
      conditionTree: {
        id: "root",
        kind: "group",
        children: [
          { id: "drafts", kind: "folder", join: "and", value: "草稿" },
          {
            id: "excluded-tags",
            kind: "group",
            join: "and",
            negate: true,
            children: [
              { id: "archived", kind: "tag", join: "and", value: "#归档" },
              { id: "discarded", kind: "tag", join: "or", value: "#废弃" },
            ],
          },
        ],
      },
    } as unknown as ProjectDefinition;

    expect(matchesProject({ path: "草稿/第一章.md", tags: ["小说"] }, visualScope)).toBe(true);
    expect(matchesProject({ path: "草稿/旧章.md", tags: ["归档"] }, visualScope)).toBe(false);
    expect(matchesProject({ path: "草稿/弃稿.md", tags: ["#废弃"] }, visualScope)).toBe(false);
  });

  it("supports visible Properties operators that do not need a value", () => {
    const visualScope = {
      conditionTree: {
        id: "root",
        kind: "group",
        children: [
          { id: "published", kind: "property", join: "and", key: "published", operator: "exists" },
          { id: "not-archived", kind: "property", join: "and", key: "archived", operator: "missing" },
        ],
      },
    } as unknown as ProjectDefinition;

    expect(matchesProject({ path: "正文/新章.md", properties: { published: null } }, visualScope)).toBe(true);
    expect(matchesProject({ path: "正文/草稿.md", properties: {} }, visualScope)).toBe(false);
    expect(matchesProject({ path: "正文/旧章.md", properties: { published: true, archived: true } }, visualScope)).toBe(false);
  });

  it("preserves legacy Properties array values in visual conditions", () => {
    const visualScope = {
      conditionTree: {
        id: "root",
        kind: "group",
        children: [
          {
            id: "tags",
            kind: "property",
            join: "and",
            key: "tags",
            operator: "contains",
            value: ["writing", "novel"],
          },
        ],
      },
    } as unknown as ProjectDefinition;

    expect(matchesProject({ path: "正文/第一章.md", properties: { tags: ["novel", "writing"] } }, visualScope)).toBe(true);
    expect(matchesProject({ path: "正文/第二章.md", properties: { tags: ["writing"] } }, visualScope)).toBe(false);
  });

  it("fails closed with an explanation when an advanced query is malformed", () => {
    const result = explainProjectMatch(
      { path: "正文/第一章.md", tags: ["#小说"], properties: { status: "draft" } },
      { advancedQuery: 'folder("正文" AND tag("#小说")' },
    );

    expect(result).toMatchObject({
      matched: false,
      reasons: [{ code: "advanced-query", category: "advanced-query" }],
    });
  });
});
