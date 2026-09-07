import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { localizeRoot, refreshI18n, setUiLanguage, t, type UiLanguage } from "../i18n";

import type { ActivityMetric, CalendarDisplay, CountMode } from "./model";
import {
  CALENDAR_DISPLAY_OPTIONS,
  COUNT_MODE_OPTIONS,
  METRIC_OPTIONS,
} from "../views/options";
import type { WritingCalendarViewHost } from "../views/host";
import { ProjectEditorModal } from "../views/project-modal";
import { WORKSPACE_SCOPE_ID, workspaceDefinition } from "../projects/workspace";
import type { ScopeConditionNode } from "../projects/types";

function countConditions(node: ScopeConditionNode): number {
  return node.kind === "group"
    ? node.children.reduce((total, child) => total + countConditions(child), 0)
    : 1;
}

export class WritingCalendarSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: WritingCalendarViewHost,
  ) {
    super(app, plugin);
  }

  display(): void {
    const container = this.containerEl;
    container.empty();
    container.addClass("wc-settings");
    localizeRoot(container);
    new Setting(container).setName("写作日历").setHeading();
    new Setting(container)
      .setName("界面语言")
      .setDesc("默认跟随 Obsidian 的界面语言，也可以手动选择。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", "自动（跟随 Obsidian）")
          .addOption("zh-CN", "简体中文")
          .addOption("en", "English")
          .setValue(this.host.settings.uiLanguage)
          .onChange(async (value) => {
            const uiLanguage: UiLanguage = value === "zh-CN" || value === "en" ? value : "auto";
            setUiLanguage(uiLanguage);
            await this.host.runtime.updatePreferences({ uiLanguage });
            refreshI18n();
            this.display();
          }),
      );
    container.createDiv({
      cls: "setting-item-description wc-settings-intro",
      text: "插件的启用和停用由 Obsidian 的第三方插件页面统一管理；这里仅设置统计口径、颜色、侧栏显示与写作项目。",
    });

    new Setting(container).setName("统计口径").setHeading();
    new Setting(container)
      .setName("将粘贴计入手动输入")
      .setDesc("默认关闭。无论是否开启，粘贴始终单独保存，并始终计入增量。")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.includePasteInManual).onChange(async (includePasteInManual) => {
          await this.host.runtime.updatePreferences({ includePasteInManual });
        }),
      );
    new Setting(container)
      .setName("统计颜色")
      .setDesc("默认跟随 Obsidian 重点色，也可以使用独立颜色。")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("obsidian-accent", "跟随 Obsidian")
          .addOption("custom", "自定义")
          .setValue(this.host.settings.colorSource)
          .onChange(async (value) => {
            const colorSource = value as "obsidian-accent" | "custom";
            await this.host.runtime.updatePreferences({ colorSource });
            this.display();
          }),
      );
    if (this.host.settings.colorSource === "custom") {
      new Setting(container)
        .setName("自定义统计色")
        .addColorPicker((picker) =>
          picker.setValue(this.host.settings.customColor).onChange(async (customColor) => {
            await this.host.runtime.updatePreferences({ customColor });
          }),
        );
    }
    new Setting(container)
      .setName("状态栏统计")
      .setDesc("默认关闭。开启后显示今天的手动输入和净增。")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.showStatusBar).onChange(async (showStatusBar) => {
          await this.host.runtime.updatePreferences({ showStatusBar });
        }),
      );
    new Setting(container)
      .setName("文件列表显示字数")
      .setDesc("在左侧文件列表的每个文件名右侧显示当前字数（跟随统计口径的创作字数/正文字符）。")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.showExplorerCounts).onChange(async (showExplorerCounts) => {
          await this.host.runtime.updatePreferences({ showExplorerCounts });
        }),
      );
    new Setting(container)
      .setName("文件夹显示字数合集")
      .setDesc("在文件夹名右侧显示内部所有文档（含子文件夹）的字数合集；需先开启「文件列表显示字数」。")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.showFolderCounts).onChange(async (showFolderCounts) => {
          await this.host.runtime.updatePreferences({ showFolderCounts });
        }),
      );

    new Setting(container).setName("统计工作区").setHeading();
    container.createDiv({
      cls: "setting-item-description",
      text: "这是写作日历自己的默认统计范围，可与全部写作或命名项目切换。它可以按文件夹、标签、扩展名、文件名、Properties 和高级条件组合筛选；规则会作为普通仓库数据同步，不读取 Layout。",
    });
    const scopes = this.host.runtime.getProjects();
    const selectedScopeId = scopes.some((scope) => scope.id === this.host.settings.selectedProjectId)
      ? this.host.settings.selectedProjectId
      : WORKSPACE_SCOPE_ID;
    const scopeLabels: HTMLElement[] = [];
    const updateScopeLabels = (): void => {
      const scopeName = this.host.runtime.getProjects()
        .find((project) => project.id === this.host.settings.selectedProjectId)?.name ?? "全部写作";
      for (const label of scopeLabels) label.setText(`当前范围：${scopeName}`);
    };
    new Setting(container)
      .setName("当前统计范围")
      .setDesc("小日历、统计工作台、写作目标和状态栏共享这个范围。")
      .addDropdown((dropdown) => {
        for (const scope of scopes) dropdown.addOption(scope.id, scope.name);
        dropdown.setValue(selectedScopeId).onChange(async (selectedProjectId) => {
          await this.host.runtime.updatePreferences({ selectedProjectId });
          updateScopeLabels();
        });
      });
    scopeLabels.push(container.createDiv({ cls: "setting-item-description wc-settings-current-scope" }));
    updateScopeLabels();
    const workspace = scopes.find((scope) => scope.id === WORKSPACE_SCOPE_ID);
    new Setting(container)
      .setName("编辑工作区范围")
      .setDesc("基础条件之间取交集；也可在编辑器中填写 AND / OR / NOT 高级筛选。")
      .addButton((button) =>
        button.setCta().setButtonText("编辑工作区").onClick(() => {
          new ProjectEditorModal(
            this.app,
            this.host.runtime,
            workspaceDefinition(workspace?.definition),
            () => {
              void this.host.runtime.updatePreferences({ selectedProjectId: WORKSPACE_SCOPE_ID }).then(() => this.display());
            },
          ).open();
        }),
      );

    new Setting(container).setName("侧栏").setHeading();
    container.createDiv({
      cls: "setting-item-description",
      text: "侧栏只保留小日历与一行摘要；范围由上方“统计工作区”和下方“写作项目”独立维护。它不会读取或跟随 Chinese Writing Layout 的自动套用规则。",
    });
    new Setting(container)
      .setName("侧栏统计指标")
      .setDesc("侧栏日历与摘要使用的指标。")
      .addDropdown((dropdown) => {
        for (const option of METRIC_OPTIONS) dropdown.addOption(option.value, option.label);
        dropdown.setValue(this.host.settings.selectedMetric).onChange(async (value) => {
          const selectedMetric = value as ActivityMetric;
          await this.host.runtime.updatePreferences({ selectedMetric });
        });
      });
    new Setting(container)
      .setName("侧栏计数口径")
      .setDesc("字数统计口径：创作字数或正文字符数。")
      .addDropdown((dropdown) => {
        for (const option of COUNT_MODE_OPTIONS) dropdown.addOption(option.value, option.label);
        dropdown.setValue(this.host.settings.countMode).onChange(async (value) => {
          const countMode = value as CountMode;
          await this.host.runtime.updatePreferences({ countMode });
        });
      });
    new Setting(container)
      .setName("日历显示方式")
      .setDesc("活跃日期以哪种方式表达；精确数据始终可以通过鼠标悬浮或键盘聚焦查看。")
      .addDropdown((dropdown) => {
        for (const option of CALENDAR_DISPLAY_OPTIONS) dropdown.addOption(option.value, option.label);
        dropdown.setValue(this.host.settings.calendarDisplay).onChange(async (value) => {
          const calendarDisplay = value as CalendarDisplay;
          await this.host.runtime.updatePreferences({ calendarDisplay });
        });
      });
    new Setting(container)
      .setName("只显示三星期")
      .setDesc("小日历只显示上周、本周、下周三行，左右箭头改为按周切换。")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.sidebarThreeWeeks).onChange(async (sidebarThreeWeeks) => {
          await this.host.runtime.updatePreferences({ sidebarThreeWeeks });
        }),
      );
    new Setting(container).setName("侧栏摘要内容").setHeading();
    new Setting(container)
      .setName("显示本月字数")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.sidebarSummaryMonth).onChange(async (sidebarSummaryMonth) => {
          await this.host.runtime.updatePreferences({ sidebarSummaryMonth });
        }),
      );
    new Setting(container)
      .setName("显示今日字数")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.sidebarSummaryToday).onChange(async (sidebarSummaryToday) => {
          await this.host.runtime.updatePreferences({ sidebarSummaryToday });
        }),
      );
    new Setting(container)
      .setName("显示连续写作")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.sidebarSummaryStreak).onChange(async (sidebarSummaryStreak) => {
          await this.host.runtime.updatePreferences({ sidebarSummaryStreak });
        }),
      );
    new Setting(container)
      .setName("显示每日目标")
      .setDesc("在摘要下方显示 今日字数/每日目标 的完成度。")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.sidebarSummaryGoal).onChange(async (sidebarSummaryGoal) => {
          await this.host.runtime.updatePreferences({ sidebarSummaryGoal });
        }),
      );

    new Setting(container).setName("写作目标").setHeading();
    container.createDiv({
      cls: "setting-item-description",
      text: "在小日历最下侧显示每日目标，在新版工作台的「写作目标」模块显示每日 / 周 / 月目标与近 14 天回顾；目标范围跟随当前统计范围。",
    });
    new Setting(container)
      .setName("每日目标字数")
      .setDesc("每天要达到的目标字数；设为 0 表示不启用。")
      .addText((text) => {
        text.setPlaceholder("0").setValue(String(this.host.settings.goalTarget || ""));
        text.inputEl.setAttribute("inputmode", "numeric");
        text.onChange(async (value) => {
          const parsed = Number(value);
          await this.host.runtime.updatePreferences({
            goalTarget: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
          });
        });
      });
    new Setting(container)
      .setName("每周目标字数")
      .setDesc("本周（周一起）累计要达到的目标字数；设为 0 表示不启用。")
      .addText((text) => {
        text.setPlaceholder("0").setValue(String(this.host.settings.goalWeekTarget || ""));
        text.inputEl.setAttribute("inputmode", "numeric");
        text.onChange(async (value) => {
          const parsed = Number(value);
          await this.host.runtime.updatePreferences({
            goalWeekTarget: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
          });
        });
      });
    new Setting(container)
      .setName("每月目标字数")
      .setDesc("本月（自然月）累计要达到的目标字数；设为 0 表示不启用。")
      .addText((text) => {
        text.setPlaceholder("0").setValue(String(this.host.settings.goalMonthTarget || ""));
        text.inputEl.setAttribute("inputmode", "numeric");
        text.onChange(async (value) => {
          const parsed = Number(value);
          await this.host.runtime.updatePreferences({
            goalMonthTarget: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
          });
        });
      });
    new Setting(container)
      .setName("目标指标")
      .setDesc("计入目标的字数口径：增量 / 净增 / 手动输入 / 删除量。")
      .addDropdown((dropdown) => {
        for (const option of METRIC_OPTIONS) dropdown.addOption(option.value, option.label);
        dropdown.setValue(this.host.settings.goalMetric).onChange(async (value) => {
          const goalMetric = value as ActivityMetric;
          await this.host.runtime.updatePreferences({ goalMetric });
        });
      });
    const goalScopeLabel = container.createDiv({ cls: "setting-item-description" });
    scopeLabels.push(goalScopeLabel);
    updateScopeLabels();

    new Setting(container).setName("专注计时").setHeading();
    container.createDiv({
      cls: "setting-item-description",
      text: "可选的单次专注计时。关闭时不显示计时界面，也不会判断空闲或计算写字速度。",
    });
    new Setting(container)
      .setName("启用番茄钟")
      .setDesc("开启后才显示专注计时，并记录主动开始的专注 Session。")
      .addToggle((toggle) => {
        toggle.setValue(this.host.settings.focusEnabled).onChange(async (focusEnabled) => {
          await this.host.runtime.updatePreferences({ focusEnabled });
          renderFocusOptions();
        });
    });
    const focusOptions = container.createDiv({ cls: "wc-focus-settings-options" });
    const customDurationFields = new Set<"focusDurationMs" | "restDurationMs">();
    const customActiveGrace = { value: false };
    const renderFocusOptions = (): void => {
      focusOptions.empty();
      if (!this.host.settings.focusEnabled) return;
      new Setting(focusOptions)
        .setName("显示位置")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("calendar", "日历下方")
            .addOption("sidebar", "独立侧栏")
            .setValue(this.host.settings.focusDisplayMode)
            .onChange(async (value) => {
              await this.host.runtime.updatePreferences({
                focusDisplayMode: value === "sidebar" ? "sidebar" : "calendar",
              });
            }),
        );

      const durationSetting = (
        name: string,
        field: "focusDurationMs" | "restDurationMs",
        presets: readonly number[],
      ): void => {
        const minutes = Math.round(this.host.settings[field] / 60_000);
        const isCustom = customDurationFields.has(field) || !presets.includes(minutes);
        const preset = isCustom ? "custom" : String(minutes);
        new Setting(focusOptions)
          .setName(name)
          .addDropdown((dropdown) => {
            for (const value of presets) dropdown.addOption(String(value), `${value} 分钟`);
            dropdown.addOption("custom", "自定义");
            dropdown.setValue(preset).onChange(async (value) => {
              if (value === "custom") {
                customDurationFields.add(field);
                renderFocusOptions();
                return;
              }
              customDurationFields.delete(field);
              await this.host.runtime.updatePreferences({ [field]: Number(value) * 60_000 });
              renderFocusOptions();
            });
          });
        if (isCustom) {
          new Setting(focusOptions)
            .setName(`${name}（分钟）`)
            .addText((text) => {
              text.setValue(String(minutes));
              text.inputEl.setAttribute("inputmode", "numeric");
              text.onChange(async (value) => {
                const next = Number(value);
                if (!Number.isFinite(next) || next < 1) return;
                await this.host.runtime.updatePreferences({ [field]: Math.round(next) * 60_000 });
              });
            });
        }
      };
      durationSetting("默认专注时长", "focusDurationMs", [25, 45, 60]);
      durationSetting("默认休息时长", "restDurationMs", [5, 10, 15]);
      new Setting(focusOptions)
       .setName("记录不足 1 分钟的专注")
        .setDesc("默认关闭。关闭时，手动结束且不足 1 分钟的专注不会保存，并会显示提示。")
        .addToggle((toggle) =>
          toggle
            .setValue(this.host.settings.focusRecordShortSessions)
             .onChange(async (focusRecordShortSessions) => {
               await this.host.runtime.updatePreferences({ focusRecordShortSessions });
             }),
         );
       const activeGracePresets = [
         [30_000, "30 秒"],
         [60_000, "1 分钟"],
         [120_000, "2 分钟"],
         [300_000, "5 分钟"],
       ] as const;
       const activeGraceMs = this.host.settings.focusIdleThresholdMs;
       const isCustomActiveGrace =
         customActiveGrace.value || !activeGracePresets.some(([value]) => value === activeGraceMs);
       new Setting(focusOptions)
         .setName("实际写作窗口")
         .setDesc("每次编辑后保持为实际写作的时间；超过该时间没有新的编辑，就计入空闲时间。")
         .addDropdown((dropdown) => {
           for (const [value, label] of activeGracePresets) dropdown.addOption(String(value), label);
           dropdown.addOption("custom", "自定义");
           dropdown.setValue(isCustomActiveGrace ? "custom" : String(activeGraceMs)).onChange(async (value) => {
             if (value === "custom") {
               customActiveGrace.value = true;
               renderFocusOptions();
               return;
             }
             customActiveGrace.value = false;
             await this.host.runtime.updatePreferences({ focusIdleThresholdMs: Number(value) });
             renderFocusOptions();
           });
         });
       if (isCustomActiveGrace) {
         new Setting(focusOptions)
           .setName("实际写作窗口（秒）")
           .setDesc("请输入不小于 30 秒的时长。")
           .addText((text) => {
             text.setValue(String(Math.round(activeGraceMs / 1_000)));
             text.inputEl.setAttribute("inputmode", "numeric");
             text.onChange(async (value) => {
               const seconds = Number(value);
               if (!Number.isFinite(seconds) || seconds < 30) return;
               await this.host.runtime.updatePreferences({ focusIdleThresholdMs: Math.round(seconds * 1_000) });
             });
           });
       }
     };
    renderFocusOptions();

    new Setting(container).setName("同步数据").setHeading();
    new Setting(container)
      .setName("数据目录")
      .setDesc("这是普通仓库目录，可由 Remotely Save 等文件同步工具同步；插件不会主动触发云同步。")
      .addText((text) => {
        text.setValue(this.host.settings.dataFolder).setDisabled(true);
      });
    new Setting(container)
      .setName("数据诊断")
      .setDesc("查看账本读取、同步完整性、设备状态和当前文件索引。诊断不会修改历史账本。")
      .addButton((button) =>
        button.setButtonText("打开数据诊断").onClick(() => {
          void this.host.openDiagnostics();
        }),
      );
    const state = this.host.runtime.getState();
    if (state.paused) {
      new Setting(container)
        .setName("数据目录缺失")
        .setDesc("如果这是已有设备，请先完成远端同步；只有确认没有远端目录时才新建。")
        .addButton((button) =>
          button.setWarning().setButtonText("确认新建目录").onClick(async () => {
            await this.host.runtime.createMissingDataFolder();
            new Notice(t("写作日历数据目录已建立"));
            this.display();
          }),
        );
    }
    new Setting(container)
      .setName("重新读取同步数据")
      .setDesc("合并所有设备账本，按事件 ID 去重；不会修改其他设备文件。")
      .addButton((button) =>
        button.setButtonText("重新读取").onClick(async () => {
          await this.host.runtime.reloadSyncedData();
          new Notice(t("同步账本已重新读取"));
          this.display();
        }),
      );
    new Setting(container)
      .setName("重新扫描当前文件")
      .setDesc("只校准当前总字数、路径和项目归属，不补造历史活动。")
      .addButton((button) =>
        button.setButtonText("重新扫描").onClick(async () => {
          button.setDisabled(true).setButtonText("扫描中…");
          await this.host.runtime.scanAllFiles();
          new Notice(t("当前文件统计已校准"));
          this.display();
        }),
      );

    new Setting(container).setName("写作项目").setHeading();
    container.createDiv({
      cls: "setting-item-description",
      text: "项目规则完全由写作日历维护，可按文件夹、标签、扩展名、文件名、Properties 或高级筛选统计。它不会读取排版插件规则；同一文件可以同时属于多个项目。规则变更后会重新归集启用以来的历史。",
    });
    const createProject = new Setting(container).setName("管理项目");
    createProject.addButton((button) =>
      button.setCta().setButtonText("新建项目").onClick(() => {
        new ProjectEditorModal(this.app, this.host.runtime, undefined, () => this.display()).open();
      }),
    );
    for (const project of this.host.runtime.getProjects().filter((item) => item.id !== "all" && item.id !== WORKSPACE_SCOPE_ID)) {
      const row = new Setting(container).setName(project.name).setDesc(this.describeProject(project.definition));
      row.addButton((button) =>
        button.setButtonText("编辑").onClick(() => {
          new ProjectEditorModal(this.app, this.host.runtime, project.definition, () => this.display()).open();
        }),
      );
      row.addExtraButton((button) =>
        button.setIcon("trash-2").setTooltip("删除项目").onClick(async () => {
          if (!window.confirm(t(`确定删除项目“${project.name}”？历史账本不会被删除。`))) return;
          await this.host.runtime.deleteProject(project.id);
          new Notice(t("项目已移入可恢复的版本历史"));
          this.display();
        }),
      );
    }
    if (state.projectConflicts.length > 0) {
      new Setting(container).setName("需要处理的同步冲突").setHeading();
      for (const conflict of state.projectConflicts) {
        const block = container.createDiv({ cls: "wc-conflict-block" });
        block.createEl("strong", { text: `项目 ${conflict.projectId} 有 ${conflict.heads.length} 个并行版本` });
        block.createDiv({ cls: "setting-item-description", text: "选择一个版本后会写入合并记录，其他版本仍保留在历史中。" });
        const actions = block.createDiv({ cls: "wc-conflict-actions" });
        for (const head of conflict.heads) {
          const button = actions.createEl("button", {
            text: `采用“${head.definition.name ?? head.revisionId}” · ${head.deviceId}`,
            attr: { type: "button" },
          });
          button.addEventListener("click", async () => {
            await this.host.runtime.saveProject(head.definition);
            new Notice(t("项目冲突已合并"));
            this.display();
          });
        }
      }
    }
  }

  private describeProject(definition: ReturnType<WritingCalendarViewHost["runtime"]["getProjects"]>[number]["definition"]): string {
    if (!definition) return "";
    const parts = [
      definition.conditionTree?.children.length
        ? `可视条件：${countConditions(definition.conditionTree)} 条`
        : "",
      definition.includeFolders?.length
        ? `包含：${definition.includeFolders.join("、")}`
        : definition.conditionTree?.children.length ? "" : "全部文件夹",
      definition.excludeFolders?.length ? `排除：${definition.excludeFolders.join("、")}` : "",
      definition.includeTags?.length ? `标签：${definition.includeTags.join("、")}` : "",
      definition.excludeTags?.length ? `排除标签：${definition.excludeTags.join("、")}` : "",
      definition.extensions?.length
        ? `扩展名：${definition.extensions.join("、")}`
        : definition.conditionTree?.children.length ? "" : "Markdown",
      definition.advancedQuery ? `高级：${definition.advancedQuery}` : "",
    ].filter(Boolean);
    return parts.join("；");
  }
}
