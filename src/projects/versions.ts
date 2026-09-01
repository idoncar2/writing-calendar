import type { ProjectDefinition } from "./types";

export interface ProjectVersionRecord {
  formatVersion: 1;
  projectId: string;
  revisionId: string;
  parentRevisionIds: string[];
  deviceId: string;
  timestamp: string;
  deleted: boolean;
  definition: ProjectDefinition;
}

export interface ProjectVersionConflict {
  projectId: string;
  heads: ProjectVersionRecord[];
}

export interface ProjectVersionResolution {
  projects: ProjectVersionRecord[];
  conflicts: ProjectVersionConflict[];
}

export interface CreateProjectVersionOptions {
  definition: ProjectDefinition;
  deviceId: string;
  timestamp: string;
  revisionId: string;
  parents?: readonly ProjectVersionRecord[];
  deleted?: boolean;
}

function compareRecords(left: ProjectVersionRecord, right: ProjectVersionRecord): number {
  return left.timestamp.localeCompare(right.timestamp) || left.revisionId.localeCompare(right.revisionId);
}

export function createProjectVersion(options: CreateProjectVersionOptions): ProjectVersionRecord {
  const projectId = options.definition.id?.trim();
  if (!projectId) throw new Error("A project version requires a stable project id.");
  if (!options.revisionId.trim()) throw new Error("A project version requires a revision id.");
  if (!options.deviceId.trim()) throw new Error("A project version requires a device id.");
  if (Number.isNaN(new Date(options.timestamp).getTime())) throw new Error("Invalid project version timestamp.");

  return {
    formatVersion: 1,
    projectId,
    revisionId: options.revisionId,
    parentRevisionIds: [...new Set((options.parents ?? []).map((parent) => parent.revisionId))],
    deviceId: options.deviceId,
    timestamp: options.timestamp,
    deleted: options.deleted ?? false,
    definition: { ...options.definition, id: projectId },
  };
}

export function resolveProjectVersions(records: readonly ProjectVersionRecord[]): ProjectVersionResolution {
  const byProject = new Map<string, ProjectVersionRecord[]>();
  for (const record of records) {
    if (!record.projectId || !record.revisionId || record.formatVersion !== 1) continue;
    const current = byProject.get(record.projectId) ?? [];
    current.push(record);
    byProject.set(record.projectId, current);
  }

  const projects: ProjectVersionRecord[] = [];
  const conflicts: ProjectVersionConflict[] = [];
  for (const [projectId, projectRecords] of byProject) {
    const superseded = new Set(projectRecords.flatMap((record) => record.parentRevisionIds));
    const heads = projectRecords.filter((record) => !superseded.has(record.revisionId)).sort(compareRecords);
    if (heads.length > 1) {
      conflicts.push({ projectId, heads });
    } else if (heads.length === 1 && !heads[0].deleted) {
      projects.push(heads[0]);
    }
  }

  projects.sort((left, right) => left.projectId.localeCompare(right.projectId));
  conflicts.sort((left, right) => left.projectId.localeCompare(right.projectId));
  return { projects, conflicts };
}
