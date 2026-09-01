import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/service/runtime.ts"), "utf8");
const mainSource = readFileSync(resolve("src/main.ts"), "utf8");

describe("focus activity integration", () => {
  it("emits successfully persisted activity events without inferred time sessions", () => {
    expect(source).toContain("private readonly activityListeners");
    expect(source).toContain("subscribeActivity(listener:");
    expect(source).toContain("for (const listener of this.activityListeners) listener(event)");
    expect(source.indexOf("this.engine.addEvent(event)")).toBeLessThan(
      source.indexOf("for (const listener of this.activityListeners) listener(event)"),
    );
    expect(source).not.toContain("getTimeSessions()");
    expect(source).not.toContain("getTimeStats(");
    expect(source).not.toContain("timeSessionsCache");
  });

  it("maps a folder rename only after confirming every indexed descendant", () => {
    expect(source).toContain("async handleFolderRename(");
    expect(source).toContain("this.fileIndex.renameFolder(");
    expect(source).toContain("result.missingPaths");
    expect(source).toContain("await this.scanAllFiles()");
    expect(source).toContain("addDiagnostic(\"warning\"");
    expect(source).toContain("ctime: file.stat.ctime");
  });

  it("rescans folder create/delete and delegates folder rename events", () => {
    expect(mainSource).toContain("TFolder");
    expect(mainSource).toContain("this.runtime.handleFolderRename(");
    expect(mainSource).toContain("this.runtime.scanAllFiles()");
  });
});
