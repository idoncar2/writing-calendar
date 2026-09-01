import { stableStringify } from "../ledger/merge";
import type { FocusSessionRecord } from "./types";

type FocusSessionCollection = readonly FocusSessionRecord[];
type FocusSessionInput = FocusSessionCollection | readonly FocusSessionCollection[];

export interface FocusMergeWarning {
  id: string;
  message: string;
}

function flatten(input: FocusSessionInput): FocusSessionRecord[] {
  if (input.length === 0) return [];
  if (Array.isArray(input[0])) {
    return (input as readonly FocusSessionCollection[]).flatMap((sessions) => [...sessions]);
  }
  return [...(input as FocusSessionCollection)];
}

function sortKey(record: FocusSessionRecord): string {
  return [
    record.endTime,
    record.startTime,
    record.localDate,
    record.id,
    record.deviceId,
    record.countMode,
    stableStringify(record),
  ].join("\u0000");
}

function sortSessions(records: FocusSessionCollection): FocusSessionRecord[] {
  return [...records].sort((left, right) => {
    const leftKey = sortKey(left);
    const rightKey = sortKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

/**
 * Merge completed Focus records from every device. Duplicate session IDs are
 * reduced to a deterministic canonical representation so file traversal order
 * cannot change the result.
 */
export function mergeFocusSessions(
  sessions: FocusSessionCollection,
  onWarning?: (warning: FocusMergeWarning) => void,
): FocusSessionRecord[];
export function mergeFocusSessions(
  sessionCollections: readonly FocusSessionCollection[],
  onWarning?: (warning: FocusMergeWarning) => void,
): FocusSessionRecord[];
export function mergeFocusSessions(
  input: FocusSessionInput,
  onWarning?: (warning: FocusMergeWarning) => void,
): FocusSessionRecord[] {
  const byId = new Map<string, { record: FocusSessionRecord; representation: string }>();
  const warnedIds = new Set<string>();

  for (const record of flatten(input)) {
    const representation = stableStringify(record);
    const existing = byId.get(record.id);
    if (!existing) {
      byId.set(record.id, { record, representation });
      continue;
    }
    if (existing.representation === representation) continue;

    if (!warnedIds.has(record.id)) {
      const warning: FocusMergeWarning = {
        id: record.id,
        message: `专注记录 ${record.id} 存在同步冲突：相同 session ID 包含不同内容，已按确定性规则选择一条记录。`,
      };
      warnedIds.add(record.id);
      if (onWarning) onWarning(warning);
      else console.warn(`写作日历：${warning.message}`);
    }
    if (representation < existing.representation) {
      byId.set(record.id, { record, representation });
    }
  }

  return sortSessions([...byId.values()].map(({ record }) => record));
}
