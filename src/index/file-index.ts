export interface FileSnapshotInput {
  path: string;
  /** File creation time, used to distinguish same-path recreation after downtime. */
  ctime?: number;
  mtime: number;
  creative: number;
  bodyCharacters: number;
  /** Obsidian tags observed during the latest local metadata scan. */
  tags?: readonly string[];
  properties: Record<string, unknown>;
}

export interface FileSnapshot extends FileSnapshotInput {
  fileId: string;
  tags: string[];
  aliases: string[];
  deleted: boolean;
  deletedAt?: number;
}

export interface FilePathRename {
  oldPath: string;
  newPath: string;
  ctime?: number;
}

export interface FolderRenameResult {
  renamed: FileSnapshot[];
  /** Indexed paths whose expected renamed counterpart was not confirmed in the vault. */
  missingPaths: string[];
}

export interface FileIndexHealth {
  healthy: boolean;
  issues: string[];
  currentFileCount: number;
  deletedFileCount: number;
  aliasedFileCount: number;
}

export interface SerializedFileIndex {
  formatVersion: 1;
  snapshots: FileSnapshot[];
}

function normalizePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`Invalid vault path: ${path}`);
  }
  return normalized;
}

function isWithinFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

function finiteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecreatedFile(existing: FileSnapshot, input: FileSnapshotInput): boolean {
  if (!finiteTimestamp(input.ctime)) return false;
  if (finiteTimestamp(existing.ctime)) return existing.ctime !== input.ctime;
  // Legacy snapshots did not persist ctime. A creation time after the last
  // observed mtime is the safe signal available for a same-path replacement.
  return finiteTimestamp(existing.mtime) && input.ctime > existing.mtime;
}

function replaceFolderPrefix(path: string, oldFolder: string, newFolder: string): string {
  return path === oldFolder ? newFolder : `${newFolder}/${path.slice(oldFolder.length + 1)}`;
}

function cloneSnapshot(snapshot: FileSnapshot): FileSnapshot {
  return {
    ...snapshot,
    aliases: [...snapshot.aliases],
    tags: [...snapshot.tags],
    properties: { ...snapshot.properties },
  };
}

function tags(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))];
}

export class FileIndex {
  private readonly byId = new Map<string, FileSnapshot>();
  private readonly idByPath = new Map<string, string>();
  private readonly loadIssues: string[] = [];

  constructor(private readonly createId: () => string) {}

  static from(value: unknown, createId: () => string): FileIndex {
    const index = new FileIndex(createId);
    if (!value || typeof value !== "object") return index;
    const serialized = value as Partial<SerializedFileIndex>;
    if (serialized.formatVersion !== 1 || !Array.isArray(serialized.snapshots)) return index;
    for (const candidate of serialized.snapshots) {
      if (!candidate || typeof candidate.fileId !== "string" || typeof candidate.path !== "string") {
        index.loadIssues.push("存在无法读取的文件索引记录");
        continue;
      }
      try {
        const snapshot = cloneSnapshot({
          ...candidate,
          ctime: finiteTimestamp(candidate.ctime) ? candidate.ctime : undefined,
          path: normalizePath(candidate.path),
          aliases: Array.isArray(candidate.aliases) ? candidate.aliases.map(normalizePath) : [],
          tags: tags(Array.isArray(candidate.tags) ? candidate.tags : []),
          properties:
            candidate.properties && typeof candidate.properties === "object"
              ? candidate.properties
              : {},
          deleted: candidate.deleted === true,
        });
        if (index.byId.has(snapshot.fileId)) {
          index.loadIssues.push(`重复 fileId: ${snapshot.fileId}`);
          continue;
        }
        if (!snapshot.deleted && index.idByPath.has(snapshot.path)) {
          index.loadIssues.push(`重复当前路径: ${snapshot.path}`);
        }
        index.byId.set(snapshot.fileId, snapshot);
        if (!snapshot.deleted) index.idByPath.set(snapshot.path, snapshot.fileId);
      } catch {
        // A single malformed cache entry must not prevent the rest from loading.
        index.loadIssues.push("存在无法读取的文件索引记录");
      }
    }
    return index;
  }

  upsert(input: FileSnapshotInput): FileSnapshot {
    const path = normalizePath(input.path);
    const existingId = this.idByPath.get(path);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (!existing) throw new Error("File index is internally inconsistent.");
      if (isRecreatedFile(existing, input)) {
        existing.deleted = true;
        existing.deletedAt = Date.now();
        this.idByPath.delete(path);
      } else {
        const ctime = finiteTimestamp(input.ctime) ? input.ctime : undefined;
        Object.assign(existing, {
          path,
          ...(ctime === undefined ? {} : { ctime }),
          mtime: input.mtime,
          creative: input.creative,
          bodyCharacters: input.bodyCharacters,
          tags: tags(input.tags),
          properties: { ...input.properties },
          deleted: false,
        });
        delete existing.deletedAt;
        return existing;
      }
    }

    const fileId = this.createId();
    if (!fileId || this.byId.has(fileId)) throw new Error("File id generator returned a duplicate id.");
    const snapshot: FileSnapshot = {
      ...input,
      ...(finiteTimestamp(input.ctime) ? { ctime: input.ctime } : {}),
      path,
      tags: tags(input.tags),
      properties: { ...input.properties },
      fileId,
      aliases: [],
      deleted: false,
    };
    this.byId.set(fileId, snapshot);
    this.idByPath.set(path, fileId);
    return snapshot;
  }

  rename(oldPathValue: string, newPathValue: string, ctime?: number): FileSnapshot | undefined {
    const oldPath = normalizePath(oldPathValue);
    const fileId = this.idByPath.get(oldPath);
    if (!fileId) return undefined;
    return this.renameMany([{ oldPath, newPath: newPathValue, ctime }])[0];
  }

  /**
   * Apply a set of path changes only after every source and target has been
   * validated. This keeps a partial folder rename from corrupting the index.
   */
  renameMany(mappings: readonly FilePathRename[]): FileSnapshot[] {
    const normalized = mappings.map(({ oldPath, newPath }) => ({
      oldPath: normalizePath(oldPath),
      newPath: normalizePath(newPath),
    }));
    const sourceIds = new Set<string>();
    const targetPaths = new Set<string>();
    const entries = normalized.map((mapping, index) => {
      const fileId = this.idByPath.get(mapping.oldPath);
      if (!fileId) throw new Error(`Cannot rename an unindexed file: ${mapping.oldPath}`);
      if (sourceIds.has(fileId)) {
        throw new Error(`A file path appears more than once in a rename batch: ${mapping.oldPath}`);
      }
      if (targetPaths.has(mapping.newPath)) {
        throw new Error(`A rename batch contains duplicate target path: ${mapping.newPath}`);
      }
      sourceIds.add(fileId);
      targetPaths.add(mapping.newPath);
      return { ...mapping, fileId, ctime: mappings[index]?.ctime };
    });

    for (const entry of entries) {
      const collision = this.idByPath.get(entry.newPath);
      if (collision && !sourceIds.has(collision)) {
        throw new Error(`A different file already owns path: ${entry.newPath}`);
      }
    }

    for (const entry of entries) this.idByPath.delete(entry.oldPath);
    return entries.map((entry) => {
      const snapshot = this.byId.get(entry.fileId);
      if (!snapshot) throw new Error("File index is internally inconsistent.");
      if (entry.oldPath !== entry.newPath && !snapshot.aliases.includes(entry.oldPath)) {
        snapshot.aliases.push(entry.oldPath);
      }
      snapshot.path = entry.newPath;
      if (finiteTimestamp(entry.ctime)) snapshot.ctime = entry.ctime;
      snapshot.deleted = false;
      delete snapshot.deletedAt;
      this.idByPath.set(entry.newPath, entry.fileId);
      return snapshot;
    });
  }

  /**
   * Plan and apply a folder rename from an already observed Vault state.
   * Missing counterparts are returned without changing any indexed snapshot;
   * the caller can then report a diagnostic and let normal reconciliation
   * tombstone the old paths and create IDs for genuinely new files.
   */
  renameFolder(
    oldFolderPathValue: string,
    newFolderPathValue: string,
    availablePaths: readonly (string | { path: string; ctime?: number })[],
  ): FolderRenameResult {
    const oldFolder = normalizePath(oldFolderPathValue);
    const newFolder = normalizePath(newFolderPathValue);
    const available = new Map<string, number | undefined>();
    for (const candidate of availablePaths) {
      const path = typeof candidate === "string" ? candidate : candidate.path;
      available.set(normalizePath(path), typeof candidate === "string" ? undefined : candidate.ctime);
    }
    const mappings = this.listCurrent()
      .filter((snapshot) => isWithinFolder(snapshot.path, oldFolder))
      .map((snapshot) => ({
        oldPath: snapshot.path,
        newPath: replaceFolderPrefix(snapshot.path, oldFolder, newFolder),
      }));
    const missingPaths = mappings
      .map((mapping) => mapping.newPath)
      .filter((path) => !available.has(path));
    if (missingPaths.length > 0) return { renamed: [], missingPaths };
    return {
      renamed: this.renameMany(mappings.map((mapping) => ({
        ...mapping,
        ctime: available.get(mapping.newPath),
      }))),
      missingPaths: [],
    };
  }

  remove(pathValue: string, deletedAt = Date.now()): FileSnapshot | undefined {
    const path = normalizePath(pathValue);
    const fileId = this.idByPath.get(path);
    if (!fileId) return undefined;
    const snapshot = this.byId.get(fileId);
    if (!snapshot) return undefined;
    this.idByPath.delete(path);
    snapshot.deleted = true;
    snapshot.deletedAt = deletedAt;
    return snapshot;
  }

  getByPath(pathValue: string): FileSnapshot | undefined {
    const fileId = this.idByPath.get(normalizePath(pathValue));
    return fileId ? this.byId.get(fileId) : undefined;
  }

  getById(fileId: string): FileSnapshot | undefined {
    return this.byId.get(fileId);
  }

  listCurrent(): FileSnapshot[] {
    return [...this.byId.values()]
      .filter((snapshot) => !snapshot.deleted)
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  listAll(): FileSnapshot[] {
    return [...this.byId.values()].sort((left, right) => left.fileId.localeCompare(right.fileId));
  }

  inspect(): FileIndexHealth {
    const issues = [...this.loadIssues];
    const ownerByPath = new Map<string, string>();
    for (const snapshot of this.byId.values()) {
      if (snapshot.deleted) {
        if (this.idByPath.get(snapshot.path) === snapshot.fileId) {
          issues.push(`已删除文件仍在当前路径索引: ${snapshot.path}`);
        }
        continue;
      }
      const owner = ownerByPath.get(snapshot.path);
      if (owner && owner !== snapshot.fileId) issues.push(`多个文件共享当前路径: ${snapshot.path}`);
      ownerByPath.set(snapshot.path, snapshot.fileId);
      if (this.idByPath.get(snapshot.path) !== snapshot.fileId) {
        issues.push(`当前路径映射不一致: ${snapshot.path}`);
      }
    }
    for (const [path, fileId] of this.idByPath) {
      const snapshot = this.byId.get(fileId);
      if (!snapshot || snapshot.deleted || snapshot.path !== path) {
        issues.push(`路径索引指向无效文件: ${path}`);
      }
    }
    const uniqueIssues = [...new Set(issues)];
    const current = this.listCurrent();
    const all = this.listAll();
    return {
      healthy: uniqueIssues.length === 0,
      issues: uniqueIssues,
      currentFileCount: current.length,
      deletedFileCount: all.filter((snapshot) => snapshot.deleted).length,
      aliasedFileCount: all.filter((snapshot) => snapshot.aliases.length > 0).length,
    };
  }

  serialize(): SerializedFileIndex {
    return { formatVersion: 1, snapshots: this.listAll().map(cloneSnapshot) };
  }
}
