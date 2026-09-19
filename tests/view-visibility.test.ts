import { describe, expect, it } from "vitest";
import type { App, WorkspaceLeaf } from "obsidian";
import { isStatisticsViewVisible } from "../src/views/visibility";

describe("mobile statistics visibility", () => {
  it("skips offscreen collapsed drawers even when their DOM reports shown", () => {
    const leftSplit = { collapsed: true };
    const rightSplit = { collapsed: true };
    const app = { workspace: { leftSplit, rightSplit } } as unknown as App;
    const element = { ownerDocument: { hidden: false }, isShown: () => true } as unknown as HTMLElement;
    for (const root of [leftSplit, rightSplit]) {
      const leaf = { getRoot: () => root } as unknown as WorkspaceLeaf;
      expect(isStatisticsViewVisible(element, leaf, app)).toBe(false);
      root.collapsed = false;
      expect(isStatisticsViewVisible(element, leaf, app)).toBe(true);
    }
  });

  it("skips hidden tabs and background documents but permits a visible main pane", () => {
    const app = { workspace: { leftSplit: {}, rightSplit: {} } } as unknown as App;
    const leaf = { getRoot: () => ({}) } as unknown as WorkspaceLeaf;
    const element = { ownerDocument: { hidden: false }, isShown: () => true };
    expect(isStatisticsViewVisible(element as unknown as HTMLElement, leaf, app)).toBe(true);
    element.ownerDocument.hidden = true;
    expect(isStatisticsViewVisible(element as unknown as HTMLElement, leaf, app)).toBe(false);
    element.ownerDocument.hidden = false;
    element.isShown = () => false;
    expect(isStatisticsViewVisible(element as unknown as HTMLElement, leaf, app)).toBe(false);
  });
});
