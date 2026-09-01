import type { FileIndex, FileSnapshot } from "../index/file-index";
import { aggregateEvents } from "../ledger/aggregate";
import { mergeEvents } from "../ledger/merge";
import type { ActivityEvent, ActivityMetric, CountMode, DailyFileAggregate } from "../ledger/types";
import { matchesProject } from "../projects/matcher";
import type { ProjectDefinition, ProjectFilter } from "../projects/types";
import { isWorkspaceScopeId, workspaceDefinition, WORKSPACE_SCOPE_ID, WORKSPACE_SCOPE_NAME } from "../projects/workspace";
import { buildDashboardSnapshot, type ActivityRow, type DashboardSnapshot } from "../query/dashboard";

export interface WritingProjectOption {
  id: string;
  name: string;
  definition?: ProjectDefinition;
}

export interface WritingCalendarEngineOptions {
  fileIndex: FileIndex;
  events?: readonly ActivityEvent[];
  projects?: readonly ProjectDefinition[];
}

export interface GoalSnapshot {
  /** 目标是否启用：目标字数大于 0。 */
  enabled: boolean;
  metric: ActivityMetric;
  target: number;
  /** 目标范围内按目标指标逐文件累加的当前值。 */
  current: number;
  /** 目标范围内对所选指标有贡献（累计值不为 0）的去重文件数。 */
  activeDocuments: number;
  /** 目标范围内当前存在的文件总数。 */
  totalDocuments: number;
}

export class WritingCalendarEngine {
  private events: ActivityEvent[];
  private projects: ProjectDefinition[];

  constructor(private readonly options: WritingCalendarEngineOptions) {
    this.events = mergeEvents(options.events ?? []);
    this.projects = [...(options.projects ?? [])];
  }

  setEvents(events: readonly ActivityEvent[]): void {
    this.events = mergeEvents(events);
  }

  addEvent(event: ActivityEvent): void {
    this.events = mergeEvents([this.events, [event]]);
  }

  setProjects(projects: readonly ProjectDefinition[]): void {
    this.projects = [...projects];
  }

  listProjects(): WritingProjectOption[] {
    const definitions = this.projects
      .filter((project): project is ProjectDefinition & { id: string } => !!project.id);
    const savedWorkspace = definitions.find((project) => isWorkspaceScopeId(project.id));
    return [
      { id: "all", name: "全部写作" },
      {
        id: WORKSPACE_SCOPE_ID,
        name: WORKSPACE_SCOPE_NAME,
        definition: workspaceDefinition(savedWorkspace),
      },
      ...definitions
        .filter((project) => !isWorkspaceScopeId(project.id))
        .map((definition) => ({ id: definition.id, name: definition.name?.trim() || definition.id, definition })),
    ];
  }

  dashboard(
    projectId: string,
    countMode: CountMode,
    includePasteInManual: boolean,
    today: string,
  ): DashboardSnapshot {
    return this.runDashboard(
      this.projects.find((project) => project.id === projectId),
      countMode,
      includePasteInManual,
      today,
    );
  }

  /**
   * 按临时过滤条件统计（如「工作区文件夹」合成的范围），不要求该条件已登记为项目。
   */
  dashboardForDefinition(
    definition: ProjectFilter,
    countMode: CountMode,
    includePasteInManual: boolean,
    today: string,
  ): DashboardSnapshot {
    return this.runDashboard(definition, countMode, includePasteInManual, today);
  }

  private runDashboard(
    definition: ProjectDefinition | undefined,
    countMode: CountMode,
    includePasteInManual: boolean,
    today: string,
  ): DashboardSnapshot {
    const resolvedEvents = this.events
      .filter((event) => !definition || this.matchesDefinition(event, definition));
    const rows = aggregateEvents(resolvedEvents, { countMode, includePasteInManual })
      .map((row) => this.withDisplayPath(row));
    const currentFiles = this.currentMatchingFiles(definition).map((snapshot) => ({
      fileId: snapshot.fileId,
      path: snapshot.path,
      creative: snapshot.creative,
      bodyCharacters: snapshot.bodyCharacters,
    }));

    return buildDashboardSnapshot({ rows, currentTotals: currentFiles, today, countMode });
  }

  /**
   * 写作目标快照：在项目范围内按指定活动指标逐文件累加，得到当前累计值、
   * 有贡献的文档数与范围内文档总数。与 dashboard() 共享同一套项目过滤。
   */
  goalSnapshot(
    projectId: string,
    metric: ActivityMetric,
    target: number,
    countMode: CountMode,
    includePasteInManual: boolean,
    today: string,
  ): GoalSnapshot {
    const definition = this.projects.find((project) => project.id === projectId);
    const resolvedEvents = this.events
      .filter((event) => !definition || this.matchesDefinition(event, definition));
    const rows = aggregateEvents(resolvedEvents, { countMode, includePasteInManual });

    const perFile = new Map<string, number>();
    let current = 0;
    for (const row of rows) {
      const value = row[metric];
      current += value;
      const fileKey = row.fileId || `path:${row.path}`;
      perFile.set(fileKey, (perFile.get(fileKey) ?? 0) + value);
    }
    let activeDocuments = 0;
    for (const value of perFile.values()) {
      if (value !== 0) activeDocuments += 1;
    }

    return {
      enabled: target > 0,
      metric,
      target,
      current,
      activeDocuments,
      totalDocuments: this.currentMatchingFiles(definition).length,
    };
  }

  private currentMatchingFiles(definition: ProjectDefinition | undefined): FileSnapshot[] {
    return this.options.fileIndex
      .listCurrent()
      .filter((snapshot) => !definition || matchesProject(this.asProjectFile(snapshot), definition));
  }

  private matchesDefinition(event: ActivityEvent, definition: ProjectFilter): boolean {
    const snapshot = this.currentFileForEvent(event);
    return matchesProject(
      snapshot ? { ...this.asProjectFile(snapshot), path: event.path } : { path: event.path, properties: {} },
      definition,
    );
  }

  private withDisplayPath(row: DailyFileAggregate): ActivityRow {
    const snapshot = row.fileId
      ? this.options.fileIndex.getById(row.fileId)
      : this.options.fileIndex.getByPath(row.path);
    if (!snapshot || snapshot.path === row.path) return row;
    return { ...row, displayPath: snapshot.path };
  }

  private currentFileForEvent(event: ActivityEvent): FileSnapshot | undefined {
    return (event.fileId ? this.options.fileIndex.getById(event.fileId) : undefined)
      ?? this.options.fileIndex.getByPath(event.path);
  }

  private asProjectFile(snapshot: FileSnapshot): { path: string; tags: readonly string[]; properties: Record<string, unknown> } {
    return { path: snapshot.path, tags: snapshot.tags, properties: snapshot.properties };
  }
}
