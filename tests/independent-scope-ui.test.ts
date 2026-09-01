import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync(resolve(process.cwd(), "src/settings/tab.ts"), "utf8");
const editorSource = readFileSync(resolve(process.cwd(), "src/views/project-modal.ts"), "utf8");

describe("independent scope settings UI", () => {
  it("keeps writing-calendar scope controls separate from layout rules", () => {
    expect(settingsSource).toContain("范围由上方“统计工作区”和下方“写作项目”独立维护");
    expect(settingsSource).toContain("不会读取或跟随 Chinese Writing Layout 的自动套用规则");
    expect(settingsSource).not.toContain("自动套用规则来源");
    expect(settingsSource).not.toContain("打开排版插件设置");
    expect(settingsSource).not.toContain("getWorkspaceRuleState");
  });

  it("restores a calendar-owned workspace editor and exposes advanced filters", () => {
    expect(settingsSource).toContain('text: "统计工作区"');
    expect(settingsSource).toContain('setName("编辑工作区范围")');
    expect(settingsSource).toContain('setName("当前统计范围")');
    expect(settingsSource).toContain("WORKSPACE_SCOPE_ID");
    expect(editorSource).toContain('setName("高级筛选（可选）")');
    expect(editorSource).toContain("无需安装 Dataview");
  });
});
