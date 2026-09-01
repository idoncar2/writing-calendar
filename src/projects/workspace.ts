import type { ProjectDefinition } from "./types";

export { LocalWorkbenchFilterStore, workbenchFilterStorageKey } from "./temporary-scope";

/**
 * The calendar's own default statistics scope. It deliberately has a stable
 * identity so its version records can be synced like every other project.
 */
export const WORKSPACE_SCOPE_ID = "workspace";
export const WORKSPACE_SCOPE_NAME = "统计工作区";

export function isWorkspaceScopeId(id: string | undefined): boolean {
  return id?.trim() === WORKSPACE_SCOPE_ID;
}

export function workspaceDefinition(definition?: ProjectDefinition): ProjectDefinition {
  return {
    ...(definition ?? {}),
    id: WORKSPACE_SCOPE_ID,
    name: WORKSPACE_SCOPE_NAME,
  };
}
