import type {
  ProjectFilter,
  PropertyOperator,
  PropertyScalar,
  PropertyValue,
  ScopeConditionGroup,
  ScopeConditionLeaf,
  ScopeConditionNode,
} from "./types";

export class ScopeConditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeConditionError";
  }
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

function scalar(value: PropertyScalar): string {
  if (typeof value === "string") return quoted(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ScopeConditionError("Properties 条件值必须是有限数字");
    return String(value);
  }
  if (typeof value === "boolean") return String(value);
  if (value === null) return "null";
  throw new ScopeConditionError("Properties 条件值无效");
}

function propertyValue(value: PropertyValue | undefined): string {
  if (Array.isArray(value)) return `[${value.map((entry) => scalar(entry)).join(", ")}]`;
  if (value === undefined) throw new ScopeConditionError("Properties 条件缺少比较值");
  return scalar(value as PropertyScalar);
}

function compileLeaf(condition: ScopeConditionLeaf): string {
  switch (condition.kind) {
    case "folder":
    case "tag":
    case "extension":
    case "filename": {
      const value = condition.value.trim();
      if (!value) throw new ScopeConditionError("筛选条件缺少值");
      return `${condition.kind}(${quoted(value)})`;
    }
    case "property": {
      const key = condition.key.trim();
      if (!key) throw new ScopeConditionError("Properties 条件缺少字段名");
      const left = `property(${quoted(key)})`;
      switch (condition.operator) {
        case "exists":
          return `${left} EXISTS`;
        case "missing":
          return `${left} MISSING`;
        case "equals":
          return `${left} = ${propertyValue(condition.value)}`;
        case "not-equals":
          return `${left} != ${propertyValue(condition.value)}`;
        case "contains":
          return `${left} CONTAINS ${propertyValue(condition.value)}`;
      }
    }
  }
}

function compileNode(node: ScopeConditionNode): string {
  let expression: string;
  if (node.kind === "group") {
    expression = compileGroup(node, false);
    if (!expression) throw new ScopeConditionError("条件组不能为空");
    expression = `(${expression})`;
  } else {
    expression = compileLeaf(node);
  }
  return node.negate ? `NOT (${expression})` : expression;
}

function compileGroup(group: ScopeConditionGroup, allowEmpty: boolean): string {
  const children = group.children ?? [];
  if (children.length === 0) {
    if (allowEmpty) return "";
    throw new ScopeConditionError("条件组不能为空");
  }

  let expression = compileNode(children[0] as ScopeConditionNode);
  for (let index = 1; index < children.length; index += 1) {
    const child = children[index] as ScopeConditionNode;
    const operator = child.join === "or" ? "OR" : "AND";
    expression = `(${expression} ${operator} ${compileNode(child)})`;
  }
  return expression;
}

export function hasScopeConditions(tree: ScopeConditionGroup | undefined): boolean {
  return Boolean(tree && tree.kind === "group" && tree.children.length > 0);
}

/** Compile the visual rule tree to the plugin's standalone query language. */
export function compileScopeConditionTree(tree: ScopeConditionGroup): string {
  if (tree.kind !== "group") throw new ScopeConditionError("筛选根节点必须是条件组");
  const expression = compileGroup(tree, true);
  return tree.negate && expression ? `NOT (${expression})` : expression;
}

function cloneNode(node: ScopeConditionNode): ScopeConditionNode {
  if (node.kind === "group") {
    return { ...node, children: node.children.map(cloneNode) };
  }
  return { ...node };
}

export function cloneScopeConditionTree(tree: ScopeConditionGroup): ScopeConditionGroup {
  return cloneNode(tree) as ScopeConditionGroup;
}

function textGroup(
  id: string,
  kind: Extract<ScopeConditionLeaf["kind"], "folder" | "tag" | "extension" | "filename">,
  values: readonly string[] | undefined,
  negate = false,
): ScopeConditionGroup | undefined {
  const normalized = values?.map((value) => value.trim()).filter(Boolean) ?? [];
  if (normalized.length === 0) return undefined;
  return {
    id,
    kind: "group",
    join: "and",
    ...(negate ? { negate: true } : {}),
    children: normalized.map((value, index) => ({
      id: `${id}-${index + 1}`,
      kind,
      join: index === 0 ? "and" : "or",
      value,
    })),
  };
}

/** Convert the legacy category fields to an exactly equivalent visual tree. */
export function conditionTreeFromProjectFilter(filter: ProjectFilter | undefined): ScopeConditionGroup {
  if (filter?.conditionTree) return cloneScopeConditionTree(filter.conditionTree);

  const children: ScopeConditionNode[] = [];
  const groups = [
    textGroup("legacy-include-folders", "folder", filter?.includeFolders),
    textGroup("legacy-exclude-folders", "folder", filter?.excludeFolders, true),
    textGroup("legacy-include-tags", "tag", filter?.includeTags),
    textGroup("legacy-exclude-tags", "tag", filter?.excludeTags, true),
    textGroup("legacy-extensions", "extension", filter?.extensions),
    textGroup("legacy-filenames", "filename", filter?.filenameGlobs),
  ];
  for (const group of groups) if (group) children.push(group);

  const propertyConditions = filter?.properties?.flatMap((predicate, index): ScopeConditionLeaf[] => {
    const key = (predicate.key ?? predicate.property ?? "").trim();
    const operator = (predicate.operator ?? predicate.op ?? "").trim().toLocaleLowerCase("en-US");
    if (!key || !["exists", "missing", "equals", "not-equals", "contains"].includes(operator)) return [];
    return [{
      id: `legacy-properties-${index + 1}`,
      kind: "property",
      join: index === 0 ? "and" : "and",
      key,
      operator: operator as PropertyOperator,
      ...(Object.prototype.hasOwnProperty.call(predicate, "value")
        ? { value: predicate.value }
        : {}),
    } as ScopeConditionLeaf];
  }) ?? [];
  if (propertyConditions.length > 0) {
    children.push({
      id: "legacy-properties",
      kind: "group",
      join: "and",
      children: propertyConditions,
    });
  }

  return { id: "root", kind: "group", children };
}
