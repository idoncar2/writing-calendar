import { describe, expect, it } from "vitest";

import * as workspaceModule from "../src/projects/workspace";
import type { ProjectFilter } from "../src/projects/types";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("local workbench filter", () => {
  it("is available as a vault-scoped, device-local store", () => {
    const Store = (workspaceModule as unknown as Record<string, unknown>).LocalWorkbenchFilterStore;
    expect(Store).toBeTypeOf("function");
    if (typeof Store !== "function") return;

    const storage = new MemoryStorage();
    const filter: ProjectFilter = {
      conditionTree: {
        id: "root",
        kind: "group",
        children: [{ id: "folder", kind: "folder", join: "and", value: "正文" }],
      },
      advancedQuery: 'tag("#小说")',
    };
    const local = new (Store as new (vault: string, storage: MemoryStorage) => {
      save(filter: ProjectFilter): void;
      load(): ProjectFilter | null;
      clear(): void;
    })("My Vault", storage);

    local.save(filter);
    expect(local.load()).toEqual(filter);
    const other = new (Store as new (vault: string, storage: MemoryStorage) => { load(): ProjectFilter | null })("Other", storage);
    expect(other.load()).toBeNull();
    local.clear();
    expect(local.load()).toBeNull();
  });
});
