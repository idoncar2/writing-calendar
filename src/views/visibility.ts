import type { App, WorkspaceLeaf } from "obsidian";

export function isStatisticsViewVisible(element: HTMLElement, leaf: WorkspaceLeaf, app: App): boolean {
  if (element.ownerDocument.hidden || !element.isShown()) return false;
  const root = leaf.getRoot();
  return !((root === app.workspace.leftSplit && app.workspace.leftSplit.collapsed)
    || (root === app.workspace.rightSplit && app.workspace.rightSplit.collapsed));
}
