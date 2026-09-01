import type { ActivityEvent } from "./types";

type EventCollection = readonly ActivityEvent[];
type LedgerCollection = readonly EventCollection[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stable, recursive JSON representation used only for deterministic ties. */
export function stableStringify(value: unknown): string {
  const canonical = (entry: unknown): unknown => {
    if (Array.isArray(entry)) {
      return entry.map(canonical);
    }
    if (isRecord(entry)) {
      return Object.keys(entry)
        .sort()
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = canonical(entry[key]);
          return result;
        }, {});
    }
    return entry;
  };

  return JSON.stringify(canonical(value));
}

function eventSortKey(event: ActivityEvent): string {
  return [
    event.timestamp,
    event.localDate,
    event.eventId,
    event.deviceId,
    event.fileId ?? "",
    event.path,
    stableStringify(event),
  ].join("\u0000");
}

/** Sort without mutating the caller's ledger. */
export function sortEvents(events: EventCollection): ActivityEvent[] {
  return [...events].sort((left, right) => {
    const leftKey = eventSortKey(left);
    const rightKey = eventSortKey(right);
    if (leftKey < rightKey) {
      return -1;
    }
    if (leftKey > rightKey) {
      return 1;
    }
    return 0;
  });
}

/**
 * Deduplicate by the globally stable event ID.
 *
 * A duplicate ID with different bytes is an ambiguous sync conflict. We keep
 * the lexicographically smallest canonical representation, which makes the
 * result independent of which device file was visited first and avoids
 * silently preferring a machine-local write order.
 */
export function dedupeEvents(events: EventCollection): ActivityEvent[] {
  const byId = new Map<string, { event: ActivityEvent; representation: string }>();

  for (const event of events) {
    const representation = stableStringify(event);
    const existing = byId.get(event.eventId);
    if (existing === undefined || representation < existing.representation) {
      byId.set(event.eventId, { event, representation });
    }
  }

  return [...byId.values()].map(({ event }) => event);
}

function flattenLedgers(
  input: EventCollection | LedgerCollection,
): ActivityEvent[] {
  if (input.length === 0) {
    return [];
  }

  if (Array.isArray(input[0])) {
    return (input as LedgerCollection).flatMap((ledger) => [...ledger]);
  }

  return [...(input as EventCollection)];
}

/** Merge one or more device ledgers, dedupe IDs, then sort deterministically. */
export function mergeEvents(events: EventCollection): ActivityEvent[];
export function mergeEvents(ledgers: LedgerCollection): ActivityEvent[];
export function mergeEvents(first: EventCollection | LedgerCollection, ...moreLedgers: EventCollection[]): ActivityEvent[];
export function mergeEvents(
  input: EventCollection | LedgerCollection,
  ...moreLedgers: EventCollection[]
): ActivityEvent[] {
  const flattened = flattenLedgers(input);
  return sortEvents(dedupeEvents(moreLedgers.length === 0
    ? flattened
    : [...flattened, ...moreLedgers.flatMap((ledger) => [...ledger])]));
}

export const mergeLedgers = mergeEvents;
export const mergeEventLedgers = mergeEvents;
export const mergeDeviceLedgers = mergeEvents;
export const mergeActivityEvents = mergeEvents;
export const deduplicateEvents = dedupeEvents;
