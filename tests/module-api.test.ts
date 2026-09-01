import { describe, expect, it, vi } from "vitest";

import {
  registerWritingModule,
  WRITING_CALENDAR_MODULE_META,
  type WritingToolsGlobal,
} from "../src/integration/module-api";

describe("writing calendar module API", () => {
  it("publishes its own project scope interface for a future workbench", () => {
    const host = new EventTarget() as EventTarget & WritingToolsGlobal;
    const getDefinitions = vi.fn(() => [{ id: "novel", name: "小说", includeTags: ["#小说"] }]);
    const saveDefinition = vi.fn(async () => undefined);

    const unregister = registerWritingModule(host, {
      meta: WRITING_CALENDAR_MODULE_META,
      scopes: {
        protocolVersion: 1,
        getDefinitions,
        saveDefinition,
      },
    });

    expect(WRITING_CALENDAR_MODULE_META.capabilities).toEqual(
      expect.arrayContaining(["scope-rules.read", "scope-rules.write"]),
    );
    expect(host.__writingToolsModules?.["writing-calendar"]?.scopes?.getDefinitions()).toEqual([
      { id: "novel", name: "小说", includeTags: ["#小说"] },
    ]);
    expect(getDefinitions).toHaveBeenCalledTimes(1);
    unregister();
  });
});
