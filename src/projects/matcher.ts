import type {
  ProjectDefinition,
  ProjectFile,
  ProjectFilter,
  ProjectMatchCategory,
  ProjectMatchCheck,
  ProjectMatchReason,
  ProjectMatchResult,
  PropertyPredicate,
} from "./types";
import {
  evaluateAdvancedQuery,
  parseAdvancedQuery,
  type AdvancedQueryNode,
  type AdvancedQueryTerm,
} from "./advanced-query";
import { compileScopeConditionTree, hasScopeConditions } from "./scope-conditions";

export type {
  ProjectDefinition,
  ProjectFile,
  ProjectFilter,
  ProjectMatchCategory,
  ProjectMatchCheck,
  ProjectMatchReason,
  ProjectMatchResult,
  PropertyOperator,
  PropertyPredicate,
  PropertyScalar,
  PropertyValue,
  ScopeConditionGroup,
  ScopeConditionJoin,
  ScopeConditionLeaf,
  ScopeConditionNode,
} from "./types";

type ProjectInput = ProjectDefinition | ProjectFilter;
type PropertyRecord = Record<string, unknown>;

const PROPERTY_OPERATORS = new Set(["exists", "missing", "equals", "not-equals", "contains"]);
const ADVANCED_QUERY_CACHE_LIMIT = 64;
const advancedQueryCache = new Map<string, AdvancedQueryNode | Error>();

/** Normalize an Obsidian vault path to slash-separated, relative form. */
export function normalizeProjectPath(path: string): string {
  let normalized = path.trim().replace(/\\/g, "/").replace(/\/+/g, "/");

  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  normalized = normalized.replace(/^\/+/, "");

  if (normalized === ".") {
    return "";
  }

  normalized = normalized.replace(/\/+$/, "");
  return normalized;
}

function normalizeFolder(folder: string): string {
  return normalizeProjectPath(folder);
}

function nonEmptyStrings(values: readonly string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function getRules(input: ProjectInput): ProjectFilter {
  const definition = input as ProjectDefinition;
  const nested = definition.rules ?? definition.filter;
  if (!nested) {
    return input;
  }

  return {
    conditionTree: nested.conditionTree ?? input.conditionTree,
    includeFolders: nested.includeFolders ?? input.includeFolders,
    excludeFolders: nested.excludeFolders ?? input.excludeFolders,
    includeTags: nested.includeTags ?? input.includeTags,
    excludeTags: nested.excludeTags ?? input.excludeTags,
    extensions: nested.extensions ?? input.extensions,
    filenameGlobs: nested.filenameGlobs ?? input.filenameGlobs,
    properties: nested.properties ?? input.properties,
    advancedQuery: nested.advancedQuery ?? input.advancedQuery,
  };
}

function isProjectFile(value: unknown): value is ProjectFile {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { path?: unknown }).path === "string"
  );
}

function asArguments(
  first: ProjectFile | ProjectInput,
  second: ProjectFile | ProjectInput,
): { file: ProjectFile; project: ProjectInput } {
  if (isProjectFile(first) && !isProjectFile(second)) {
    return { file: first, project: second as ProjectInput };
  }
  if (!isProjectFile(first) && isProjectFile(second)) {
    return { file: second, project: first as ProjectInput };
  }
  throw new TypeError("A project file and a project definition are required");
}

function isWithinFolder(path: string, folder: string): boolean {
  if (folder.length === 0) {
    return true;
  }
  return path === folder || path.startsWith(`${folder}/`);
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? path : path.slice(slash + 1);
}

function extensionOf(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return "";
  }
  return name.slice(dot + 1).toLowerCase();
}

function normalizeExtension(extension: string): string {
  let normalized = extension.trim().toLowerCase();
  if (normalized.startsWith("*.")) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith(".")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

/** Treat `tag` and `#tag` as the same Obsidian tag, case-insensitively. */
export function normalizeProjectTag(tag: string): string {
  const normalized = tag.trim().replace(/^#+/u, "");
  return normalized ? `#${normalized}`.toLocaleLowerCase("en-US") : "";
}

function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return [];
  return [...new Set(tags.map(normalizeProjectTag).filter(Boolean))];
}

function propertyTags(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  return [];
}

function fileTags(file: ProjectFile): string[] {
  const properties = getProperties(file);
  return normalizeTags([
    ...(file.tags ?? []),
    ...propertyTags(properties.tags),
    ...propertyTags(properties.tag),
  ]);
}

function globPatternToRegExp(pattern: string): RegExp {
  let expression = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === "*") {
      if (pattern[index + 1] === "*") {
        // `**/name` also matches `name` at the root, as users expect from a
        // filename glob.  Other globstars may cross path separators.
        if (pattern[index + 2] === "/" && (index === 0 || pattern[index - 1] === "/")) {
          expression += "(?:.*/)?";
          index += 2;
        } else {
          expression += ".*";
          index += 1;
        }
      } else {
        expression += "[^/]*";
      }
      continue;
    }

    if (character === "?") {
      expression += "[^/]";
      continue;
    }

    if ("\\^$+?.()|[]{}".includes(character)) {
      expression += `\\${character}`;
    } else {
      expression += character;
    }
  }

  return new RegExp(`${expression}$`);
}

function matchesGlob(path: string, glob: string): boolean {
  const normalizedGlob = normalizeProjectPath(glob);
  const target = normalizedGlob.includes("/") ? path : basename(path);
  return globPatternToRegExp(normalizedGlob).test(target);
}

function getProperties(file: ProjectFile): PropertyRecord {
  const result: PropertyRecord = {};

  for (const source of [file.metadata, file.frontmatter, file.properties]) {
    if (!source) {
      continue;
    }
    Object.assign(result, source);
  }

  return result;
}

function propertyKey(predicate: PropertyPredicate): string {
  return (predicate.key ?? predicate.property ?? "").trim();
}

function propertyOperator(predicate: PropertyPredicate): string {
  return (predicate.operator ?? predicate.op ?? "").trim().toLowerCase();
}

function scalarEquals(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

function arrayIncludes(values: readonly unknown[], expected: unknown): boolean {
  return values.some((value) => scalarEquals(value, expected));
}

function propertyEquals(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    if (Array.isArray(expected)) {
      return (
        actual.length === expected.length &&
        actual.every((value, index) => scalarEquals(value, expected[index]))
      );
    }
    return arrayIncludes(actual, expected);
  }

  return !Array.isArray(expected) && scalarEquals(actual, expected);
}

function propertyContains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    if (Array.isArray(expected)) {
      return expected.every((value) => arrayIncludes(actual, value));
    }
    return arrayIncludes(actual, expected);
  }

  return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
}

function evaluateProperty(
  properties: PropertyRecord,
  predicate: PropertyPredicate,
): { matched: boolean; key: string; operator: string } {
  const key = propertyKey(predicate);
  const operator = propertyOperator(predicate);
  const present = key.length > 0 && Object.prototype.hasOwnProperty.call(properties, key) && properties[key] !== undefined;
  const actual = properties[key];

  if (!PROPERTY_OPERATORS.has(operator)) {
    return { matched: false, key, operator };
  }

  switch (operator) {
    case "exists":
      return { matched: present, key, operator };
    case "missing":
      return { matched: !present, key, operator };
    case "equals":
      return { matched: present && propertyEquals(actual, predicate.value), key, operator };
    case "not-equals":
      return { matched: present && !propertyEquals(actual, predicate.value), key, operator };
    case "contains":
      return { matched: present && propertyContains(actual, predicate.value), key, operator };
    default:
      return { matched: false, key, operator };
  }
}

function parsedAdvancedQuery(source: string): AdvancedQueryNode | Error {
  const cached = advancedQueryCache.get(source);
  if (cached) return cached;
  let result: AdvancedQueryNode | Error;
  try {
    result = parseAdvancedQuery(source);
  } catch (error) {
    result = error instanceof Error ? error : new Error(String(error));
  }
  if (advancedQueryCache.size >= ADVANCED_QUERY_CACHE_LIMIT) {
    const oldest = advancedQueryCache.keys().next().value;
    if (oldest !== undefined) advancedQueryCache.delete(oldest);
  }
  advancedQueryCache.set(source, result);
  return result;
}

function matchesAdvancedTerm(
  term: AdvancedQueryTerm,
  normalizedPath: string,
  tags: readonly string[],
  properties: PropertyRecord,
): boolean {
  switch (term.kind) {
    case "folder":
      return isWithinFolder(normalizedPath, normalizeFolder(term.value));
    case "tag": {
      const tag = normalizeProjectTag(term.value);
      return Boolean(tag) && tags.includes(tag);
    }
    case "extension": {
      const expected = normalizeExtension(term.value);
      return Boolean(expected) && (expected === "*" || extensionOf(normalizedPath) === expected);
    }
    case "filename":
      return Boolean(term.value.trim()) && matchesGlob(normalizedPath, term.value);
    case "property":
      return evaluateProperty(properties, {
        key: term.key,
        operator: term.operator,
        value: term.value,
      }).matched;
  }
}

function reason(
  code: ProjectMatchReason["code"],
  category: ProjectMatchCategory,
  message: string,
  rule?: string | PropertyPredicate,
  property?: string,
): ProjectMatchReason {
  return { code, category, message, ...(rule === undefined ? {} : { rule }), ...(property === undefined ? {} : { property }) };
}

function pushCheck(
  checks: ProjectMatchCheck[],
  category: ProjectMatchCategory,
  active: boolean,
  matched: boolean,
): void {
  checks.push({ category, active, matched });
}

/** Evaluate a file against a project and return all failed conditions. */
export function evaluateProject(file: ProjectFile, project: ProjectInput): ProjectMatchResult;
export function evaluateProject(project: ProjectInput, file: ProjectFile): ProjectMatchResult;
export function evaluateProject(
  first: ProjectFile | ProjectInput,
  second: ProjectFile | ProjectInput,
): ProjectMatchResult {
  const { file, project } = asArguments(first, second);
  const rules = getRules(project);
  const normalizedPath = normalizeProjectPath(file.path);
  const reasons: ProjectMatchReason[] = [];
  const checks: ProjectMatchCheck[] = [];

  const includeFolders = nonEmptyStrings(rules.includeFolders).map(normalizeFolder).filter(Boolean);
  const excludeFolders = nonEmptyStrings(rules.excludeFolders).map(normalizeFolder).filter(Boolean);
  const includeTags = normalizeTags(rules.includeTags);
  const excludeTags = normalizeTags(rules.excludeTags);
  const extensions = nonEmptyStrings(rules.extensions).map(normalizeExtension).filter(Boolean);
  const filenameGlobs = nonEmptyStrings(rules.filenameGlobs).map(normalizeProjectPath).filter(Boolean);
  const properties = rules.properties?.filter((predicate) => predicate !== undefined) ?? [];

  const excluded = excludeFolders.some((folder) => isWithinFolder(normalizedPath, folder));
  pushCheck(checks, "exclude-folders", excludeFolders.length > 0, !excluded);
  if (excluded) {
    const matchedRule = excludeFolders.find((folder) => isWithinFolder(normalizedPath, folder));
    reasons.push(
      reason(
        "exclude-folder",
        "exclude-folders",
        `Path "${normalizedPath}" is excluded by folder "${matchedRule ?? ""}".`,
        matchedRule,
      ),
    );
  }

  const included = includeFolders.length === 0 || includeFolders.some((folder) => isWithinFolder(normalizedPath, folder));
  pushCheck(checks, "include-folders", includeFolders.length > 0, included);
  if (!included) {
    reasons.push(
      reason(
        "include-folder",
        "include-folders",
        `Path "${normalizedPath}" is not inside any included folder.`,
      ),
    );
  }

  const tags = fileTags(file);
  const excludedByTag = excludeTags.some((tag) => tags.includes(tag));
  pushCheck(checks, "exclude-tags", excludeTags.length > 0, !excludedByTag);
  if (excludedByTag) {
    const matchedRule = excludeTags.find((tag) => tags.includes(tag));
    reasons.push(
      reason(
        "exclude-tag",
        "exclude-tags",
        `File "${normalizedPath}" is excluded by tag "${matchedRule ?? ""}".`,
        matchedRule,
      ),
    );
  }

  const includedByTag = includeTags.length === 0 || includeTags.some((tag) => tags.includes(tag));
  pushCheck(checks, "include-tags", includeTags.length > 0, includedByTag);
  if (!includedByTag) {
    reasons.push(
      reason(
        "include-tag",
        "include-tags",
        `File "${normalizedPath}" does not have any included tag.`,
      ),
    );
  }

  const extension = extensionOf(normalizedPath);
  const extensionMatches = extensions.length === 0 || extensions.includes("*") || extensions.includes(extension);
  pushCheck(checks, "extensions", extensions.length > 0, extensionMatches);
  if (!extensionMatches) {
    reasons.push(
      reason(
        "extension",
        "extensions",
        `Extension ".${extension}" does not match the configured extensions.`,
      ),
    );
  }

  const globMatches = filenameGlobs.length === 0 || filenameGlobs.some((glob) => matchesGlob(normalizedPath, glob));
  pushCheck(checks, "filename-globs", filenameGlobs.length > 0, globMatches);
  if (!globMatches) {
    reasons.push(
      reason(
        "filename-glob",
        "filename-globs",
        `File "${basename(normalizedPath)}" does not match any configured filename glob.`,
      ),
    );
  }

  const fileProperties = getProperties(file);
  const failedProperties = properties
    .map((predicate) => ({ predicate, result: evaluateProperty(fileProperties, predicate) }))
    .filter(({ result: propertyResult }) => !propertyResult.matched);
  pushCheck(checks, "properties", properties.length > 0, failedProperties.length === 0);
  for (const { predicate, result: propertyResult } of failedProperties) {
    const description = propertyResult.key.length > 0 ? `Property "${propertyResult.key}"` : "Property predicate";
    reasons.push(
      reason(
        "property",
        "properties",
        `${description} does not satisfy operator "${propertyResult.operator}".`,
        predicate,
        propertyResult.key,
      ),
    );
  }

  const conditionTree = rules.conditionTree;
  const conditionTreeActive = hasScopeConditions(conditionTree);
  let conditionTreeMatches = true;
  let conditionTreeError: Error | undefined;
  if (conditionTreeActive && conditionTree) {
    try {
      const source = compileScopeConditionTree(conditionTree);
      const parsed = parsedAdvancedQuery(source);
      if (parsed instanceof Error) {
        conditionTreeMatches = false;
        conditionTreeError = parsed;
      } else {
        conditionTreeMatches = evaluateAdvancedQuery(
          parsed,
          (term) => matchesAdvancedTerm(term, normalizedPath, tags, fileProperties),
        );
      }
    } catch (error) {
      conditionTreeMatches = false;
      conditionTreeError = error instanceof Error ? error : new Error(String(error));
    }
  }
  pushCheck(checks, "conditions", conditionTreeActive, conditionTreeMatches);
  if (!conditionTreeMatches) {
    reasons.push(
      reason(
        "condition",
        "conditions",
        conditionTreeError
          ? `可视筛选无法解析：${conditionTreeError.message}`
          : `File "${normalizedPath}" does not satisfy the visual scope conditions.`,
      ),
    );
  }

  const advancedQuery = rules.advancedQuery?.trim() ?? "";
  let advancedQueryMatches = true;
  let advancedQueryError: Error | undefined;
  if (advancedQuery) {
    const parsed = parsedAdvancedQuery(advancedQuery);
    if (parsed instanceof Error) {
      advancedQueryMatches = false;
      advancedQueryError = parsed;
    } else {
      advancedQueryMatches = evaluateAdvancedQuery(
        parsed,
        (term) => matchesAdvancedTerm(term, normalizedPath, tags, fileProperties),
      );
    }
  }
  pushCheck(checks, "advanced-query", advancedQuery.length > 0, advancedQueryMatches);
  if (!advancedQueryMatches) {
    reasons.push(
      reason(
        "advanced-query",
        "advanced-query",
        advancedQueryError
          ? `高级筛选无法解析：${advancedQueryError.message}`
          : `File "${normalizedPath}" does not satisfy the advanced query.`,
        advancedQuery,
      ),
    );
  }

  return { matched: reasons.length === 0, normalizedPath, reasons, checks };
}

/** Alias emphasizing that the result is intended for settings-page previews. */
export function explainProjectMatch(file: ProjectFile, project: ProjectInput): ProjectMatchResult;
export function explainProjectMatch(project: ProjectInput, file: ProjectFile): ProjectMatchResult;
export function explainProjectMatch(
  first: ProjectFile | ProjectInput,
  second: ProjectFile | ProjectInput,
): ProjectMatchResult {
  const { file, project } = asArguments(first, second);
  return evaluateProject(file, project);
}

/** Return only the boolean match decision when an explanation is not needed. */
export function matchesProject(file: ProjectFile, project: ProjectInput): boolean;
export function matchesProject(project: ProjectInput, file: ProjectFile): boolean;
export function matchesProject(
  first: ProjectFile | ProjectInput,
  second: ProjectFile | ProjectInput,
): boolean {
  const { file, project } = asArguments(first, second);
  return evaluateProject(file, project).matched;
}

export const evaluateProjectMatch = evaluateProject;
export const matchProject = matchesProject;
