import { getBrowserLocalStorage, type LocalStorageLike } from "../focus/identity";
import { parseAdvancedQuery } from "./advanced-query";
import { cloneScopeConditionTree, compileScopeConditionTree, hasScopeConditions } from "./scope-conditions";
import type { ProjectFilter, ScopeConditionGroup } from "./types";

const FORMAT_VERSION = 1;

export function workbenchFilterStorageKey(vaultName: string): string {
  return `writing-calendar:${encodeURIComponent(vaultName)}:workbench-filter`;
}

function validTree(value: unknown): value is ScopeConditionGroup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ScopeConditionGroup>;
  if (candidate.kind !== "group" || !Array.isArray(candidate.children)) return false;
  try {
    if (candidate.children.length > 0) compileScopeConditionTree(candidate as ScopeConditionGroup);
    return true;
  } catch {
    return false;
  }
}

function validFilter(value: unknown): value is ProjectFilter {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as ProjectFilter;
  if (candidate.conditionTree !== undefined && !validTree(candidate.conditionTree)) return false;
  if (candidate.advancedQuery?.trim()) {
    try {
      parseAdvancedQuery(candidate.advancedQuery);
    } catch {
      return false;
    }
  }
  return hasScopeConditions(candidate.conditionTree) || Boolean(candidate.advancedQuery?.trim());
}

/** Device-local persistence used only when the workbench “保留筛选” box is checked. */
export class LocalWorkbenchFilterStore {
  private readonly key: string;

  constructor(
    vaultName: string,
    private readonly storage: LocalStorageLike | undefined = getBrowserLocalStorage(),
  ) {
    this.key = workbenchFilterStorageKey(vaultName);
  }

  load(): ProjectFilter | null {
    const raw = this.storage?.getItem(this.key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { version?: unknown; filter?: unknown };
      if (parsed.version !== FORMAT_VERSION || !validFilter(parsed.filter)) return null;
      const filter = parsed.filter;
      return {
        ...(filter.conditionTree ? { conditionTree: cloneScopeConditionTree(filter.conditionTree) } : {}),
        ...(filter.advancedQuery?.trim() ? { advancedQuery: filter.advancedQuery.trim() } : {}),
      };
    } catch {
      return null;
    }
  }

  save(filter: ProjectFilter): void {
    if (!this.storage || !validFilter(filter)) return;
    this.storage.setItem(this.key, JSON.stringify({ version: FORMAT_VERSION, filter }));
  }

  clear(): void {
    this.storage?.removeItem(this.key);
  }
}
