# Writing Calendar

**English** | [简体中文](./README.zh-CN.md)

Writing Calendar is a local-first writing statistics plugin for Obsidian. It records your actual writing activity and presents it through a compact calendar, a statistics workbench, writing goals, focus sessions, and data diagnostics.

Current version: `0.3.13`  
Minimum Obsidian version: `1.7.2`

## Features

- **Sidebar writing calendar** — See writing intensity by day, plus monthly, daily, streak, and goal summaries.
- **Statistics workbench** — Review monthly activity, yearly heatmaps, daily details, file contributions, goals, and focus statistics.
- **Multiple activity metrics** — Manual input, added text, deleted text, and net change.
- **Two counting modes** — Creative word count and body character count.
- **Writing scopes and projects** — Filter by folders, tags, extensions, file names, Properties, and advanced AND / OR / NOT conditions.
- **Writing goals** — Daily, weekly, and monthly goals with recent progress review.
- **Optional focus timer** — Countdown, pause, break, input, net change, active writing, idle, and away time.
- **Multi-device data model** — Each device writes to its own ledger; synced records are merged and deduplicated by stable IDs.
- **Data diagnostics** — Compare the current file statistics with a confirmed baseline to spot missing files, decreases, new files, renames, or moves.
- **Bilingual interface** — Follow Obsidian automatically or choose Simplified Chinese / English manually.

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release, or download the release ZIP.
2. Create `.obsidian/plugins/writing-calendar/` inside your vault.
3. Put the three plugin files in that folder.
4. Restart Obsidian and enable **Writing Calendar** under **Settings → Community plugins**.

The sidebar calendar opens after the plugin is enabled. You can also open the statistics workbench, focus timer, and data diagnostics from the command palette or plugin settings where applicable.

## Counting

Writing Calendar keeps several activity metrics separate:

- **Manual input** — Text committed through keyboard or IME. Whether pasted text is included can be configured.
- **Added** — All newly detected content, including typing and paste.
- **Deleted** — Content removed from the note.
- **Net** — Added minus deleted; this value can be negative.

**Creative word count** counts visible CJK characters, continuous Latin-script words, and numeric runs while excluding YAML, code, and Markdown syntax. **Body characters** provide a broader view of non-whitespace body content.

## Writing scopes and projects

Writing Calendar manages its own statistics workspace and named writing projects. It does not depend on Chinese Writing Layout rules.

Scopes can combine folders, tags, extensions, file names, Properties, and advanced conditions. A file may belong to multiple named projects.

Advanced filters use a lightweight built-in expression syntax and do not require Dataview. For example:

```text
folder("Drafts") AND tag("#novel") AND property("status") != "archived"
```

Supported operators include `AND`, `OR`, `NOT`, and parentheses. Available conditions include `folder()`, `tag()`, `extension()`, `filename()`, and `property()`.

The statistics workbench normally follows the selected scope. Temporary advanced filters can replace that scope for the current workbench session without overwriting the synced project definition.

## Focus timer

The focus timer is optional and disabled by default. When enabled, it can appear below the sidebar calendar or in a separate sidebar view.

During an active session, Writing Calendar estimates active writing and idle time from actual text-edit activity. Time spent outside Obsidian or while the window is hidden is recorded separately as away time.

Manually ended sessions shorter than one minute are not saved by default, though this behavior can be changed in settings. Sessions that reach the end of the countdown are saved automatically.

## Data diagnostics

Data diagnostics are designed as a warning system, not as a file-recovery system.

You can create a confirmed baseline of current file statistics and compare it later against the current vault state. The diagnostics view can highlight:

- files whose current count decreased;
- files that disappeared;
- newly detected files;
- renamed or moved files.

A diagnostic check does not rewrite historical ledgers. If a suspicious content change is found, use Obsidian's own File recovery or your sync provider's version history to inspect and restore the note.

## Data, sync, and privacy

Writing Calendar does not upload note content and does not require an account or network service. Statistics are stored in a normal vault folder, `写作日历数据/` by default:

```text
写作日历数据/
├─ devices/       device information
├─ ledgers/       writing activity ledgers
├─ projects/      statistics workspace and project rules
└─ focus/         completed focus sessions
```

You can sync this folder with the same file-sync solution you already use for the vault. Each device appends its own records, and Writing Calendar merges records that have already arrived locally through sync.

The currently running focus timer remains local to the device and is not handed off between devices.

Do not delete the data folder casually: current file totals can be rescanned, but historical writing activity and completed focus sessions depend on the stored ledgers.

## Limits

- Writing activity starts being recorded after the plugin is enabled; old file timestamps are not converted into invented writing history.
- External file changes without a corresponding local edit transaction may update current totals but are not treated as writing activity for a specific day.
- Writing Calendar does not modify Markdown content or insert private identifiers into notes.
- File synchronization itself is handled by your chosen sync solution; the plugin does not decide whether cloud synchronization has finished.

## License

[MIT License](./LICENSE)
