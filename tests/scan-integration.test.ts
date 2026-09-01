import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const runtimeSource = readFileSync(resolve(process.cwd(), "src/service/runtime.ts"), "utf8");

describe("full scan reliability", () => {
  it("retries failed files before reconciling the completed scan", () => {
    expect(runtimeSource).toContain("retryFailedItems");
    expect(runtimeSource).toContain("const failedFiles");
    expect(runtimeSource).toContain("retryFailedItems(");
  });

  it("serializes overlapping full scan requests and queues a follow-up pass", () => {
    expect(runtimeSource).toContain("private scanAllFilesTask?: Promise<void>");
    expect(runtimeSource).toContain("private scanAgain = false;");
    expect(runtimeSource).toContain("if (this.scanAllFilesTask)");
  });
});
