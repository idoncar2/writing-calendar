import { describe, expect, it, vi } from "vitest";

import {
  registerWritingModule,
  WRITING_CALENDAR_MODULE_META,
  type WritingToolsGlobal,
} from "../src/integration/module-api";

describe("writing tools module protocol", () => {
  it("publishes versioned project and scope capabilities for a future workbench", () => {
    expect(WRITING_CALENDAR_MODULE_META).toEqual({
      moduleId: "writing-calendar",
      moduleVersion: "0.1.0",
      protocolVersion: 1,
      capabilities: [
        "projects.read",
        "statistics.read",
        "statistics.subscribe",
        "views.open",
        "projects.edit",
        "scope-rules.read",
        "scope-rules.write",
      ],
    });
  });

  it("registers and cleanly removes only its own module instance", () => {
    const host: WritingToolsGlobal = {};
    const api = { meta: WRITING_CALENDAR_MODULE_META };
    const cleanup = registerWritingModule(host, api);

    expect(host.__writingToolsModules?.["writing-calendar"]).toBe(api);
    cleanup();
    expect(host.__writingToolsModules?.["writing-calendar"]).toBeUndefined();
  });

  it("announces replacement-safe module registration changes", () => {
    const host = new EventTarget() as EventTarget & WritingToolsGlobal;
    const listener = vi.fn();
    host.addEventListener("writing-tools:modules-changed", listener);
    const first = { meta: WRITING_CALENDAR_MODULE_META };
    const second = { meta: WRITING_CALENDAR_MODULE_META };

    const cleanupFirst = registerWritingModule(host, first);
    const cleanupSecond = registerWritingModule(host, second);
    cleanupFirst();

    expect(host.__writingToolsModules?.["writing-calendar"]).toBe(second);
    expect(listener).toHaveBeenCalledTimes(2);

    cleanupSecond();
    expect(host.__writingToolsModules?.["writing-calendar"]).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
