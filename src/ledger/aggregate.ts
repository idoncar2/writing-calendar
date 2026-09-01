import { dedupeEvents } from "./merge";
import {
  activityCountsForMode,
  type ActivityEvent,
  type ActivityMetric,
  type AggregateOptions,
  type DailyFileAggregate,
} from "./types";

function compare(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function groupKey(localDate: string, fileId: string, path: string): string {
  return `${localDate}\u0000${fileId}\u0000${path}`;
}

/** Return one of the display metrics for an already aggregated row. */
export function metricValue(row: DailyFileAggregate, metric: ActivityMetric): number {
  return row[metric];
}

/**
 * Aggregate immutable ledger events by the event's local date and observed
 * file path. No project membership is computed here: keeping fileId and path
 * on each row allows a later ProjectDefinition query to re-collect history.
 */
export function aggregateEvents(
  events: readonly ActivityEvent[],
  options: AggregateOptions = {},
): DailyFileAggregate[] {
  const includePasteInManual = options.includePasteInManual ?? false;
  const countMode = options.countMode ?? "creative";
  const groups = new Map<string, DailyFileAggregate>();

  // Aggregation is often called directly on the union of device ledgers. The
  // same ID must not be counted twice if a sync operation supplied duplicates.
  for (const event of dedupeEvents(events)) {
    const counts = activityCountsForMode(event, countMode);

    const fileId = event.fileId ?? "";
    const key = groupKey(event.localDate, fileId, event.path);
    const existing = groups.get(key);
    const row = existing ?? {
      localDate: event.localDate,
      fileId,
      path: event.path,
      manual: 0,
      increment: 0,
      deletion: 0,
      net: 0,
      manualNet: 0,
    };

    row.manual += counts.typed + (includePasteInManual ? counts.paste : 0);
    row.increment += counts.typed + counts.paste + counts.otherInserted;
    row.deletion += counts.deleted;
    row.net = row.increment - row.deletion;
    row.manualNet = row.manual - row.deletion;
    groups.set(key, row);
  }

  return [...groups.values()].sort((left, right) => {
    return compare(left.localDate, right.localDate)
      || compare(left.fileId, right.fileId)
      || compare(left.path, right.path);
  });
}

export const aggregateByDateAndFile = aggregateEvents;
export const aggregateByLocalDateAndFile = aggregateEvents;
export const buildDailyProjection = aggregateEvents;
export const aggregateLedger = aggregateEvents;
export const aggregateActivityEvents = aggregateEvents;
