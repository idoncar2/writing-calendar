import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(resolve("src/main.ts"), "utf8");
const runtime = readFileSync(resolve("src/service/runtime.ts"), "utf8");
const calendar = readFileSync(resolve("src/views/calendar-view.ts"), "utf8");

describe("early editor capture and truthful startup status", () => {
  it("installs tracking before the potentially large persisted index is read", () => {
    const onload = main.slice(main.indexOf("async onload()"));
    const trackerAt = onload.indexOf("this.registerEditorExtension(");
    const dataAt = onload.indexOf("await this.loadData()");
    expect(trackerAt).toBeGreaterThanOrEqual(0);
    expect(dataAt).toBeGreaterThan(trackerAt);
    expect(onload).toContain("this.earlyEditorActivities.push");
    expect(onload).toContain("this.runtime.recordActivity(file, activity, at)");
  });

  it("labels history hydration as loading rather than falsely paused", () => {
    expect(runtime).toContain("initializing: true");
    expect(runtime).toContain("this.state.initializing = false");
    expect(calendar).toContain("if (state.initializing)");
    expect(calendar).toContain("正在加载历史统计");
    expect(calendar).toContain("else if (state.paused)");
  });
});
