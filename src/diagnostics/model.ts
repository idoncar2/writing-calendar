export type DiagnosticDataFolderStatus = "ready" | "created" | "missing";

export type DiagnosticCountMode = "creative" | "body-characters";

export interface DiagnosticFileSnapshot {
  fileId: string;
  path: string;
  creative: number;
  bodyCharacters: number;
  mtime: number;
}

export interface DiagnosticBaseline {
  formatVersion: 1;
  createdAt: number;
  files: DiagnosticFileSnapshot[];
}

export type DiagnosticFileChangeKind = "decreased" | "deleted" | "added" | "moved";

export interface DiagnosticFileChange {
  kind: DiagnosticFileChangeKind;
  fileId: string;
  path: string;
  previousPath?: string;
  previousValue?: number;
  currentValue?: number;
  delta?: number;
}

export interface DiagnosticComparison {
  hasBaseline: boolean;
  currentFileCount: number;
  baselineFileCount: number | null;
  currentTotal: number;
  baselineTotal: number | null;
  decreasedCount: number;
  deletedCount: number;
  addedCount: number;
  movedCount: number;
  changes: DiagnosticFileChange[];
}

export interface DiagnosticJsonlWarning {
  path: string;
  line?: number;
  message: string;
}

export interface DiagnosticDeviceMetadata {
  deviceId: string;
  userAgent?: string;
}

export interface DiagnosticDeviceEvent {
  deviceId: string;
  timestamp: string;
}

export interface DiagnosticLedgerInput {
  fileCount: number;
  eventCount: number;
  rawEventCount: number;
  duplicateEventIds: readonly string[];
  warnings: readonly DiagnosticJsonlWarning[];
  deviceEvents: readonly DiagnosticDeviceEvent[];
}

export interface DiagnosticFileIndexInput {
  healthy: boolean;
  issues: readonly string[];
  currentFileCount: number;
  deletedFileCount: number;
  aliasedFileCount: number;
}

export interface DataDiagnosticInput {
  now: Date;
  dataFolder: {
    path: string;
    status: DiagnosticDataFolderStatus;
    paused: boolean;
  };
  lastReadAt: string | null;
  currentDevice: {
    deviceId: string;
    userAgent?: string;
  };
  ledger: DiagnosticLedgerInput;
  devices: readonly DiagnosticDeviceMetadata[];
  fileIndex: DiagnosticFileIndexInput;
  currentFiles?: readonly DiagnosticFileSnapshot[];
  baseline?: DiagnosticBaseline | null;
  countMode?: DiagnosticCountMode;
}

export interface DiagnosticDevice {
  deviceId: string;
  label: string;
  lastEventAt?: string;
  daysSinceLastEvent?: number;
}

export interface DataDiagnosticSnapshot {
  status: "ok" | "warning" | "error";
  checkedAt: string;
  dataFolder: DataDiagnosticInput["dataFolder"];
  lastReadAt: string | null;
  currentDevice: DiagnosticDevice;
  deviceCount: number;
  ledger: {
    fileCount: number;
    eventCount: number;
    rawEventCount: number;
    duplicateEventIds: string[];
    warnings: DiagnosticJsonlWarning[];
  };
  fileIndex: {
    healthy: boolean;
    issues: string[];
    currentFileCount: number;
    deletedFileCount: number;
    aliasedFileCount: number;
  };
  deletedFileCount: number;
  aliasedFileCount: number;
  staleDevices: DiagnosticDevice[];
  baseline: {
    createdAt: number;
    fileCount: number;
  } | null;
  comparison: DiagnosticComparison;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const STALE_DEVICE_DAYS = 3;

export function deviceLabelForUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return "设备";
  if (/Android|iPhone|iPad|Mobile/i.test(userAgent)) return "手机";
  if (/Windows|Macintosh|Linux|X11/i.test(userAgent)) return "电脑";
  return "设备";
}

function latestEventByDevice(events: readonly DiagnosticDeviceEvent[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const event of events) {
    const timestamp = new Date(event.timestamp).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const previous = latest.get(event.deviceId);
    if (!previous || timestamp > new Date(previous).getTime()) latest.set(event.deviceId, event.timestamp);
  }
  return latest;
}

function valueForMode(file: DiagnosticFileSnapshot, countMode: DiagnosticCountMode): number {
  return countMode === "body-characters" ? file.bodyCharacters : file.creative;
}

function emptyComparison(currentFiles: readonly DiagnosticFileSnapshot[], countMode: DiagnosticCountMode): DiagnosticComparison {
  return {
    hasBaseline: false,
    currentFileCount: currentFiles.length,
    baselineFileCount: null,
    currentTotal: currentFiles.reduce((total, file) => total + valueForMode(file, countMode), 0),
    baselineTotal: null,
    decreasedCount: 0,
    deletedCount: 0,
    addedCount: 0,
    movedCount: 0,
    changes: [],
  };
}

const CHANGE_ORDER: Record<DiagnosticFileChangeKind, number> = {
  decreased: 0,
  deleted: 1,
  added: 2,
  moved: 3,
};

export function buildDiagnosticComparison(
  baseline: DiagnosticBaseline | null,
  currentFiles: readonly DiagnosticFileSnapshot[],
  countMode: DiagnosticCountMode = "creative",
): DiagnosticComparison {
  if (!baseline) return emptyComparison(currentFiles, countMode);

  const previousById = new Map(baseline.files.map((file) => [file.fileId, file]));
  const currentById = new Map(currentFiles.map((file) => [file.fileId, file]));
  const changes: DiagnosticFileChange[] = [];

  for (const previous of baseline.files) {
    if (currentById.has(previous.fileId)) continue;
    changes.push({
      kind: "deleted",
      fileId: previous.fileId,
      path: previous.path,
      previousValue: valueForMode(previous, countMode),
    });
  }

  for (const current of currentFiles) {
    const previous = previousById.get(current.fileId);
    if (!previous) {
      changes.push({
        kind: "added",
        fileId: current.fileId,
        path: current.path,
        currentValue: valueForMode(current, countMode),
      });
      continue;
    }

    if (previous.path !== current.path) {
      changes.push({
        kind: "moved",
        fileId: current.fileId,
        path: current.path,
        previousPath: previous.path,
      });
    }

    const previousValue = valueForMode(previous, countMode);
    const currentValue = valueForMode(current, countMode);
    if (currentValue < previousValue) {
      changes.push({
        kind: "decreased",
        fileId: current.fileId,
        path: current.path,
        previousValue,
        currentValue,
        delta: currentValue - previousValue,
      });
    }
  }

  changes.sort((left, right) => CHANGE_ORDER[left.kind] - CHANGE_ORDER[right.kind] || left.path.localeCompare(right.path));
  return {
    hasBaseline: true,
    currentFileCount: currentFiles.length,
    baselineFileCount: baseline.files.length,
    currentTotal: currentFiles.reduce((total, file) => total + valueForMode(file, countMode), 0),
    baselineTotal: baseline.files.reduce((total, file) => total + valueForMode(file, countMode), 0),
    decreasedCount: changes.filter((change) => change.kind === "decreased").length,
    deletedCount: changes.filter((change) => change.kind === "deleted").length,
    addedCount: changes.filter((change) => change.kind === "added").length,
    movedCount: changes.filter((change) => change.kind === "moved").length,
    changes,
  };
}

function reportDateTime(value: string | number | null): string {
  if (value === null) return "暂无";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN");
}

function reportNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

export function formatDiagnosticReport(snapshot: DataDiagnosticSnapshot): string {
  const comparison = snapshot.comparison;
  const lines = [
    "Writing Calendar 数据诊断",
    "",
    `检查时间：${reportDateTime(snapshot.checkedAt)}`,
    `基线时间：${snapshot.baseline ? reportDateTime(snapshot.baseline.createdAt) : "暂无"}`,
    `当前文件：${reportNumber(comparison.currentFileCount)}`,
    `基线文件：${comparison.baselineFileCount === null ? "暂无" : reportNumber(comparison.baselineFileCount)}`,
    `当前字数：${reportNumber(comparison.currentTotal)}`,
    `字数减少：${reportNumber(comparison.decreasedCount)}`,
    `文件消失：${reportNumber(comparison.deletedCount)}`,
    `新增：${reportNumber(comparison.addedCount)}`,
    `改名/移动：${reportNumber(comparison.movedCount)}`,
  ];

  if (!comparison.hasBaseline) {
    lines.push("", "暂无诊断基线", "建立基线后，以后的检查可以发现文件和字数变化。");
    return lines.join("\n");
  }
  if (comparison.changes.length === 0) {
    lines.push("", "未发现异常变化");
    return lines.join("\n");
  }

  lines.push("", "变化详情");
  for (const change of comparison.changes) {
    if (change.kind === "decreased") {
      lines.push(`${change.path}\n${reportNumber(change.previousValue ?? 0)} → ${reportNumber(change.currentValue ?? 0)}\n变化：${reportNumber(change.delta ?? 0)}`);
    } else if (change.kind === "deleted") {
      lines.push(`${change.path}\n文件已消失\n上次：${reportNumber(change.previousValue ?? 0)}`);
    } else if (change.kind === "added") {
      lines.push(`${change.path}\n新增文件\n${reportNumber(change.currentValue ?? 0)} 字`);
    } else {
      lines.push(`${change.previousPath ?? "未知路径"}\n→ ${change.path}\n已移动`);
    }
  }
  return lines.join("\n");
}

export function buildDataDiagnosticSnapshot(input: DataDiagnosticInput): DataDiagnosticSnapshot {
  const comparison = buildDiagnosticComparison(input.baseline ?? null, input.currentFiles ?? [], input.countMode);
  const metadata = new Map(input.devices.map((device) => [device.deviceId, device]));
  const latestEvents = latestEventByDevice(input.ledger.deviceEvents);
  const deviceIds = new Set<string>([
    input.currentDevice.deviceId,
    ...input.devices.map((device) => device.deviceId),
    ...input.ledger.deviceEvents.map((event) => event.deviceId),
  ]);
  const currentDevice: DiagnosticDevice = {
    deviceId: input.currentDevice.deviceId,
    label: deviceLabelForUserAgent(metadata.get(input.currentDevice.deviceId)?.userAgent ?? input.currentDevice.userAgent),
    ...(latestEvents.has(input.currentDevice.deviceId) ? { lastEventAt: latestEvents.get(input.currentDevice.deviceId) } : {}),
  };
  const staleDevices: DiagnosticDevice[] = [];
  for (const deviceId of deviceIds) {
    if (deviceId === input.currentDevice.deviceId) continue;
    const lastEventAt = latestEvents.get(deviceId);
    if (!lastEventAt || input.dataFolder.status === "missing" || input.dataFolder.paused) continue;
    const elapsed = input.now.getTime() - new Date(lastEventAt).getTime();
    if (elapsed <= STALE_DEVICE_DAYS * DAY_MS) continue;
    staleDevices.push({
      deviceId,
      label: deviceLabelForUserAgent(metadata.get(deviceId)?.userAgent),
      lastEventAt,
      daysSinceLastEvent: Math.floor(elapsed / DAY_MS),
    });
  }
  staleDevices.sort((left, right) => (right.daysSinceLastEvent ?? 0) - (left.daysSinceLastEvent ?? 0));

  const hasIntegrityError = input.dataFolder.status === "missing"
    || input.dataFolder.paused
    || input.ledger.duplicateEventIds.length > 0
    || input.ledger.warnings.length > 0
    || !input.fileIndex.healthy;
  const hasReminder = input.lastReadAt === null
    || input.fileIndex.deletedFileCount > 0
    || input.fileIndex.aliasedFileCount > 0
    || staleDevices.length > 0
    || comparison.decreasedCount > 0
    || comparison.deletedCount > 0;

  return {
    status: hasIntegrityError ? "error" : hasReminder ? "warning" : "ok",
    checkedAt: input.now.toISOString(),
    dataFolder: { ...input.dataFolder },
    lastReadAt: input.lastReadAt,
    currentDevice,
    deviceCount: deviceIds.size,
    ledger: {
      fileCount: input.ledger.fileCount,
      eventCount: input.ledger.eventCount,
      rawEventCount: input.ledger.rawEventCount,
      duplicateEventIds: [...input.ledger.duplicateEventIds],
      warnings: input.ledger.warnings.map((warning) => ({ ...warning })),
    },
    fileIndex: {
      healthy: input.fileIndex.healthy,
      issues: [...input.fileIndex.issues],
      currentFileCount: input.fileIndex.currentFileCount,
      deletedFileCount: input.fileIndex.deletedFileCount,
      aliasedFileCount: input.fileIndex.aliasedFileCount,
    },
    deletedFileCount: input.fileIndex.deletedFileCount,
    aliasedFileCount: input.fileIndex.aliasedFileCount,
    staleDevices,
    baseline: input.baseline
      ? { createdAt: input.baseline.createdAt, fileCount: input.baseline.files.length }
      : null,
    comparison,
  };
}
