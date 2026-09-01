import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const calendar = readFileSync(resolve("src/views/calendar-view.ts"), "utf8");
const workbench = readFileSync(resolve("src/views/workbench-view.ts"), "utf8");

describe("focus timer views", () => {
  it("renders the compact timer only in the configured calendar position", () => {
    expect(calendar).toContain("renderFocusTimer");
    expect(calendar).toContain('focusDisplayMode === "calendar"');
    expect(calendar).toContain("focusEnabled");
    expect(calendar).not.toContain("getTimeStats");
  });

  it("adds a dedicated focus statistics page without inferred-time modules", () => {
    expect(workbench).toContain('text: "写作统计"');
    expect(workbench).toContain('text: "专注统计"');
    expect(workbench).toContain("renderFocusStatistics");
    expect(workbench).not.toContain("getTimeStats");
    expect(workbench).not.toContain("getTimeSessions");
    expect(workbench).not.toContain("事件时间戳推算");
  });

  it("provides one independent focus view backed by the shared controller", () => {
    const path = resolve("src/views/focus-view.ts");
    expect(existsSync(path)).toBe(true);
    const source = existsSync(path) ? readFileSync(path, "utf8") : "";
    expect(source).toContain("WRITING_CALENDAR_FOCUS_VIEW_TYPE");
    expect(source).toContain("host.focusController.subscribe");
  });

  it("restores an enabled independent focus sidebar when the workspace layout is ready", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");
    const layoutReady = main.slice(main.indexOf("onLayoutReady"), main.indexOf("onunload"));
    expect(layoutReady).toContain('focusDisplayMode === "sidebar"');
    expect(layoutReady).toContain("WRITING_CALENDAR_FOCUS_VIEW_TYPE");
    expect(layoutReady).toContain("openFocusView()");
  });

  it("stacks metrics vertically while each item reads label then value horizontally", () => {
    const component = readFileSync(resolve("src/views/focus-components.ts"), "utf8");
    const renderMetric = component.slice(component.indexOf("function renderMetric"), component.indexOf("function renderSessionMetrics"));
    expect(renderMetric.indexOf('cls: "wc-focus-metric-label"')).toBeLessThan(
      renderMetric.indexOf('cls: "wc-focus-metric-value"'),
    );
    const styles = readFileSync(resolve("styles.css"), "utf8");
    expect(styles).toMatch(/\.wc-focus-metrics\s*\{[^}]*flex-direction:\s*column/s);
    expect(styles).toMatch(/\.wc-focus-metric\s*\{[^}]*justify-content:\s*space-between/s);
  });

  it("reloads synced focus records without restoring a remote running session", () => {
    const main = readFileSync(resolve("src/main.ts"), "utf8");
    expect(main).toContain("LocalDeviceIdentity");
    expect(main).toContain("LocalFocusCheckpointStore");
    expect(main).toContain("mergeFocusSessions");
    expect(main).toContain("scheduleFocusReload");
    expect(main).toContain("focusDataPath");
    expect(main).not.toContain("persisted.focusState");
    expect(main).not.toContain("focusState: this.focusState");
  });

  it("refreshes the workbench when focus records arrive from another device", () => {
    expect(workbench).toContain("subscribeFocusRecords");
  });

  it("uses explicit idle/away labels and explains the activity estimate", () => {
    const component = readFileSync(resolve("src/views/focus-components.ts"), "utf8");
    expect(component).toContain('"空闲时间"');
    expect(component).toContain('"离开时间"');
    expect(component).toContain("根据文字编辑活动估算");
    expect(component).toContain("专注期间停留在 Obsidian，但较长时间没有编辑");
    expect(component).toContain("切出 Obsidian 或窗口不可见");
    expect(workbench).toContain("空闲时间");
    expect(workbench).toContain("离开时间");
  });
});
