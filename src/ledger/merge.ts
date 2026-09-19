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

export function eventSortKey(event: ActivityEvent): string {
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
  return events.map((event) => ({ event, key: eventSortKey(event) })).sort((left, right) => {
    if (left.key < right.key) {
      return -1;
    }
    if (left.key > right.key) {
      return 1;
    }
    return 0;
  }).map(({ event }) => event);
}

/**
 * Deduplicate by the globally stable event ID.
 *
 * A duplicate ID with different bytes is an ambiguous sync conflict. We keep
 * the lexicographically smallest canonical representation, which makes the
 * result independent of which device file was visited first and avoids
 * silently preferring a machine-local write order.
 */
export function dedupeEvents(events: Iterable<ActivityEvent>): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>();

  for (const event of events) {
    const existing = byId.get(event.eventId);
    if (existing === undefined || (existing !== event && stableStringify(event) < stableStringify(existing))) {
      byId.set(event.eventId, event);
    }
  }

  return [...byId.values()];
}

function* iterateLedgers(
  input: EventCollection | LedgerCollection,
  moreLedgers: LedgerCollection,
): Iterable<ActivityEvent> {
  if (Array.isArray(input[0])) {
    for (const ledger of input as LedgerCollection) yield* ledger;
  } else {
    yield* input as EventCollection;
  }
  for (const ledger of moreLedgers) yield* ledger;
}

/** Merge one or more device ledgers, dedupe IDs, then sort deterministically. */
export function mergeEvents(events: EventCollection): ActivityEvent[];
export function mergeEvents(ledgers: LedgerCollection): ActivityEvent[];
export function mergeEvents(first: EventCollection | LedgerCollection, ...moreLedgers: EventCollection[]): ActivityEvent[];
export function mergeEvents(
  input: EventCollection | LedgerCollection,
  ...moreLedgers: EventCollection[]
): ActivityEvent[] {
  return sortEvents(dedupeEvents(iterateLedgers(input, moreLedgers)));
}

export const mergeLedgers = mergeEvents;
export const mergeEventLedgers = mergeEvents;
export const mergeDeviceLedgers = mergeEvents;
export const mergeActivityEvents = mergeEvents;
export const deduplicateEvents = dedupeEvents;
