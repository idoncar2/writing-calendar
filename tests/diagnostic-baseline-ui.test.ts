import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync(resolve("src/views/data-diagnostics-view.ts"), "utf8");
const runtimeSource = readFileSync(resolve("src/service/runtime.ts"), "utf8");
const mainSource = readFileSync(resolve("src/main.ts"), "utf8");

describe("diagnostic baseline UI integration", () => {
  it("offers explicit baseline and report actions", () => {
    expect(viewSource).toContain("设为当前基线");
    expect(viewSource).toContain("复制诊断报告");
    expect(viewSource).toContain("formatDiagnosticReport");
  });

  it("keeps the baseline local and exposes an explicit save operation", () => {
    expect(runtimeSource).toContain("LocalDiagnosticBaselineStore");
    expect(runtimeSource).toContain("setDiagnosticBaseline");
    expect(mainSource).not.toContain("diagnosticBaseline:");
  });
});
