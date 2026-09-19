/**
 * 浅色悬浮提示（挂在 body 上，避免被滚动容器裁剪）。
 *
 * Obsidian 会对带 aria-label / setTooltip 的元素显示原生黑色提示，
 * 统计视图需要浅色风格，因此一律不用 aria-label，改走这里。
 */

let tooltipEl: HTMLElement | undefined;

function ensureTooltip(): HTMLElement {
  let tooltip = tooltipEl;
  if (!tooltip || !tooltip.isConnected) {
    tooltip = document.body.createDiv({ cls: "wc-tooltip" });
    tooltipEl = tooltip;
  }
  return tooltip;
}

/** anchorElement 用于读取 --wc-accent（各视图已通过 applyViewAccent 设置）。 */
export function showLightTooltip(
  anchor: HTMLElement,
  accentSource: HTMLElement,
  lines: readonly string[],
): void {
  const tooltip = ensureTooltip();
  tooltip.empty();
  for (const line of lines) tooltip.createDiv({ cls: "wc-tooltip-line", text: line });
  // 与视图保持一致强调色（自定义颜色时也一致）
  const accent = getComputedStyle(accentSource).getPropertyValue("--wc-accent").trim();
  tooltip.setCssProps({ "--wc-accent": accent });
  tooltip.addClass("is-visible");
  const rect = anchor.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const gap = 8;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  const top = Math.min(Math.max(8, rect.top - height - gap), window.innerHeight - height - 8);
  tooltip.setCssProps({
    "--wc-tooltip-left": `${Math.round(left)}px`,
    "--wc-tooltip-top": `${Math.round(top)}px`,
  });
}

export function hideLightTooltip(): void {
  if (tooltipEl) tooltipEl.removeClass("is-visible");
}

/** 为元素绑定鼠标与键盘聚焦两种触发方式 */
export function bindLightTooltip(
  target: HTMLElement,
  accentSource: HTMLElement,
  lines: () => readonly string[],
): void {
  target.addEventListener("mouseenter", () => showLightTooltip(target, accentSource, lines()));
  target.addEventListener("mouseleave", hideLightTooltip);
  target.addEventListener("focus", () => showLightTooltip(target, accentSource, lines()));
  target.addEventListener("blur", hideLightTooltip);
}
