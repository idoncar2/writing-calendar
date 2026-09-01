import { App, getAllTags, setIcon, TFolder } from "obsidian";

import { cloneScopeConditionTree } from "../projects/scope-conditions";
import type {
  PropertyOperator,
  PropertyScalar,
  PropertyValue,
  ScopeConditionGroup,
  ScopeConditionJoin,
  ScopeConditionLeaf,
  ScopeConditionNode,
} from "../projects/types";

export interface ScopeRuleBuilderOptions {
  compact?: boolean;
  allowGroups?: boolean;
  onChange?: (tree: ScopeConditionGroup) => void;
}

type TextConditionKind = Extract<ScopeConditionLeaf["kind"], "folder" | "tag" | "extension" | "filename">;

const CONDITION_TYPES: readonly { value: ScopeConditionLeaf["kind"]; label: string }[] = [
  { value: "folder", label: "文件夹" },
  { value: "tag", label: "标签" },
  { value: "extension", label: "扩展名" },
  { value: "filename", label: "文件名" },
  { value: "property", label: "Properties" },
];

const PROPERTY_OPERATORS: readonly { value: PropertyOperator; label: string }[] = [
  { value: "equals", label: "等于" },
  { value: "not-equals", label: "不等于" },
  { value: "contains", label: "包含" },
  { value: "exists", label: "存在" },
  { value: "missing", label: "不存在" },
];

let fallbackId = 0;

function newConditionId(prefix: string): string {
  fallbackId += 1;
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${fallbackId}`;
  return `${prefix}-${random}`;
}

function childrenOf(group: ScopeConditionGroup): ScopeConditionNode[] {
  return group.children as ScopeConditionNode[];
}

function newLeaf(join: ScopeConditionJoin = "and"): ScopeConditionLeaf {
  return { id: newConditionId("condition"), kind: "folder", join, value: "" };
}

function newGroup(join: ScopeConditionJoin = "and"): ScopeConditionGroup {
  return {
    id: newConditionId("group"),
    kind: "group",
    join,
    children: [newLeaf("and")],
  };
}

function scalarText(value: PropertyValue | undefined): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value === null) return "null";
  return value === undefined ? "" : String(value);
}

function isPropertyScalar(value: unknown): value is PropertyScalar {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function parsePropertyValue(value: string): PropertyValue {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every(isPropertyScalar)) return parsed;
    } catch {
      // Keep malformed JSON-like input as a string so validation remains inline on save.
    }
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/u.test(trimmed)) return Number(trimmed);
  return value;
}

function option(select: HTMLSelectElement, value: string, label: string): void {
  select.createEl("option", { value, text: label });
}

function iconButton(
  container: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const button = container.createEl("button", {
    cls: "clickable-icon wc-scope-icon-button",
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(button, icon);
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

/** Shared, serializable option-card editor used by Settings and the workbench. */
export class ScopeRuleBuilder {
  private tree: ScopeConditionGroup;
  private readonly folders: string[];
  private readonly tags: string[];
  private readonly extensions: string[];
  private readonly properties: string[];
  private readonly listIds: Record<"folder" | "tag" | "extension" | "property", string>;

  constructor(
    private readonly container: HTMLElement,
    private readonly app: App,
    initial: ScopeConditionGroup,
    private readonly options: ScopeRuleBuilderOptions = {},
  ) {
    this.tree = cloneScopeConditionTree(initial);
    const files = this.app.vault.getFiles();
    this.folders = this.app.vault.getAllLoadedFiles()
      .filter((entry): entry is TFolder => entry instanceof TFolder && entry.path.length > 0)
      .map((folder) => folder.path)
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
    const tagSet = new Set<string>();
    const propertySet = new Set<string>();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache) for (const tag of getAllTags(cache) ?? []) tagSet.add(tag);
      for (const key of Object.keys(cache?.frontmatter ?? {})) propertySet.add(key);
    }
    this.tags = [...tagSet].sort((left, right) => left.localeCompare(right, "zh-CN"));
    this.extensions = [...new Set(files.map((file) => file.extension.toLowerCase()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
    this.properties = [...propertySet].sort((left, right) => left.localeCompare(right, "zh-CN"));
    const id = newConditionId("suggestions");
    this.listIds = {
      folder: `${id}-folders`,
      tag: `${id}-tags`,
      extension: `${id}-extensions`,
      property: `${id}-properties`,
    };
    this.render();
  }

  getTree(): ScopeConditionGroup {
    return cloneScopeConditionTree(this.tree);
  }

  private changed(): void {
    this.options.onChange?.(this.getTree());
  }

  private render(): void {
    this.container.empty();
    this.container.addClass("wc-scope-rule-builder");
    if (this.options.compact) this.container.addClass("is-compact");
    this.renderDatalist(this.listIds.folder, this.folders);
    this.renderDatalist(this.listIds.tag, this.tags);
    this.renderDatalist(this.listIds.extension, this.extensions);
    this.renderDatalist(this.listIds.property, this.properties);

    const list = this.container.createDiv({ cls: "wc-scope-rule-list" });
    if (this.tree.children.length === 0) {
      list.createDiv({
        cls: "wc-scope-rule-empty",
        text: "尚未添加条件；保存后会统计全部写作文件。",
      });
    }
    this.renderChildren(list, this.tree, 0);

    const actions = this.container.createDiv({ cls: "wc-scope-rule-add-actions" });
    const add = actions.createEl("button", { text: "添加条件", attr: { type: "button" } });
    add.addEventListener("click", () => {
      childrenOf(this.tree).push(newLeaf(this.tree.children.length === 0 ? "and" : "and"));
      this.changed();
      this.render();
    });
    if (this.options.allowGroups !== false) {
      const addGroup = actions.createEl("button", { text: "添加条件组", attr: { type: "button" } });
      addGroup.addEventListener("click", () => {
        childrenOf(this.tree).push(newGroup(this.tree.children.length === 0 ? "and" : "and"));
        this.changed();
        this.render();
      });
    }
  }

  private renderDatalist(id: string, values: readonly string[]): void {
    const datalist = this.container.createEl("datalist", { attr: { id } });
    for (const value of values) datalist.createEl("option", { value });
  }

  private renderChildren(container: HTMLElement, group: ScopeConditionGroup, depth: number): void {
    group.children.forEach((node, index) => {
      if (node.kind === "group") this.renderGroupCard(container, group, node, index, depth);
      else this.renderLeafCard(container, group, node, index, depth);
    });
  }

  private renderConnector(container: HTMLElement, node: ScopeConditionNode, index: number): void {
    if (index === 0) return;
    const label = container.createEl("label", { cls: "wc-scope-connector" });
    label.createSpan({ text: "与上一条的关系" });
    const select = label.createEl("select", { attr: { "aria-label": "与上一条的关系" } });
    option(select, "and", "并且（AND）");
    option(select, "or", "或者（OR）");
    select.value = node.join === "or" ? "or" : "and";
    select.addEventListener("change", () => {
      node.join = select.value === "or" ? "or" : "and";
      this.changed();
    });
  }

  private renderCardActions(
    container: HTMLElement,
    parent: ScopeConditionGroup,
    index: number,
    noun: "条件" | "条件组",
  ): void {
    const actions = container.createDiv({ cls: "wc-scope-rule-card-actions" });
    const labels = noun === "条件"
      ? { up: "上移条件", down: "下移条件", remove: "删除条件" }
      : { up: "上移条件组", down: "下移条件组", remove: "删除条件组" };
    iconButton(actions, "arrow-up", labels.up, () => this.move(parent, index, -1), index === 0);
    iconButton(actions, "arrow-down", labels.down, () => this.move(parent, index, 1), index === parent.children.length - 1);
    iconButton(actions, "trash-2", labels.remove, () => this.remove(parent, index));
  }

  private renderNegation(container: HTMLElement, node: ScopeConditionNode): void {
    const label = container.createEl("label", { cls: "wc-scope-field" });
    label.createSpan({ text: "匹配方式" });
    const select = label.createEl("select", { attr: { "aria-label": "匹配方式" } });
    option(select, "include", "计入" );
    option(select, "exclude", "排除（NOT）");
    select.value = node.negate ? "exclude" : "include";
    select.addEventListener("change", () => {
      node.negate = select.value === "exclude";
      this.changed();
    });
  }

  private renderLeafCard(
    container: HTMLElement,
    parent: ScopeConditionGroup,
    condition: ScopeConditionLeaf,
    index: number,
    depth: number,
  ): void {
    const card = container.createDiv({
      cls: "wc-scope-rule-card",
      attr: { "data-depth": String(depth), "data-condition-id": condition.id },
    });
    const header = card.createDiv({ cls: "wc-scope-rule-card-header" });
    const lead = header.createDiv({ cls: "wc-scope-rule-card-lead" });
    this.renderConnector(lead, condition, index);
    lead.createSpan({ cls: "wc-scope-rule-card-title", text: `条件 ${index + 1}` });
    this.renderCardActions(header, parent, index, "条件");

    const fields = card.createDiv({ cls: "wc-scope-rule-fields" });
    const typeField = fields.createEl("label", { cls: "wc-scope-field" });
    typeField.createSpan({ text: "条件类型" });
    const type = typeField.createEl("select", { attr: { "aria-label": "条件类型" } });
    for (const item of CONDITION_TYPES) option(type, item.value, item.label);
    type.value = condition.kind;
    const valueArea = fields.createDiv({ cls: "wc-scope-value-fields" });
    this.renderNegation(fields, condition);
    this.renderValueFields(valueArea, condition);
    type.addEventListener("change", () => {
      const replacement = this.conditionOfKind(condition, type.value as ScopeConditionLeaf["kind"]);
      childrenOf(parent)[index] = replacement;
      this.changed();
      this.render();
    });
  }

  private conditionOfKind(existing: ScopeConditionLeaf, kind: ScopeConditionLeaf["kind"]): ScopeConditionLeaf {
    const base = { id: existing.id, join: existing.join, ...(existing.negate ? { negate: true } : {}) };
    if (kind === "property") return { ...base, kind, key: "", operator: "equals", value: "" };
    return { ...base, kind: kind as TextConditionKind, value: "" };
  }

  private renderValueFields(container: HTMLElement, condition: ScopeConditionLeaf): void {
    if (condition.kind !== "property") {
      const labels: Record<TextConditionKind, string> = {
        folder: "文件夹",
        tag: "标签",
        extension: "扩展名",
        filename: "文件名规则",
      };
      const placeholders: Record<TextConditionKind, string> = {
        folder: "例如：正文/草稿",
        tag: "例如：#小说",
        extension: "例如：md",
        filename: "例如：章节-*.md",
      };
      const field = container.createEl("label", { cls: "wc-scope-field is-grow" });
      field.createSpan({ text: labels[condition.kind] });
      const input = field.createEl("input", {
        type: "text",
        value: condition.value,
        placeholder: placeholders[condition.kind],
        attr: { "aria-label": labels[condition.kind] },
      });
      if (condition.kind !== "filename") input.setAttribute("list", this.listIds[condition.kind]);
      input.addEventListener("input", () => {
        condition.value = input.value;
        this.changed();
      });
      return;
    }

    const keyField = container.createEl("label", { cls: "wc-scope-field is-grow" });
    keyField.createSpan({ text: "Properties 字段" });
    const key = keyField.createEl("input", {
      type: "text",
      value: condition.key,
      placeholder: "例如：status",
      attr: { "aria-label": "Properties 字段", list: this.listIds.property },
    });
    key.addEventListener("input", () => {
      condition.key = key.value;
      this.changed();
    });

    const operatorField = container.createEl("label", { cls: "wc-scope-field" });
    operatorField.createSpan({ text: "运算符" });
    const operator = operatorField.createEl("select", { attr: { "aria-label": "Properties 运算符" } });
    for (const item of PROPERTY_OPERATORS) option(operator, item.value, item.label);
    operator.value = condition.operator;

    const valueField = container.createEl("label", { cls: "wc-scope-field is-grow" });
    valueField.createSpan({ text: "值" });
    const value = valueField.createEl("input", {
      type: "text",
      value: scalarText(condition.value),
      placeholder: "字符串、数字、true / false / null 或数组",
      attr: { "aria-label": "Properties 值" },
    });
    const syncValueVisibility = (): void => {
      valueField.toggleClass("is-hidden", condition.operator === "exists" || condition.operator === "missing");
    };
    syncValueVisibility();
    operator.addEventListener("change", () => {
      condition.operator = operator.value as PropertyOperator;
      syncValueVisibility();
      this.changed();
    });
    value.addEventListener("input", () => {
      condition.value = parsePropertyValue(value.value);
      this.changed();
    });
  }

  private renderGroupCard(
    container: HTMLElement,
    parent: ScopeConditionGroup,
    group: ScopeConditionGroup,
    index: number,
    depth: number,
  ): void {
    const card = container.createDiv({
      cls: "wc-scope-rule-card wc-scope-rule-group",
      attr: { "data-depth": String(depth), "data-condition-id": group.id },
    });
    const header = card.createDiv({ cls: "wc-scope-rule-card-header" });
    const lead = header.createDiv({ cls: "wc-scope-rule-card-lead" });
    this.renderConnector(lead, group, index);
    lead.createSpan({ cls: "wc-scope-rule-card-title", text: "条件组" });
    this.renderNegation(lead, group);
    this.renderCardActions(header, parent, index, "条件组");
    const nested = card.createDiv({ cls: "wc-scope-rule-group-body" });
    this.renderChildren(nested, group, depth + 1);
    const add = card.createEl("button", { cls: "wc-scope-group-add", text: "向组内添加条件", attr: { type: "button" } });
    add.addEventListener("click", () => {
      childrenOf(group).push(newLeaf(group.children.length === 0 ? "and" : "and"));
      this.changed();
      this.render();
    });
  }

  private move(parent: ScopeConditionGroup, index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= parent.children.length) return;
    const children = childrenOf(parent);
    [children[index], children[target]] = [children[target] as ScopeConditionNode, children[index] as ScopeConditionNode];
    children[0]!.join = "and";
    this.changed();
    this.render();
  }

  private remove(parent: ScopeConditionGroup, index: number): void {
    childrenOf(parent).splice(index, 1);
    if (parent.children[0]) parent.children[0].join = "and";
    this.changed();
    this.render();
  }
}
