import { parseAdvancedQuery } from "./advanced-query";
import {
  cloneScopeConditionTree,
  compileScopeConditionTree,
  conditionTreeFromProjectFilter,
  hasScopeConditions,
} from "./scope-conditions";
import type { ProjectDefinition, PropertyPredicate, ScopeConditionGroup } from "./types";

export interface ProjectEditorInput {
  id: string;
  name: string;
  includeFolders: string;
  excludeFolders: string;
  includeTags: string;
  excludeTags: string;
  extensions: string;
  filenameGlobs: string;
  propertiesJson: string;
  advancedQuery: string;
  /** Canonical rules supplied by the option-based editor. */
  conditionTree?: ScopeConditionGroup;
}

export type ProjectEditorResult =
  | { ok: true; definition: ProjectDefinition }
  | { ok: false; errors: Partial<Record<keyof ProjectEditorInput, string>> };

const PROPERTY_OPERATORS = new Set(["exists", "missing", "equals", "not-equals", "contains"]);

function list(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function tagList(value: string): string[] {
  return [...new Set(list(value).map((item) => item.replace(/^#+/u, "")).filter(Boolean).map((item) => `#${item}`))];
}

function parseProperties(value: string): PropertyPredicate[] {
  if (!value.trim()) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("需要填写 JSON 数组");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${index + 1} 项不是对象`);
    const predicate = item as Record<string, unknown>;
    const key = predicate.key ?? predicate.property;
    const operator = predicate.operator ?? predicate.op;
    if (typeof key !== "string" || !key.trim()) throw new Error(`第 ${index + 1} 项缺少 key`);
    if (typeof operator !== "string" || !PROPERTY_OPERATORS.has(operator)) {
      throw new Error(`第 ${index + 1} 项的 operator 无效`);
    }
    return {
      key: key.trim(),
      operator,
      ...(Object.prototype.hasOwnProperty.call(predicate, "value") ? { value: predicate.value as PropertyPredicate["value"] } : {}),
    };
  });
}

export function parseProjectEditor(input: ProjectEditorInput): ProjectEditorResult {
  const errors: Partial<Record<keyof ProjectEditorInput, string>> = {};
  const name = input.name.trim();
  if (!name) errors.name = "请输入项目名称。";
  let properties: PropertyPredicate[] = [];
  try {
    properties = parseProperties(input.propertiesJson);
  } catch (error) {
    errors.propertiesJson = `Properties 条件格式错误：${error instanceof Error ? error.message : String(error)}`;
  }
  const advancedQuery = input.advancedQuery.trim();
  if (advancedQuery) {
    try {
      parseAdvancedQuery(advancedQuery);
    } catch (error) {
      errors.advancedQuery = `高级筛选格式错误：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (input.conditionTree && hasScopeConditions(input.conditionTree)) {
    try {
      parseAdvancedQuery(compileScopeConditionTree(input.conditionTree));
    } catch (error) {
      errors.conditionTree = `可视筛选格式错误：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const includeFolders = list(input.includeFolders).map((path) => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
  const excludeFolders = list(input.excludeFolders).map((path) => path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""));
  const includeTags = tagList(input.includeTags);
  const excludeTags = tagList(input.excludeTags);
  const extensions = list(input.extensions).map((extension) => extension.toLowerCase().replace(/^\*?\./, ""));
  const filenameGlobs = list(input.filenameGlobs).map((glob) => glob.replace(/\\/g, "/"));
  const conditionTree = input.conditionTree ? cloneScopeConditionTree(input.conditionTree) : conditionTreeFromProjectFilter({
    includeFolders,
    excludeFolders,
    includeTags,
    excludeTags,
    extensions,
    filenameGlobs,
    properties,
  });
  const visualRulesAreCanonical = input.conditionTree !== undefined;

  return {
    ok: true,
    definition: {
      ...(input.id.trim() ? { id: input.id.trim() } : {}),
      name,
      conditionTree,
      includeFolders: visualRulesAreCanonical ? [] : includeFolders,
      excludeFolders: visualRulesAreCanonical ? [] : excludeFolders,
      includeTags: visualRulesAreCanonical ? [] : includeTags,
      excludeTags: visualRulesAreCanonical ? [] : excludeTags,
      extensions: visualRulesAreCanonical ? [] : extensions,
      filenameGlobs: visualRulesAreCanonical ? [] : filenameGlobs,
      properties: visualRulesAreCanonical ? [] : properties,
      ...(advancedQuery ? { advancedQuery } : {}),
    },
  };
}
