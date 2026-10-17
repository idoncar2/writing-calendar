import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { StartupProfiler } from "../src/diagnostics/startup-profiler";

describe("in-memory startup instrumentation", () => {
  it("records independent phase timings and milestone offsets", () => {
    let now = 100;
    const profiler = new StartupProfiler(() => now);
    now = 105;
    profiler.mark("输入监听安装完成");
    const finish = profiler.begin("文件索引解压");
    now = 137;
    finish();
    finish(); // end callbacks must be idempotent
    now = 145;
    profiler.mark("输入监听安装完成");
    profiler.count("扫描候选文件数", 1200);
    expect(profiler.snapshot()).toEqual({
      spans: [{ name: "文件索引解压", startedMs: 5, durationMs: 32 }],
      milestones: [{ name: "输入监听安装完成", atMs: 5 }],
      counters: [{ name: "扫描候选文件数", value: 1200 }],
    });
    expect(profiler.formatReport("0.4.0")).toContain("文件索引解压：32.0 ms");
  });

  it("stops per-keystroke timing after three samples of the same stage", () => {
    let now = 0;
    const profiler = new StartupProfiler(() => now);
    for (let i = 0; i < 25; i++) {
      const end = profiler.begin("写作事件追加到账本");
      now += 10;
      end();
    }
    expect(profiler.snapshot().spans).toHaveLength(3);
    expect(profiler.snapshot().spans.map((span) => span.durationMs)).toEqual([10, 10, 10]);
  });

  it("stores measurements only in memory and never includes notes or file paths", () => {
    const profiler = new StartupProfiler(() => 0);
    profiler.mark("插件 onload 完成");
    profiler.count("历史写作事件数", 12345);
    const report = profiler.formatReport("0.4.0");
    expect(report).toContain("历史写作事件数：12345");
    expect(report).toContain("不包含笔记内容或路径");
    expect(JSON.stringify(profiler.snapshot())).not.toContain("data.json.backup");
    profiler.count("文件数", -1);
    expect(profiler.snapshot().counters).toHaveLength(1);
  });

  it("preserves baseline recording and startup order exactly", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");
    const runtime = readFileSync(resolve("src/service/runtime.ts"), "utf8");
    const initAt = main.indexOf("await this.runtime.initialize()");
    const focusAt = main.indexOf("await this.focusStorage.loadSessions()");
    const installAt = main.indexOf("this.registerEditorExtension(");
    expect(initAt).toBeGreaterThan(installAt);
    expect(focusAt).toBeGreaterThan(initAt);
    const ledgerAt = runtime.indexOf("await this.reloadSyncedData(false)");
    const scanAt = runtime.indexOf("await this.scanAllFiles()");
    expect(scanAt).toBeGreaterThan(ledgerAt);
    expect(runtime).toContain("await this.storage.appendEvent(event)");
    expect(runtime).not.toContain("pendingActivities");
  });
});
