import { describe, expect, it } from "vitest";

import { missingVaultPaths } from "../src/index/reconcile";

describe("file index reconciliation", () => {
  it("removes only files absent from the vault candidate set, not files whose read failed", () => {
    expect(
      missingVaultPaths(
        ["正文/正常.md", "正文/读取失败.md", "正文/已删除.md"],
        ["正文/正常.md", "正文/读取失败.md"],
      ),
    ).toEqual(["正文/已删除.md"]);
  });

  it("does not infer a rename from an absent old path and a present new path", () => {
    expect(missingVaultPaths(["示例作品/第一章.md"], ["归档/第一章.md"])).toEqual(["示例作品/第一章.md"]);
  });
});
