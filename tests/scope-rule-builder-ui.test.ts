import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const builder = readFileSync(resolve("src/views/scope-rule-builder.ts"), "utf8");
const modal = readFileSync(resolve("src/views/project-modal.ts"), "utf8");
const workbench = readFileSync(resolve("src/views/workbench-view.ts"), "utf8");
const settings = readFileSync(resolve("src/settings/tab.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("option-based scope rule builder UI", () => {
  it("shares accessible option cards between project settings and the workbench", () => {
    expect(builder).toContain("export class ScopeRuleBuilder");
    expect(builder).toContain('"文件夹"');
    expect(builder).toContain('"标签"');
    expect(builder).toContain('"Properties"');
    expect(builder).toContain('"上移条件"');
    expect(builder).toContain('"下移条件"');
    expect(builder).toContain('"删除条件"');
    expect(builder).toContain('"与上一条的关系"');
    expect(modal).toContain("new ScopeRuleBuilder");
    expect(workbench).toContain("new ScopeRuleBuilder");
    expect(styles).toContain(".wc-scope-rule-card");
  });

  it("keeps the workbench advanced filter collapsed and replaces the selected scope when applied", () => {
    expect(workbench).toContain('text: "高级筛选"');
    expect(workbench).toContain('text: "保留筛选"');
    expect(workbench).toContain("getDashboardForFilter");
    expect(workbench).toContain("LocalWorkbenchFilterStore");
    expect(workbench).toContain('text: "清除筛选"');
    expect(workbench).toContain('aria-expanded');
    expect(styles).toContain(".wc-workbench-filter");
  });

  it("changes the selected settings scope without redrawing the whole settings page", () => {
    const scopeSection = settings.match(/setName\("当前统计范围"\)[\s\S]*?setName\("编辑工作区范围"\)/u)?.[0] ?? "";
    expect(scopeSection).not.toContain("this.display()");
    expect(scopeSection).toContain("updateScopeLabels");
  });

  it("preserves the workbench scroll position around data refreshes", () => {
    expect(workbench).toContain("const scrollTop = container.scrollTop");
    expect(workbench).toContain("container.scrollTop = scrollTop");
  });
});
