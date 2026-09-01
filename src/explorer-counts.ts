import type { App, TAbstractFile } from "obsidian";

import type { WritingCalendarRuntime } from "./service/runtime";
import type { WritingCalendarSettings } from "./settings/model";

const COUNT_CLASS = "wc-explorer-count";

/**
 * file-explorer 的条目结构没有公开 API，新旧版本字段名不同：
 * 旧版 titleEl/titleInnerEl（nav-file-title），新版 selfEl/innerEl（tree-item-self）。
 * 只读取我们需要的部分，缺哪个字段就跳过该条目。
 */
interface ExplorerFileItem {
  file: TAbstractFile;
  titleEl?: HTMLElement;
  selfEl?: HTMLElement;
}

interface FileExplorerView {
  fileItems?: Record<string, ExplorerFileItem>;
  containerEl?: HTMLElement;
}

/**
 * 左侧文件列表的字数角标：文件名右侧显示当前字数，文件夹名右侧
 * 可选显示内部所有文档的字数合集（跟随统计口径：创作字数/正文字符）。
 *
 * 文件条目走 file-explorer 视图的 fileItems（路径→元素）；
 * 文件夹不在 fileItems 里，改为遍历 DOM 上标题元素的 data-path。
 * 刷新时先移除旧角标再按需重建；开关关闭或插件卸载时统一移除，
 * 不在 Obsidian 里残留 DOM。
 */
export class FileExplorerCounts {
  private timer?: number;

  constructor(
    private readonly app: App,
    private readonly settings: WritingCalendarSettings,
    private readonly runtime: WritingCalendarRuntime,
  ) {}

  /** 设置变更、扫描完成、布局变化都会调用；内部防抖合并成一次重建。 */
  refresh(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      this.apply(this.settings.showExplorerCounts);
    }, 400);
  }

  /** 插件卸载时清理，避免角标残留在文件列表里。 */
  clear(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
    this.apply(false);
  }

  private apply(enabled: boolean): void {
    for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
      const view = leaf.view as unknown as FileExplorerView | null;
      if (!view) continue;
      const folderSums = enabled && this.settings.showFolderCounts ? this.folderSums() : undefined;

      for (const [path, item] of Object.entries(view.fileItems ?? {})) {
        const titleEl = item.selfEl ?? item.titleEl;
        if (!titleEl) continue;
        const text = enabled && !this.runtime.isDataPath(path) ? this.countText(path) : null;
        this.setBadge(titleEl, text);
      }

      view.containerEl?.querySelectorAll<HTMLElement>(".nav-folder-title").forEach((titleEl) => {
        const path = titleEl.getAttribute("data-path");
        const sum = folderSums && path !== null ? folderSums.get(this.normalizeFolderPath(path)) : undefined;
        this.setBadge(titleEl, sum === undefined ? null : sum.toLocaleString("zh-CN"));
      });
    }
  }

  private setBadge(titleEl: HTMLElement, text: string | null): void {
    titleEl.querySelector(`:scope > .${COUNT_CLASS}`)?.remove();
    if (text === null) return;
    const badge = document.createElement("span");
    badge.className = COUNT_CLASS;
    badge.setText(text);
    titleEl.appendChild(badge);
  }

  private countText(path: string): string | null {
    const snapshot = this.runtime.fileIndex.getByPath(path);
    if (!snapshot || snapshot.deleted) return null;
    return this.snapshotValue(snapshot).toLocaleString("zh-CN");
  }

  /** 每个文件夹（含各级祖先）内所有已索引文档的字数合集。 */
  private folderSums(): Map<string, number> {
    const sums = new Map<string, number>();
    for (const snapshot of this.runtime.fileIndex.listCurrent()) {
      if (this.runtime.isDataPath(snapshot.path)) continue;
      const value = this.snapshotValue(snapshot);
      const parts = snapshot.path.split("/");
      for (let i = 1; i < parts.length; i += 1) {
        const folder = parts.slice(0, i).join("/");
        sums.set(folder, (sums.get(folder) ?? 0) + value);
      }
    }
    return sums;
  }

  private snapshotValue(snapshot: { creative: number; bodyCharacters: number }): number {
    return this.settings.countMode === "body-characters" ? snapshot.bodyCharacters : snapshot.creative;
  }

  private normalizeFolderPath(path: string): string {
    return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }
}
