import type { ProjectDefinition } from "../projects/types";
import type { DashboardSnapshot } from "../query/dashboard";
import type { WritingProjectOption } from "../service/engine";

export const WRITING_CALENDAR_MODULE_META = {
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
} as const;

export const WRITING_TOOLS_MODULES_CHANGED_EVENT = "writing-tools:modules-changed";

/**
 * Calendar-owned project rules exposed for a future combined workbench.
 * This is a publication boundary only: Writing Calendar never reads another
 * plugin's scope rules at runtime.
 */
export interface WritingCalendarScopeRulesApi {
  protocolVersion: 1;
  getDefinitions: () => readonly ProjectDefinition[];
  saveDefinition: (definition: ProjectDefinition) => Promise<void>;
}

export interface WritingCalendarModuleApi {
  meta: typeof WRITING_CALENDAR_MODULE_META;
  scopes?: WritingCalendarScopeRulesApi;
  getProjects?: () => WritingProjectOption[];
  getDashboard?: () => DashboardSnapshot;
  subscribe?: (listener: () => void) => () => void;
  openCalendar?: () => Promise<void>;
  openWorkbench?: (date?: string) => Promise<void>;
  saveProject?: (definition: ProjectDefinition) => Promise<void>;
}

export interface WritingToolsGlobal {
  __writingToolsModules?: Record<string, WritingCalendarModuleApi>;
  dispatchEvent?: (event: Event) => boolean;
}

function announceModuleChange(
  host: WritingToolsGlobal,
  action: "registered" | "unregistered",
): void {
  host.dispatchEvent?.(new CustomEvent(WRITING_TOOLS_MODULES_CHANGED_EVENT, {
    detail: { moduleId: WRITING_CALENDAR_MODULE_META.moduleId, action },
  }));
}

export function registerWritingModule(
  host: WritingToolsGlobal,
  api: WritingCalendarModuleApi,
): () => void {
  const registry = host.__writingToolsModules ?? {};
  host.__writingToolsModules = registry;
  registry[api.meta.moduleId] = api;
  announceModuleChange(host, "registered");
  return () => {
    if (registry[api.meta.moduleId] !== api) return;
    delete registry[api.meta.moduleId];
    announceModuleChange(host, "unregistered");
  };
}
