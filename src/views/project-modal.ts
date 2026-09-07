import { App, Modal, Notice, Setting } from "obsidian";
import { localizeRoot, t } from "../i18n";

import { parseProjectEditor, type ProjectEditorInput } from "../projects/editor-model";
import { conditionTreeFromProjectFilter } from "../projects/scope-conditions";
import type { ProjectDefinition } from "../projects/types";
import { isWorkspaceScopeId } from "../projects/workspace";
import type { WritingCalendarRuntime } from "../service/runtime";
import { ScopeRuleBuilder } from "./scope-rule-builder";

export class ProjectEditorModal extends Modal {
  constructor(
    app: App,
    private readonly runtime: WritingCalendarRuntime,
    private readonly initial?: ProjectDefinition,
    private readonly onSaved?: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("wc-project-modal");
    localizeRoot(this.modalEl);
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const content = this.contentEl;
    content.empty();
    const isWorkspace = isWorkspaceScopeId(this.initial?.id);
    content.createEl("h2", { text: isWorkspace ? "编辑统计工作区" : this.initial ? "编辑写作项目" : "新建写作项目" });
    content.createDiv({
      cls: "setting-item-description wc-modal-intro",
      text: "范围完全由写作日历维护，不读取排版插件规则。用条件卡片选择文件夹、标签、扩展名、文件名或 Properties；每条可选择 AND / OR，选择“排除”即为 NOT。",
    });
    const errors = content.createDiv({ cls: "wc-form-errors", attr: { role: "alert", tabindex: "-1" } });
    const fields: ProjectEditorInput = {
      id: this.initial?.id ?? "",
      name: this.initial?.name ?? "",
      includeFolders: "",
      excludeFolders: "",
      includeTags: "",
      excludeTags: "",
      extensions: "",
      filenameGlobs: "",
      propertiesJson: "",
      advancedQuery: this.initial?.advancedQuery ?? "",
      conditionTree: conditionTreeFromProjectFilter(this.initial),
    };

    if (!isWorkspace) {
      new Setting(content)
        .setName("项目名称")
        .setDesc("例如：示例项目、短篇集或随笔。")
        .addText((text) => text.setPlaceholder("项目名称").setValue(fields.name).onChange((value) => (fields.name = value)));
    }
    const rulesSection = content.createEl("section", { cls: "wc-scope-editor-section", attr: { "aria-labelledby": "wc-scope-editor-heading" } });
    rulesSection.createEl("h3", { text: "统计条件", attr: { id: "wc-scope-editor-heading" } });
    rulesSection.createDiv({
      cls: "setting-item-description",
      text: "条件按显示顺序计算。文件夹、标签、扩展名和 Properties 字段会从当前仓库提供选项，也可以直接输入。",
    });
    const builderHost = rulesSection.createDiv();
    const builder = new ScopeRuleBuilder(builderHost, this.app, fields.conditionTree!, { allowGroups: true });

    const advanced = content.createEl("details", { cls: "wc-scope-advanced" });
    advanced.createEl("summary", { text: "高级筛选" });
    new Setting(advanced)
      .setName("高级筛选（可选）")
      .setDesc('用于补充更复杂的括号和 NOT；例如 folder("正文") AND tag("#小说")。无需安装 Dataview。高级表达式会与上方条件同时满足。')
      .addTextArea((area) => {
        area
          .setPlaceholder('folder("正文") AND tag("#小说")')
          .setValue(fields.advancedQuery)
          .onChange((value) => (fields.advancedQuery = value));
        area.inputEl.addClass("wc-query-input");
      });

    const actions = content.createDiv({ cls: "wc-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const saveLabel = isWorkspace ? "保存工作区" : "保存项目";
    const save = actions.createEl("button", { cls: "mod-cta", text: saveLabel, attr: { type: "button" } });
    save.addEventListener("click", async () => {
      errors.empty();
      fields.conditionTree = builder.getTree();
      const result = parseProjectEditor(fields);
      if (!result.ok) {
        errors.createEl("strong", { text: "请修正以下内容：" });
        const list = errors.createEl("ul");
        for (const message of Object.values(result.errors)) if (message) list.createEl("li", { text: message });
        errors.focus();
        return;
      }
      save.disabled = true;
      save.setText("正在保存…");
      try {
        await this.runtime.saveProject(result.definition);
        new Notice(t(isWorkspace ? "统计工作区已保存" : "写作项目已保存"));
        this.onSaved?.();
        this.close();
      } catch (error) {
        errors.setText(`保存失败：${error instanceof Error ? error.message : String(error)}`);
        errors.focus();
        save.disabled = false;
        save.setText(saveLabel);
      }
    });
  }
}
