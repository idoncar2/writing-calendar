/** Values supported by an Obsidian Property predicate. */
export type PropertyScalar = string | number | boolean | null;

export type PropertyValue = PropertyScalar | readonly PropertyScalar[];

export type PropertyOperator = "exists" | "missing" | "equals" | "not-equals" | "contains";

/**
 * A single Property condition.
 *
 * `key`/`operator` are the canonical names.  `property`/`op` are accepted as
 * aliases because persisted settings and importers commonly use those names.
 */
export interface PropertyPredicate {
  key?: string;
  property?: string;
  operator?: PropertyOperator | string;
  op?: PropertyOperator | string;
  value?: PropertyValue;
}

export type ScopeConditionJoin = "and" | "or";

interface ScopeConditionBase {
  /** Stable UI identity; it has no matching semantics. */
  id: string;
  /** How this node combines with the preceding sibling. Ignored for the first child. */
  join?: ScopeConditionJoin;
  /** Negates this node after its own value/group has been evaluated. */
  negate?: boolean;
}

export type ScopeConditionLeaf =
  | (ScopeConditionBase & { kind: "folder" | "tag" | "extension" | "filename"; value: string })
  | (ScopeConditionBase & {
    kind: "property";
    key: string;
    operator: PropertyOperator;
    value?: PropertyValue;
  });

/** Parenthesized condition group. Children are evaluated from top to bottom. */
export interface ScopeConditionGroup extends ScopeConditionBase {
  kind: "group";
  children: readonly ScopeConditionNode[];
}

export type ScopeConditionNode = ScopeConditionLeaf | ScopeConditionGroup;

/** The pure, user-editable portion of a project definition. */
export interface ProjectFilter {
  /** Serializable rules created by the option-based scope editor. */
  conditionTree?: ScopeConditionGroup;
  includeFolders?: readonly string[];
  excludeFolders?: readonly string[];
  /** Obsidian tags of which at least one must be present. */
  includeTags?: readonly string[];
  /** Obsidian tags which always exclude a file from this project. */
  excludeTags?: readonly string[];
  extensions?: readonly string[];
  filenameGlobs?: readonly string[];
  properties?: readonly PropertyPredicate[];
  /** Standalone Dataview-style expression combined with all ordinary rules. */
  advancedQuery?: string;
}

/**
 * Stable project metadata plus its matching rules.
 *
 * Rules may be stored directly (the convenient form used by the matcher) or
 * under `rules`/`filter` by a settings model.  The matcher supports both.
 */
export interface ProjectDefinition extends ProjectFilter {
  id?: string;
  name?: string;
  version?: number;
  rules?: ProjectFilter;
  filter?: ProjectFilter;
}

/** File data needed by the pure matcher; no Obsidian API types are required. */
export interface ProjectFile {
  path: string;
  /** Tags are kept apart from Properties so tag scopes remain first-class. */
  tags?: readonly string[];
  properties?: Record<string, unknown>;
  frontmatter?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type ProjectMatchCategory =
  | "conditions"
  | "include-folders"
  | "exclude-folders"
  | "include-tags"
  | "exclude-tags"
  | "extensions"
  | "filename-globs"
  | "properties"
  | "advanced-query";

export type ProjectMatchReasonCode =
  | "condition"
  | "include-folder"
  | "exclude-folder"
  | "include-tag"
  | "exclude-tag"
  | "extension"
  | "filename-glob"
  | "property"
  | "advanced-query";

export interface ProjectMatchReason {
  code: ProjectMatchReasonCode;
  category: ProjectMatchCategory;
  message: string;
  rule?: string | PropertyPredicate;
  property?: string;
}

export interface ProjectMatchCheck {
  category: ProjectMatchCategory;
  active: boolean;
  matched: boolean;
}

export interface ProjectMatchResult {
  matched: boolean;
  normalizedPath: string;
  reasons: ProjectMatchReason[];
  checks: ProjectMatchCheck[];
}
