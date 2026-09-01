import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const diagnosticViewPath = resolve("src/views/data-diagnostics-view.ts");
const diagnosticView = existsSync(diagnosticViewPath) ? readFileSync(diagnosticViewPath, "utf8") : "";
const mainSource = readFileSync(resolve("src/main.ts"), "utf8");
const hostSource = readFileSync(resolve("src/views/host.ts"), "utf8");
const workbenchSource = readFileSync(resolve("src/views/workbench-view.ts"), "utf8");
const settingsSource = readFileSync(resolve("src/settings/tab.ts"), "utf8");
const runtimeSource = readFileSync(resolve("src/service/runtime.ts"), "utf8");
const styles = readFileSync(resolve("styles.css"), "utf8");

describe("data diagnostics UI integration", () => {
  it("registers a dedicated diagnostics item view and shared navigation method", () => {
    expect(diagnosticView).toContain("class DataDiagnosticsView");
    expect(diagnosticView).toContain("数据诊断");
    expect(diagnosticView).toContain("重新检查");
    expect(mainSource).toContain("WRITING_CALENDAR_DIAGNOSTICS_VIEW_TYPE");
    expect(mainSource).toContain("openDiagnostics");
    expect(hostSource).toContain("openDiagnostics");
  });

  it("offers the same diagnostics destination from settings and the workbench", () => {
    expect(settingsSource).toContain("打开数据诊断");
    expect(settingsSource).toContain("this.host.openDiagnostics()");
    expect(workbenchSource).toContain("数据诊断");
    expect(workbenchSource).toContain("this.host.openDiagnostics()");
  });

  it("refreshes through Runtime and keeps the check action visibly asynchronous", () => {
    expect(runtimeSource).toContain("getDataDiagnostics()");
    expect(runtimeSource).toContain("refreshDataDiagnostics()");
    expect(diagnosticView).toContain("refresh.disabled");
    expect(diagnosticView).toContain("检查中");
  });

  it("provides themed status rows and a compact layout for the diagnostics view", () => {
    expect(styles).toContain(".wc-diagnostics-view");
    expect(styles).toContain(".wc-diagnostics-row.is-warning");
    expect(styles).toContain(".wc-diagnostics-row.is-error");
    expect(styles).toContain(".wc-diagnostics-refresh:disabled");
    expect(styles).toContain("@container (max-width: 620px)");
  });

  it("styles the workbench diagnostics action beside the metric selector", () => {
    expect(styles).toContain(".wc-demo-header-actions");
    expect(styles).toContain(".wc-demo-diagnostics-action");
  });
});
