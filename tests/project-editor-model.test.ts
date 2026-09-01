import { describe, expect, it } from "vitest";

import { parseProjectEditor, type ProjectEditorInput } from "../src/projects/editor-model";
import type { ScopeConditionGroup } from "../src/projects/types";
import { compileScopeConditionTree } from "../src/projects/scope-conditions";

describe("project editor model", () => {
  it("keeps folders and tags as independent project scope rules", () => {
    const result = parseProjectEditor({
      id: "novel",
      name: "小说",
      includeFolders: "正文\n草稿",
      excludeFolders: "正文/归档",
      includeTags: "小说, #连载",
      excludeTags: "#归档",
      extensions: "md",
      filenameGlobs: "",
      propertiesJson: "",
      advancedQuery: 'folder("正文") AND tag("#小说") AND property("status") != "archived"',
    });

    expect(result).toEqual({
      ok: true,
      definition: expect.objectContaining({
        id: "novel",
        name: "小说",
        includeFolders: ["正文", "草稿"],
        excludeFolders: ["正文/归档"],
        includeTags: ["#小说", "#连载"],
        excludeTags: ["#归档"],
        advancedQuery: 'folder("正文") AND tag("#小说") AND property("status") != "archived"',
      }),
    });
    if (result.ok) {
      expect(result.definition.conditionTree).toBeDefined();
      expect(compileScopeConditionTree(result.definition.conditionTree!)).toContain('folder("正文") OR folder("草稿")');
      expect(compileScopeConditionTree(result.definition.conditionTree!)).toContain('tag("#小说") OR tag("#连载")');
      expect(compileScopeConditionTree(result.definition.conditionTree!)).toContain("NOT");
    }
  });

  it("rejects a malformed advanced query before it can be saved", () => {
    const result = parseProjectEditor({
      id: "novel",
      name: "小说",
      includeFolders: "",
      excludeFolders: "",
      includeTags: "",
      excludeTags: "",
      extensions: "md",
      filenameGlobs: "",
      propertiesJson: "",
      advancedQuery: 'folder("正文" AND tag("#小说")',
    });

    expect(result).toEqual({
      ok: false,
      errors: expect.objectContaining({ advancedQuery: expect.stringContaining("高级筛选") }),
    });
  });

  it("saves option-based conditions as the canonical synchronized rule tree", () => {
    const conditionTree: ScopeConditionGroup = {
      id: "root",
      kind: "group",
      children: [
        { id: "folder", kind: "folder", join: "and", value: "正文" },
        { id: "tag", kind: "tag", join: "and", value: "#小说" },
      ],
    };
    const result = parseProjectEditor({
      id: "novel",
      name: "小说",
      includeFolders: "",
      excludeFolders: "",
      includeTags: "",
      excludeTags: "",
      extensions: "",
      filenameGlobs: "",
      propertiesJson: "",
      advancedQuery: "",
      conditionTree,
    } as ProjectEditorInput & { conditionTree: ScopeConditionGroup });

    expect(result).toEqual({
      ok: true,
      definition: expect.objectContaining({
        conditionTree,
        includeFolders: [],
        includeTags: [],
      }),
    });
  });
});
