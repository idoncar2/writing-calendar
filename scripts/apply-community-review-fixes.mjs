import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, content) => fs.writeFileSync(path, content, "utf8");

function replaceOnce(path, from, to) {
  const source = read(path);
  if (!source.includes(from)) {
    throw new Error(`Expected source not found in ${path}: ${from.slice(0, 80)}`);
  }
  write(path, source.replace(from, to));
}

// 1) iOS < 16.4: remove regex lookbehind while keeping the delimiter semantics.
replaceOnce(
  "src/core/counting.ts",
  '  text = text.replace(/(?<!\\w)[*_](?=\\S)|(?<=\\S)[*_](?!\\w)/gu, "");',
  '  text = text.replace(/(^|[^\\w])[*_](?=\\S)/gmu, "$1");\n  text = text.replace(/(\\S)[*_](?!\\w)/gu, "$1");',
);

// 2) Obsidian Platform API instead of navigator.userAgent.
{
  const path = "src/service/runtime.ts";
  let source = read(path);
  source = source.replace(
    'import { App, getAllTags, Notice, TFile } from "obsidian";',
    'import { App, getAllTags, Notice, Platform, TFile } from "obsidian";',
  );
  const marker = "function serializableProperties(value: unknown, depth = 0): Record<string, unknown> {";
  if (!source.includes("function platformLabel(): string")) {
    if (!source.includes(marker)) throw new Error(`Runtime insertion marker missing in ${path}`);
    source = source.replace(
      marker,
      `function platformLabel(): string {\n  if (Platform.isIosApp) return "iOS";\n  if (Platform.isAndroidApp) return "Android";\n  if (Platform.isMacOS) return "macOS";\n  if (Platform.isWin) return "Windows";\n  if (Platform.isLinux) return "Linux";\n  return Platform.isMobile ? "Mobile" : "Desktop";\n}\n\n${marker}`,
    );
  }
  const navigatorCount = (source.match(/navigator\.userAgent/g) ?? []).length;
  if (navigatorCount !== 2) throw new Error(`Expected 2 navigator.userAgent references, found ${navigatorCount}`);
  source = source.replaceAll("navigator.userAgent", "platformLabel()");
  write(path, source);
}

// 3) Settings headings: use Obsidian Setting.setHeading().
{
  const path = "src/settings/tab.ts";
  let source = read(path);
  const pattern = /container\.createEl\("h[234]", \{ text: "([^"]+)" \}\);/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length < 10) throw new Error(`Expected at least 10 direct settings headings, found ${matches.length}`);
  source = source.replace(pattern, (_full, title) => `new Setting(container).setName("${title}").setHeading();`);
  write(path, source);
}

// 4) Tooltip: classes + CSS props instead of direct style assignments.
replaceOnce(
  "src/views/light-tooltip.ts",
  `  if (accent) tooltip.style.setProperty("--wc-accent", accent);\n  else tooltip.style.removeProperty("--wc-accent");\n  tooltip.style.display = "block";`,
  `  tooltip.setCssProps({ "--wc-accent": accent });\n  tooltip.addClass("is-visible");`,
);
replaceOnce(
  "src/views/light-tooltip.ts",
  `  tooltip.style.left = \`\${Math.round(left)}px\`;\n  tooltip.style.top = \`\${Math.round(top)}px\`;`,
  `  tooltip.setCssProps({\n    "--wc-tooltip-left": \`\${Math.round(left)}px\`,\n    "--wc-tooltip-top": \`\${Math.round(top)}px\`,\n  });`,
);
replaceOnce(
  "src/views/light-tooltip.ts",
  `  if (tooltipEl) tooltipEl.style.display = "none";`,
  `  if (tooltipEl) tooltipEl.removeClass("is-visible");`,
);

// 5) Workbench: move static styling to classes and dynamic layout to CSS props.
replaceOnce(
  "src/views/workbench-view.ts",
  `      probe.addClass("wc-view");\n      probe.style.position = "absolute";\n      probe.style.visibility = "hidden";`,
  `      probe.addClass("wc-view", "wc-style-probe");`,
);
replaceOnce(
  "src/views/workbench-view.ts",
  '    months.style.gridTemplateColumns = `repeat(${columnCount}, var(--wc-heat-size, 10px))`;',
  '    months.setCssProps({ "--wc-heat-columns": String(columnCount) });',
);
replaceOnce(
  "src/views/workbench-view.ts",
  '      label.style.gridColumn = `${visualStart + 1} / span ${span}`;\n      label.style.gridRow = "1";',
  '      label.addClass("wc-heatmap-month-label");\n      label.setCssProps({ "--wc-heat-label-column": `${visualStart + 1} / span ${span}` });',
);

// CSS backing for the class/custom-property based styling above.
{
  const path = "styles.css";
  let source = read(path);
  const marker = "/* Community review compatibility helpers */";
  if (!source.includes(marker)) {
    source += `\n\n${marker}\n.wc-style-probe {\n  position: absolute;\n  visibility: hidden;\n  pointer-events: none;\n}\n\n.wc-tooltip {\n  display: none;\n  left: var(--wc-tooltip-left, 0px);\n  top: var(--wc-tooltip-top, 0px);\n}\n\n.wc-tooltip.is-visible {\n  display: block;\n}\n\n.wc-heatmap-months {\n  grid-template-columns: repeat(var(--wc-heat-columns, 1), var(--wc-heat-size, 10px));\n}\n\n.wc-heatmap-month-label {\n  grid-column: var(--wc-heat-label-column);\n  grid-row: 1;\n}\n`;
    write(path, source);
  }
}

// 6) API compatibility: revealLeaf is @since 1.7.2. Bump release so assets match fixed source.
const newVersion = "0.3.12";
const minAppVersion = "1.7.2";

{
  const path = "manifest.json";
  const value = JSON.parse(read(path));
  value.version = newVersion;
  value.minAppVersion = minAppVersion;
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

{
  const path = "package.json";
  const value = JSON.parse(read(path));
  value.version = newVersion;
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

{
  const path = "package-lock.json";
  const value = JSON.parse(read(path));
  value.version = newVersion;
  if (value.packages?.[""]) value.packages[""].version = newVersion;
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

{
  const path = "versions.json";
  const value = JSON.parse(read(path));
  value[newVersion] = minAppVersion;
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

// 7) Keep source-inspection/release tests aligned with the community-compliant code.
replaceOnce(
  "tests/release-readiness.test.ts",
  '    expect(packageJson.version).toBe("0.3.11");',
  `    expect(packageJson.version).toBe("${newVersion}");`,
);
replaceOnce(
  "tests/release-readiness.test.ts",
  '    expect(versions[packageJson.version]).toBe("1.5.0");',
  `    expect(versions[packageJson.version]).toBe("${minAppVersion}");`,
);

{
  const path = "tests/focus-settings-ui.test.ts";
  let source = read(path);
  source = source.replaceAll('text: "专注计时"', 'setName("专注计时").setHeading()');
  source = source.replaceAll('text: "同步数据"', 'setName("同步数据").setHeading()');
  write(path, source);
}

replaceOnce(
  "tests/independent-scope-ui.test.ts",
  'text: "统计工作区"',
  'setName("统计工作区").setHeading()',
);

console.log("Applied Obsidian community review compatibility fixes.");
