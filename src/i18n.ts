export type UiLanguage = "auto" | "zh-CN" | "en";

let languagePreference: UiLanguage = "auto";

const EN: Record<string, string> = {
  "写作日历": "Writing Calendar",
  "Writing Calendar 数据诊断": "Writing Calendar Data Diagnostics",
  "文件已消失": "File missing",
  "已移动": "Moved",
  "未知路径": "Unknown path",
  "界面语言": "Interface language",
  "默认跟随 Obsidian 的界面语言，也可以手动选择。": "Follow Obsidian's interface language by default, or choose a language manually.",
  "自动（跟随 Obsidian）": "Auto (follow Obsidian)",
  "简体中文": "Simplified Chinese",
  "插件的启用和停用由 Obsidian 的第三方插件页面统一管理；这里仅设置统计口径、颜色、侧栏显示与写作项目。": "Enable or disable the plugin from Obsidian's Community plugins page. This page only configures counting, colors, sidebar display, and writing projects.",
  "统计口径": "Counting",
  "将粘贴计入手动输入": "Count pasted text as manual input",
  "默认关闭。无论是否开启，粘贴始终单独保存，并始终计入增量。": "Off by default. Pasted text is always stored separately and always counts toward added text.",
  "统计颜色": "Statistics color",
  "默认跟随 Obsidian 重点色，也可以使用独立颜色。": "Follow Obsidian's accent color by default, or use a custom color.",
  "跟随 Obsidian": "Follow Obsidian",
  "自定义": "Custom",
  "自定义统计色": "Custom statistics color",
  "状态栏统计": "Status bar statistics",
  "默认关闭。开启后显示今天的手动输入和净增。": "Off by default. When enabled, the status bar shows today's manual input and net change.",
  "文件列表显示字数": "Show word counts in file explorer",
  "在左侧文件列表的每个文件名右侧显示当前字数（跟随统计口径的创作字数/正文字符）。": "Show the current count beside each file in the file explorer, using the selected counting mode.",
  "文件夹显示字数合集": "Show folder totals",
  "在文件夹名右侧显示内部所有文档（含子文件夹）的字数合集；需先开启「文件列表显示字数」。": "Show the total count of all documents inside each folder, including subfolders. Requires file explorer counts.",
  "统计工作区": "Statistics Workspace",
  "这是写作日历自己的默认统计范围，可与全部写作或命名项目切换。它可以按文件夹、标签、扩展名、文件名、Properties 和高级条件组合筛选；规则会作为普通仓库数据同步，不读取 Layout。": "This is Writing Calendar's default statistics scope. Switch between All Writing and named projects, and filter by folders, tags, extensions, file names, Properties, or advanced conditions. Rules sync as normal vault data and do not read Layout.",
  "全部写作": "All Writing",
  "当前统计范围": "Current statistics scope",
  "小日历、统计工作台、写作目标和状态栏共享这个范围。": "The sidebar calendar, statistics workbench, writing goals, and status bar share this scope.",
  "编辑工作区范围": "Edit workspace scope",
  "基础条件之间取交集；也可在编辑器中填写 AND / OR / NOT 高级筛选。": "Basic conditions are combined as an intersection. You can also use AND / OR / NOT in the advanced filter.",
  "编辑工作区": "Edit workspace",
  "侧栏": "Sidebar",
  "侧栏只保留小日历与一行摘要；范围由上方“统计工作区”和下方“写作项目”独立维护。它不会读取或跟随 Chinese Writing Layout 的自动套用规则。": "The sidebar keeps only the compact calendar and one summary line. Its scope is managed independently by Statistics Workspace and Writing Projects, and does not follow Chinese Writing Layout rules.",
  "侧栏统计指标": "Sidebar metric",
  "侧栏日历与摘要使用的指标。": "Metric used by the sidebar calendar and summary.",
  "侧栏计数口径": "Sidebar counting mode",
  "字数统计口径：创作字数或正文字符数。": "Choose creative word count or body character count.",
  "日历显示方式": "Calendar display",
  "活跃日期以哪种方式表达；精确数据始终可以通过鼠标悬浮或键盘聚焦查看。": "Choose how active dates are shown. Exact values remain available by hover or keyboard focus.",
  "只显示三星期": "Show only three weeks",
  "小日历只显示上周、本周、下周三行，左右箭头改为按周切换。": "Show only last week, this week, and next week. Navigation arrows move by week.",
  "侧栏摘要内容": "Sidebar summary",
  "显示本月字数": "Show monthly count",
  "显示今日字数": "Show today's count",
  "显示连续写作": "Show writing streak",
  "显示每日目标": "Show daily goal",
  "在摘要下方显示 今日字数/每日目标 的完成度。": "Show today's progress toward the daily goal below the summary.",
  "写作目标": "Writing Goals",
  "在小日历最下侧显示每日目标，在新版工作台的「写作目标」模块显示每日 / 周 / 月目标与近 14 天回顾；目标范围跟随当前统计范围。": "Show the daily goal below the sidebar calendar, and daily / weekly / monthly goals plus recent history in the Writing Goals module. Goals follow the current statistics scope.",
  "每日目标字数": "Daily word goal",
  "每天要达到的目标字数；设为 0 表示不启用。": "Daily target. Set to 0 to disable.",
  "每周目标字数": "Weekly word goal",
  "本周（周一起）累计要达到的目标字数；设为 0 表示不启用。": "Weekly target, counted from Monday. Set to 0 to disable.",
  "每月目标字数": "Monthly word goal",
  "本月（自然月）累计要达到的目标字数；设为 0 表示不启用。": "Monthly target for the calendar month. Set to 0 to disable.",
  "目标指标": "Goal metric",
  "计入目标的字数口径：增量 / 净增 / 手动输入 / 删除量。": "Metric used for goals: added / net / manual input / deleted.",
  "专注计时": "Focus Timer",
  "专注计时器": "Focus Timer",
  "可选的单次专注计时。关闭时不显示计时界面，也不会判断空闲或计算写字速度。": "Optional focus sessions. When disabled, the timer is hidden and idle time or typing speed are not calculated.",
  "启用番茄钟": "Enable Pomodoro timer",
  "开启后才显示专注计时，并记录主动开始的专注 Session。": "Show the focus timer and record sessions only when you start them deliberately.",
  "显示位置": "Display location",
  "日历下方": "Below calendar",
  "独立侧栏": "Separate sidebar",
  "默认专注时长": "Default focus duration",
  "默认休息时长": "Default break duration",
  "记录不足 1 分钟的专注": "Record focus sessions under 1 minute",
  "默认关闭。关闭时，手动结束且不足 1 分钟的专注不会保存，并会显示提示。": "Off by default. When disabled, manually ended sessions shorter than 1 minute are not saved.",
  "实际写作窗口": "Active writing window",
  "每次编辑后保持为实际写作的时间；超过该时间没有新的编辑，就计入空闲时间。": "Time after each edit that remains counted as active writing. Longer gaps are counted as idle time.",
  "实际写作窗口（秒）": "Active writing window (seconds)",
  "请输入不小于 30 秒的时长。": "Enter at least 30 seconds.",
  "同步数据": "Synced Data",
  "数据目录": "Data folder",
  "这是普通仓库目录，可由 Remotely Save 等文件同步工具同步；插件不会主动触发云同步。": "This is a normal vault folder that can be synced by tools such as Remotely Save. The plugin does not trigger cloud sync itself.",
  "数据诊断": "Data Diagnostics",
  "查看账本读取、同步完整性、设备状态和当前文件索引。诊断不会修改历史账本。": "Inspect ledger loading, sync integrity, device status, and the current file index. Diagnostics never modify historical ledgers.",
  "打开数据诊断": "Open Data Diagnostics",
  "数据目录缺失": "Data folder missing",
  "如果这是已有设备，请先完成远端同步；只有确认没有远端目录时才新建。": "If this is an existing device, finish remote sync first. Create a new folder only if no remote data folder exists.",
  "确认新建目录": "Create folder",
  "写作日历数据目录已建立": "Writing Calendar data folder created",
  "重新读取同步数据": "Reload synced data",
  "合并所有设备账本，按事件 ID 去重；不会修改其他设备文件。": "Merge ledgers from all devices and deduplicate by event ID. Other device files are not modified.",
  "重新读取": "Reload",
  "同步账本已重新读取": "Synced ledgers reloaded",
  "重新扫描当前文件": "Rescan current files",
  "只校准当前总字数、路径和项目归属，不补造历史活动。": "Recalculate current totals, paths, and project membership without inventing historical activity.",
  "重新扫描": "Rescan",
  "扫描中…": "Scanning…",
  "当前文件统计已校准": "Current file statistics recalibrated",
  "写作项目": "Writing Projects",
  "项目规则完全由写作日历维护，可按文件夹、标签、扩展名、文件名、Properties 或高级筛选统计。它不会读取排版插件规则；同一文件可以同时属于多个项目。规则变更后会重新归集启用以来的历史。": "Writing Calendar manages project rules independently. Filter by folders, tags, extensions, file names, Properties, or advanced filters. A file may belong to multiple projects, and rule changes regroup history since activation.",
  "管理项目": "Manage projects",
  "新建项目": "New project",
  "编辑": "Edit",
  "删除项目": "Delete project",
  "项目已移入可恢复的版本历史": "Project moved to recoverable version history",
  "需要处理的同步冲突": "Sync conflicts to resolve",
  "选择一个版本后会写入合并记录，其他版本仍保留在历史中。": "Choose one version to write a merge record. Other versions remain in history.",
  "项目冲突已合并": "Project conflict merged",
  "全部文件夹": "All folders",
  "打开写作日历": "Open Writing Calendar",
  "打开统计工作台": "Open Statistics Workbench",
  "打开专注计时": "Open Focus Timer",
  "重新扫描当前文件统计": "Rescan current file statistics",
  "请先在写作日历设置中启用番茄钟。": "Enable the Pomodoro timer in Writing Calendar settings first.",
  "专注不足 1 分钟，本次不记录": "Focus session was under 1 minute and was not recorded.",
  "专注记录保存失败，请检查数据目录。": "Failed to save focus session. Check the data folder.",
  "上一周": "Previous week",
  "下一周": "Next week",
  "上个月": "Previous month",
  "下个月": "Next month",
  "重新扫描并重新读取同步数据": "Rescan and reload synced data",
  "已重新读取同步数据并重新扫描文件": "Synced data reloaded and files rescanned",
  "详细统计": "Detailed statistics",
  "活动记录已暂停，请在设置中检查数据目录。": "Activity recording is paused. Check the data folder in settings.",
  "三星期视图": "Three-week view",
  "本月": "This month",
  "今日": "Today",
  "手动输入": "Manual input",
  "手动净增": "Manual net",
  "增量": "Added",
  "删除量": "Deleted",
  "删除": "Deleted",
  "净增": "Net",
  "创作字数": "Creative word count",
  "正文字符数": "Body characters",
  "正文字符": "Body characters",
  "仅活跃点": "Active dots only",
  "热度底色": "Heatmap color",
  "显示小数字": "Show small numbers",
  "过去一年": "Past year",
  "自然年": "Calendar year",
  "本周": "This week",
  "近 30 天": "Last 30 days",
  "本年": "This year",
  "尚未读取": "Not loaded yet",
  "时间未知": "Unknown time",
  "字数减少": "Word count decreased",
  "文件消失": "File missing",
  "新增文件": "New file",
  "改名/移动": "Renamed / moved",
  "只检查统计数据状态，不修改历史账本。": "Inspect statistics data only. Historical ledgers are never modified.",
  "重新检查数据": "Recheck data",
  "检查中…": "Checking…",
  "重新检查": "Recheck",
  "设为当前诊断基线": "Set current diagnostic baseline",
  "设为当前基线": "Set as current baseline",
  "建立当前基线": "Create current baseline",
  "复制诊断报告": "Copy diagnostic report",
  "正在读取同步数据并扫描当前文件…": "Reading synced data and scanning current files…",
  "正在准备数据诊断…": "Preparing data diagnostics…",
  "暂无诊断基线": "No diagnostic baseline",
  "数据读取": "Data loading",
  "缺失或已暂停": "Missing or paused",
  "正常": "Normal",
  "请先完成同步，或在设置中确认新建数据目录。": "Finish sync first, or confirm creation of a new data folder in settings.",
  "最近一次读取": "Last read",
  "当前设备": "Current device",
  "已发现设备": "Detected devices",
  "写作记录": "Writing records",
  "数据完整性": "Data integrity",
  "重复 eventId": "Duplicate eventId",
  "未发现重复 eventId": "No duplicate eventId found",
  "未发现损坏 JSONL": "No corrupted JSONL found",
  "文件索引": "File index",
  "当前文件索引正常": "Current file index is healthy",
  "已删除文件": "Deleted files",
  "当前总字数已移除，历史写作记录仍然保留。": "Current totals are removed, while historical writing records are retained.",
  "历史别名": "Historical aliases",
  "这通常表示文件曾经被改名或移动。": "This usually means the file was renamed or moved.",
  "设备记录": "Device records",
  "需要注意": "Needs attention",
  "当前未发现明显异常。": "No obvious issues found.",
  "基线对比": "Baseline comparison",
  "当前文件": "Current files",
  "当前字数": "Current count",
  "诊断基线": "Diagnostic baseline",
  "建立基线后，以后的检查可以发现文件和字数变化。": "After creating a baseline, future checks can detect file and count changes.",
  "基线文件": "Baseline files",
  "变化详情": "Change details",
  "检查结果": "Check result",
  "未发现异常变化": "No abnormal changes found",
  "数据诊断已完成": "Data diagnostics complete",
  "数据诊断失败，请稍后重试": "Data diagnostics failed. Try again later.",
  "已将当前状态设为诊断基线": "Current state set as diagnostic baseline",
  "已设为当前基线": "Current baseline saved",
  "保存诊断基线失败，请稍后重试": "Failed to save diagnostic baseline. Try again later.",
  "当前环境不支持剪贴板": "Clipboard is not supported in this environment.",
  "诊断报告已复制": "Diagnostic report copied",
  "复制诊断报告失败，请稍后重试": "Failed to copy diagnostic report. Try again later.",
  "实际写作": "Active writing",
  "根据文字编辑活动估算": "Estimated from editing activity",
  "空闲时间": "Idle time",
  "专注期间停留在 Obsidian，但较长时间没有编辑": "Time spent in Obsidian during focus with no edits for a longer period",
  "离开时间": "Away time",
  "切出 Obsidian 或窗口不可见": "Obsidian was not active or the window was hidden",
  "倒计时完成": "Timer completed",
  "手动结束": "Ended manually",
  "插件关闭时保存": "Saved when plugin closed",
  "关闭番茄钟时保存": "Saved when Pomodoro timer was disabled",
  "从上次工作区恢复": "Recovered from previous workspace",
  "已记录": "Recorded",
  "输入": "Input",
  "本次专注已记录": "Focus session recorded",
  "开始休息": "Start break",
  "再次开始": "Start again",
  "休息中": "On break",
  "跳过休息并开始专注": "Skip break and start focus",
  "专注中": "Focusing",
  "已暂停": "Paused",
  "开始后统计输入、实际写作和空闲时间": "After starting, input, active writing, and idle time are tracked",
  "开始专注": "Start focus",
  "继续": "Resume",
  "结束": "End",
  "暂停": "Pause",
  "编辑统计工作区": "Edit Statistics Workspace",
  "编辑写作项目": "Edit Writing Project",
  "新建写作项目": "New Writing Project",
  "范围完全由写作日历维护，不读取排版插件规则。用条件卡片选择文件夹、标签、扩展名、文件名或 Properties；每条可选择 AND / OR，选择“排除”即为 NOT。": "Writing Calendar manages this scope independently and does not read layout-plugin rules. Use condition cards for folders, tags, extensions, file names, or Properties. Each condition can use AND / OR; choosing Exclude means NOT.",
  "项目名称": "Project name",
  "例如：示例项目、短篇集或随笔。": "For example: Novel, Short Stories, or Essays.",
  "统计条件": "Statistics conditions",
  "条件按显示顺序计算。文件夹、标签、扩展名和 Properties 字段会从当前仓库提供选项，也可以直接输入。": "Conditions are evaluated in display order. Folder, tag, extension, and Properties values are suggested from the current vault, and can also be typed directly.",
  "高级筛选": "Advanced filter",
  "高级筛选（可选）": "Advanced filter (optional)",
  "用于补充更复杂的括号和 NOT；例如 folder(\"正文\") AND tag(\"#小说\")。无需安装 Dataview。高级表达式会与上方条件同时满足。": "Use this for more complex parentheses and NOT expressions, for example folder(\"Draft\") AND tag(\"#novel\"). Dataview is not required. The advanced expression is combined with the conditions above.",
  "取消": "Cancel",
  "保存工作区": "Save workspace",
  "保存项目": "Save project",
  "请修正以下内容：": "Fix the following:",
  "正在保存…": "Saving…",
  "统计工作区已保存": "Statistics Workspace saved",
  "写作项目已保存": "Writing Project saved",
  "文件夹": "Folder",
  "标签": "Tag",
  "扩展名": "Extension",
  "文件名": "File name",
  "等于": "Equals",
  "不等于": "Does not equal",
  "包含": "Contains",
  "存在": "Exists",
  "不存在": "Missing",
  "尚未添加条件；保存后会统计全部写作文件。": "No conditions yet. Saving now will include all writing files.",
  "添加条件": "Add condition",
  "添加条件组": "Add condition group",
  "与上一条的关系": "Relation to previous condition",
  "并且（AND）": "And (AND)",
  "或者（OR）": "Or (OR)",
  "匹配方式": "Match mode",
  "计入": "Include",
  "排除（NOT）": "Exclude (NOT)",
  "上移条件": "Move condition up",
  "下移条件": "Move condition down",
  "删除条件": "Delete condition",
  "上移条件组": "Move condition group up",
  "下移条件组": "Move condition group down",
  "删除条件组": "Delete condition group",
  "条件类型": "Condition type",
  "文件名规则": "File name pattern",
  "例如：正文/草稿": "For example: Draft/Chapters",
  "例如：#小说": "For example: #novel",
  "例如：md": "For example: md",
  "例如：章节-*.md": "For example: chapter-*.md",
  "Properties 字段": "Properties field",
  "例如：status": "For example: status",
  "运算符": "Operator",
  "值": "Value",
  "字符串、数字、true / false / null 或数组": "String, number, true / false / null, or array",
  "Properties 运算符": "Properties operator",
  "Properties 值": "Properties value",
  "条件组": "Condition group",
  "向组内添加条件": "Add condition to group",
  "月历": "Calendar",
  "当天详情": "Day Details",
  "写作趋势": "Writing Trend",
  "热力图": "Heatmap",
  "最近文档": "Recent Documents",
  "统计工作台": "Statistics Workbench",
  "表达式模式（可选）": "Expression mode (optional)",
  "保留筛选": "Keep filter",
  "清除筛选": "Clear filter",
  "应用筛选": "Apply filter",
  "请至少添加一个条件，或填写高级表达式。": "Add at least one condition or enter an advanced expression.",
  "临时筛选": "Temporary filter",
  "专注统计": "Focus Statistics",
  "写作统计": "Writing Statistics",
  "统计指标": "Metric",
  "只统计主动开启番茄钟后的专注记录": "Only focus sessions started deliberately with the Pomodoro timer are counted",
  "真实数据驱动的长期写作统计": "Long-term writing statistics based on recorded data",
  "今天": "Today",
  "最近专注": "Recent Focus Sessions",
  "还没有专注记录。开始一次番茄钟后会显示在这里。": "No focus sessions yet. Start a Pomodoro session to see it here.",
  "速度样本不足": "Not enough data for speed",
  "今日概览": "Today's Overview",
  "今日净增": "Today's Net",
  "连续写作": "Writing Streak",
  "涉及文件": "Files",
  "当日无文件活动": "No file activity that day",
  "少": "Less",
  "多": "More",
  "每日写作热力图": "Daily writing heatmap",
  "颜色越深表示数值越高": "Darker color means a higher value",
  "暂无写作活动记录": "No writing activity yet",
  "暂未设置写作目标，可在设置中配置每日 / 周 / 月目标": "No writing goals set. Configure daily / weekly / monthly goals in settings.",
  "今日目标": "Today's Goal",
  "今日还没有文档对目标有贡献": "No documents have contributed to today's goal yet",
  "累计写作目标": "Cumulative Writing Goals",
  "本周目标": "Weekly Goal",
  "本月目标": "Monthly Goal",
  "每日目标达成": "Daily Goal Completion",
  "近一周回顾": "Past Week",
  "已达成": "Achieved",
  "未达标": "Not met",
  "本月打卡": "Monthly Check-in",
  "打卡图例": "Check-in legend",
  "本月每日目标打卡": "Monthly daily-goal check-in",
  "字数活动来自本地账本；专注时间只在主动开启番茄钟时记录。": "Word-count activity comes from the local ledger; focus time is recorded only when the Pomodoro timer is started deliberately.",
  "临时筛选已生效 · 替代当前范围": "Temporary filter active · replacing current scope",
  "应用后会完全替代设置中选择的统计范围；清除后恢复默认范围。未勾选“保留筛选”时，关闭工作台会自动清除。": "When applied, this completely replaces the scope selected in settings. Clearing restores the default scope. If Keep filter is off, closing the workbench clears it automatically.",
  "暂无": "None",
  "未知": "Unknown",
  "设备": "Device",
  "手机": "Mobile",
  "电脑": "Computer",
  "未命名项目": "Untitled project"
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
const WEEKDAYS: Record<string, string> = { 日: "Sun", 一: "Mon", 二: "Tue", 三: "Wed", 四: "Thu", 五: "Fri", 六: "Sat" };

function autoLanguage(): "zh-CN" | "en" {
  if (typeof window === "undefined") return "zh-CN";
  const globalMoment = (window as typeof window & { moment?: { locale?: () => string } }).moment;
  const locale = globalMoment?.locale?.() || document.documentElement.lang || "";
  if (!locale) return "zh-CN";
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function setUiLanguage(language: UiLanguage): void {
  languagePreference = language;
}

export function getUiLanguage(): "zh-CN" | "en" {
  return languagePreference === "auto" ? autoLanguage() : languagePreference;
}

function monthName(month: string): string {
  const index = Number(month) - 1;
  return MONTHS[index] ?? month;
}

function translateDynamic(input: string): string {
  let match: RegExpMatchArray | null;

  match = input.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/u);
  if (match) return `${monthName(match[2])} ${Number(match[3])}, ${match[1]}`;

  match = input.match(/^(\d{4}) 年 (\d{1,2}) 月$/u);
  if (match) return `${monthName(match[2])} ${match[1]}`;

  match = input.match(/^(\d{4})年(\d{1,2})月$/u);
  if (match) return `${monthName(match[2])} ${match[1]}`;

  match = input.match(/^(\d{1,2}) 月$/u);
  if (match) return monthName(match[1]);

  match = input.match(/^(\d{1,2})月$/u);
  if (match) return monthName(match[1]);

  match = input.match(/^周([日一二三四五六])$/u);
  if (match) return WEEKDAYS[match[1]] ?? match[1];

  if (input.includes("；")) {
    return input.split("；").map((part) => translateEnglish(part.trim())).join("; ");
  }
  if (input.includes(" · ")) {
    return input.split(" · ").map((part) => translateEnglish(part.trim())).join(" · ");
  }

  match = input.match(/^(\d+) 小时 (\d+) 分钟$/u);
  if (match) return `${match[1]} hr ${match[2]} min`;
  match = input.match(/^(\d+) 小时 (\d+) 分$/u);
  if (match) return `${match[1]} hr ${match[2]} min`;
  match = input.match(/^(\d+) 小时$/u);
  if (match) return `${match[1]} hr`;
  match = input.match(/^(\d+) 分钟$/u);
  if (match) return `${match[1]} min`;
  match = input.match(/^(\d+) 分$/u);
  if (match) return `${match[1]} min`;
  match = input.match(/^(\d+) 秒$/u);
  if (match) return `${match[1]} sec`;

  const metricPatterns: Array<[RegExp, string]> = [
    [/^手动输入 (.+) 字$/u, "Manual input $1 words"],
    [/^手动净增 (.+) 字$/u, "Manual net $1 words"],
    [/^增量 (.+) 字$/u, "Added $1 words"],
    [/^删除量 (.+) 字$/u, "Deleted $1 words"],
    [/^净增 (.+) 字$/u, "Net $1 words"],
    [/^输入 (.+) 字$/u, "Input $1 words"],
    [/^输入 (.+)$/u, "Input $1"],
    [/^净增 (.+)$/u, "Net $1"],
    [/^空闲时间 (.+)$/u, "Idle $1"],
    [/^离开时间 (.+)$/u, "Away $1"],
    [/^今日输入 (.+)$/u, "Today input $1"],
    [/^今日 (.+) 字$/u, "Today $1 words"],
    [/^本月 (.+) 字$/u, "This month $1 words"],
    [/^连续 (\d+) 天$/u, "Streak $1 days"],
    [/^每日目标 (.+) \/ (.+)$/u, "Daily goal $1 / $2"],
    [/^主要文件：(.+)$/u, "Main files: $1"],
    [/^当前范围：(.+)$/u, "Current scope: $1"],
    [/^默认跟随：(.+)$/u, "Following: $1"],
    [/^休息剩余 (.+)$/u, "Break remaining $1"],
    [/^专注剩余 (.+)$/u, "Focus remaining $1"],
    [/^默认专注时长 (.+)$/u, "Default focus duration $1"],
    [/^(\d+) 次$/u, "$1 sessions"],
    [/^平均 (.+) 字\/小时$/u, "Average $1 words/hour"],
    [/^活跃 (\d+) 天$/u, "Active $1 days"],
    [/^当前连续 (\d+) 天$/u, "Current streak $1 days"],
    [/^最长 (\d+) 天$/u, "Longest $1 days"],
    [/^指标：(.+)$/u, "Metric: $1"],
    [/^今日字数$/u, "Today's count"],
    [/^今日字数 · (.+)$/u, "Today's count · $1"],
    [/^本周 (.+) 字$/u, "This week $1 words"],
    [/^当前总字数 (.+)$/u, "Current total $1"],
    [/^最近 30 天$/u, "Last 30 days"],
    [/^另有 (\d+) 个文件$/u, "$1 more files"],
    [/^文件不存在：(.+)$/u, "File not found: $1"],
    [/^今日 (.+) \/ 目标 (.+)$/u, "Today $1 / Goal $2"],
    [/^当日 (.+) \/ 目标 (.+)$/u, "Day $1 / Goal $2"],
    [/^达标 (\d+) 天$/u, "Achieved $1 days"],
    [/^(\d+) \/ (\d+) 天$/u, "$1 / $2 days"],
    [/^检查失败：(.+)$/u, "Check failed: $1"],
    [/^检查时间：(.+)$/u, "Checked at: $1"],
    [/^基线时间：(.+)$/u, "Baseline time: $1"],
    [/^当前文件：(.+)$/u, "Current files: $1"],
    [/^基线文件：(.+)$/u, "Baseline files: $1"],
    [/^当前字数：(.+)$/u, "Current count: $1"],
    [/^字数减少：(.+)$/u, "Count decreased: $1"],
    [/^文件消失：(.+)$/u, "Files missing: $1"],
    [/^新增：(.+)$/u, "Added: $1"],
    [/^改名\/移动：(.+)$/u, "Renamed / moved: $1"],
    [/^变化：(.+)$/u, "Change: $1"],
    [/^上次检查：(.+)$/u, "Last checked: $1"],
    [/^诊断基线：(.+)$/u, "Diagnostic baseline: $1"],
    [/^数据目录：(.+)$/u, "Data folder: $1"],
    [/^(.+)设备 (\d+) 天没有新记录$/u, "$1 device has no new records for $2 days"],
    [/^发现 (\d+) 个重复 eventId$/u, "Found $1 duplicate eventIds"],
    [/^(\d+) 条记录无法读取$/u, "$1 records could not be read"],
    [/^发现 (\d+) 个索引问题$/u, "Found $1 index issues"],
    [/^(\d+) 个文件已删除$/u, "$1 files deleted"],
    [/^(\d+) 个文件有历史别名$/u, "$1 files have historical aliases"],
    [/^上次：(.+) 字$/u, "Previous: $1 words"],
    [/^检查完成：(.+)$/u, "Check complete: $1"],
    [/^还有 (.+) 项变化未在页面展开，复制报告可查看全部。$/u, "$1 more changes are hidden on this page. Copy the report to see all of them."],
    [/^保存失败：(.+)$/u, "Save failed: $1"],
    [/^确定删除项目“(.+)”？历史账本不会被删除。$/u, "Delete project “$1”? Historical ledgers will not be deleted."],
    [/^写作日历：已跳过 (\d+) 条损坏的专注记录。$/u, "Writing Calendar: skipped $1 corrupted focus records."],
    [/^条件 (\d+)$/u, "Condition $1"],
    [/^项目 (.+) 有 (\d+) 个并行版本$/u, "Project $1 has $2 parallel versions"],
    [/^采用“(.+)”$/u, "Use “$1”"],
    [/^可视条件：(\d+) 条$/u, "Visual conditions: $1"],
    [/^包含：(.+)$/u, "Include: $1"],
    [/^排除：(.+)$/u, "Exclude: $1"],
    [/^标签：(.+)$/u, "Tags: $1"],
    [/^排除标签：(.+)$/u, "Excluded tags: $1"],
    [/^扩展名：(.+)$/u, "Extensions: $1"],
    [/^高级：(.+)$/u, "Advanced: $1"],
    [/^(\d+) 个文件$/u, "$1 files"],
    [/^(\d+) 个$/u, "$1"],
    [/^(\d+) 条$/u, "$1 records"],
    [/^([+-]?[0-9][0-9,]*) 字$/u, "$1 words"],
    [/^(.+?) ([+-]?[0-9][0-9,]*) 字$/u, "$1 $2 words"],
  ];
  for (const [pattern, replacement] of metricPatterns) {
    if (pattern.test(input)) return input.replace(pattern, replacement);
  }

  match = input.match(/^(.+) → (.+)（变化 (.+)）$/u);
  if (match) return `${match[1]} → ${match[2]} (change ${match[3]})`;

  match = input.match(/^(.+) 当日 (.+) \/ 目标 (.+)，(已达成|未达标)$/u);
  if (match) return `${match[1]}: ${match[2]} / Goal ${match[3]}, ${translateEnglish(match[4])}`;

  return input;
}

function translateEnglish(input: string): string {
  return EN[input] ?? translateDynamic(input);
}

export function t(input: string): string {
  return getUiLanguage() === "en" ? translateEnglish(input) : input;
}

interface AttributeState {
  original: string;
  applied: string;
}

const roots = new Set<HTMLElement>();
const observers = new Map<HTMLElement, MutationObserver>();
const textOriginal = new WeakMap<Text, string>();
const textApplied = new WeakMap<Text, string>();
const attributeStates = new WeakMap<Element, Map<string, AttributeState>>();
const TRANSLATED_ATTRIBUTES = ["aria-label", "title", "placeholder"] as const;

function localizeTextNode(node: Text): void {
  const current = node.nodeValue ?? "";
  const applied = textApplied.get(node);
  if (!textOriginal.has(node) || (applied !== undefined && current !== applied)) {
    textOriginal.set(node, current);
  }
  const original = textOriginal.get(node) ?? current;
  const next = t(original);
  if (current !== next) node.nodeValue = next;
  textApplied.set(node, next);
}

function localizeAttribute(element: Element, name: string): void {
  const current = element.getAttribute(name);
  if (current === null) return;
  let states = attributeStates.get(element);
  if (!states) {
    states = new Map();
    attributeStates.set(element, states);
  }
  const previous = states.get(name);
  if (!previous || current !== previous.applied) {
    states.set(name, { original: current, applied: current });
  }
  const state = states.get(name)!;
  const next = t(state.original);
  if (current !== next) element.setAttribute(name, next);
  state.applied = next;
}

function localizeNode(node: Node): void {
  if (node instanceof Text) {
    localizeTextNode(node);
    return;
  }
  if (!(node instanceof Element)) return;
  for (const name of TRANSLATED_ATTRIBUTES) localizeAttribute(node, name);
  for (const child of Array.from(node.childNodes)) localizeNode(child);
}

export function localizeRoot(root: HTMLElement): void {
  roots.add(root);
  localizeNode(root);
  if (observers.has(root)) return;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        localizeNode(mutation.target);
      } else if (mutation.type === "attributes" && mutation.target instanceof Element && mutation.attributeName) {
        localizeAttribute(mutation.target, mutation.attributeName);
      } else {
        for (const node of Array.from(mutation.addedNodes)) localizeNode(node);
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATED_ATTRIBUTES],
  });
  observers.set(root, observer);
}

export function refreshI18n(): void {
  for (const root of Array.from(roots)) {
    if (!root.isConnected) {
      observers.get(root)?.disconnect();
      observers.delete(root);
      roots.delete(root);
      continue;
    }
    localizeNode(root);
  }
}

export function disposeI18n(): void {
  for (const observer of observers.values()) observer.disconnect();
  observers.clear();
  roots.clear();
}
