import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/settings/tab.ts"), "utf8");

describe("focus timer settings UI", () => {
  it("shows optional focus controls and removes inferred-time controls", () => {
    expect(source).toContain('setName("专注计时").setHeading()');
    expect(source).toContain('setName("启用番茄钟")');
    expect(source).toContain('addOption("calendar", "日历下方")');
    expect(source).toContain('addOption("sidebar", "独立侧栏")');
    expect(source).toContain('durationSetting("默认专注时长"');
    expect(source).toContain('durationSetting("默认休息时长"');
    expect(source).toContain('setName("实际写作窗口")');
    expect(source).toContain("30_000");
    expect(source).toContain("120_000");
    expect(source).toContain("300_000");
    expect(source).not.toContain('setName("空闲判定")');
    expect(source).toContain('setName("记录不足 1 分钟的专注")');
    expect(source).toContain("focusRecordShortSessions");
    expect(source).not.toContain("timeStatsEnabled");
    expect(source).not.toContain("sessionBreakMs");
    expect(source).not.toContain("sidebarSummaryTime");
    expect(source).not.toContain("sidebarSummaryIdle");
  });

  it("updates only the focus settings region instead of rebuilding the whole page", () => {
    const focusSection = source.slice(
      source.indexOf('setName("专注计时").setHeading()'),
      source.indexOf('setName("同步数据").setHeading()'),
    );
    expect(focusSection).toContain("renderFocusOptions");
    expect(focusSection).not.toContain("this.display()");
  });
});
