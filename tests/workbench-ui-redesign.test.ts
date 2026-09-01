import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const view = readFileSync(resolve("src/views/workbench-view.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("workbench visual redesign", () => {
  it("groups the title, version, metric selector and tabs into one header hierarchy", () => {
    expect(view).toContain("wc-demo-title-group");
    expect(view).toContain("wc-workbench-tab-icon");
    expect(styles).toContain(".wc-demo-header");
    expect(styles).toContain(".wc-demo-title-group");
  });

  it("renders a labelled monthly check-in overview with summary, legend and day numbers", () => {
    expect(view).toContain("wc-demo-goal-checkin-head");
    expect(view).toContain("wc-demo-goal-checkin-summary");
    expect(view).toContain("wc-demo-goal-checkin-legend");
    expect(view).toContain("wc-demo-goal-checkin-day-number");
    expect(styles).toContain(".wc-demo-goal-checkin-progress");
  });

  it("keeps the week chart but aligns its heading typography with the month heading", () => {
    expect(view).toContain("wc-demo-goal-hbars");
    expect(styles).toContain(".wc-demo-goal-week > .wc-demo-goal-kicker,\n.wc-demo-goal-checkin-title h3");
  });

  it("separates cumulative period goals from daily-goal history", () => {
    expect(view).toContain('text: "累计写作目标"');
    expect(view).toContain('text: "每日目标达成"');
    expect(view).toContain('this.renderGoalPeriodBar(periodGoals, "本周目标", week)');
    expect(view).toContain('this.renderGoalPeriodBar(periodGoals, "本月目标", month)');
    expect(view).toContain('text: "近一周回顾"');
    expect(view).toContain('text: "本月打卡"');
    expect(view).toContain('text: `达标 ${achievedDays} 天`');
    expect(styles).toContain(".wc-demo-goal-section-title");
  });

  it("moves the monthly check-in beside the goal summaries only in a wide container", () => {
    expect(view).toContain("wc-demo-goal-layout has-aside");
    expect(view).toContain("wc-demo-goal-main");
    expect(view).toContain("wc-demo-goal-aside");
    expect(view).toContain("this.renderMonthCheckin(goalAside, snapshot, metric, daily.target, today)");
    expect(styles).toContain("@container (min-width: 760px) {\n  .wc-demo-goal-layout.has-aside");
    expect(styles).toContain(".wc-demo-goal-layout.has-aside");
    expect(styles).toContain(".wc-demo-goal-aside .wc-demo-goal-checkin");
  });

});
