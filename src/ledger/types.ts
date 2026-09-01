/**
 * The version of the event shape written by this module.
 *
 * Keeping this value in the ledger package means the event reader can stay
 * independent from Obsidian and can be upgraded without changing the
 * tracking layer.
 */
export const ACTIVITY_FORMAT_VERSION = 1 as const;

/** Sources that the tracker may use for an event. */
export type ActivitySource =
  | "typing"
  | "ime"
  | "paste"
  | "drop"
  | "completion"
  | "programmatic"
  | "delete"
  | "cut"
  | "undo"
  | "redo"
  | "other"
  | "unknown"
  | (string & {});

/**
 * The independent count vector retained for every event.
 *
 * `typed` and `paste` are kept separate because the manual-input preference
 * is a presentation choice. `otherInserted` includes recognised insertion
 * sources such as drops, completions and programmatic changes. `deleted` is
 * always independent from insertion counts, so net can be negative.
 */
export interface ActivityCounts {
  typed: number;
  paste: number;
  otherInserted: number;
  deleted: number;
}

/** Structural aliases make the count vector easy to use in other layers. */
export type ActivityCountVector = ActivityCounts;
export type ActivityMetrics = ActivityCounts;

/** Count buckets that can be selected without rewriting the event ledger. */
export type CountMode = "creative" | "body-characters";

export type ActivityModeCounts = Partial<Record<CountMode, ActivityCounts>>;

/**
 * One immutable, append-only activity record.
 *
 * Events deliberately retain the path from the time of the activity. This
 * lets a later project query re-aggregate history without copying events into
 * project-specific files.
 */
export interface ActivityEvent {
  eventId: string;
  deviceId: string;
  /** UTC timestamp in an ISO-8601-compatible string. */
  timestamp: string;
  /** Local calendar date at the device where the event occurred. */
  localDate: string;
  /** IANA timezone (or another device timezone identifier) at event time. */
  timezone: string;
  /** Internal file identity, when available for the event. */
  fileId?: string;
  /** Path observed when the event occurred. */
  path: string;
  source: ActivitySource;
  /** Creative-count bucket retained for backwards-compatible events. */
  counts: ActivityCounts;
  /** Optional body-character bucket retained alongside `counts`. */
  bodyCharacterCounts?: ActivityCounts;
  /** Compatibility alias accepted when reading older experimental ledgers. */
  bodyCounts?: ActivityCounts;
  /** Optional versioned spelling for integrations that store named buckets. */
  modeCounts?: ActivityModeCounts;
  formatVersion: number;
}

/** A warning produced while recovering a JSONL ledger. */
export interface JsonlWarning {
  line: number;
  message: string;
  /** The source row, retained for diagnostics but never executed. */
  raw: string;
  kind: "invalid-json" | "invalid-event";
  recoverable: true;
}

export interface JsonlDecodeResult {
  events: ActivityEvent[];
  warnings: JsonlWarning[];
}

export interface DailyFileAggregate {
  localDate: string;
  /** Empty string is used only for legacy/path-only events. */
  fileId: string;
  path: string;
  manual: number;
  increment: number;
  deletion: number;
  net: number;
  /** 手动净增：手动输入（默认不含粘贴）减去删除量。 */
  manualNet: number;
}

export type ActivityMetric = "manual" | "increment" | "deletion" | "net" | "manualNet";

export interface AggregateOptions {
  /** Whether paste counts toward the manual-input metric. Defaults to false. */
  includePasteInManual?: boolean;
  /** Which independently retained count bucket to aggregate. */
  countMode?: CountMode;
}

type UnknownRecord = Record<string, unknown>;

const COUNT_KEYS = ["typed", "paste", "otherInserted", "deleted"] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readCount(
  source: UnknownRecord,
  key: (typeof COUNT_KEYS)[number],
  aliases: readonly string[] = [],
): number | undefined {
  const candidates = [key, ...aliases];
  for (const candidate of candidates) {
    if (candidate in source) {
      return source[candidate] as number;
    }
  }
  return undefined;
}

/**
 * Reads the canonical vector and a few harmless compatibility spellings.
 * Returning `undefined` for malformed input is important: an arbitrary
 * external JSON change must not be promoted to an activity event.
 */
export function readActivityCounts(value: unknown): ActivityCounts | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const nested = [value.counts, value.metrics, value.countVector, value.vector]
    .find(isRecord) as UnknownRecord | undefined;
  const source = nested ?? value;
  const hasCount = COUNT_KEYS.some((key) => key in source)
    || (nested !== undefined && ("inserted" in source || "other" in source));

  if (!hasCount) {
    return undefined;
  }

  const typed = readCount(source, "typed");
  const paste = readCount(source, "paste");
  const otherInserted = readCount(source, "otherInserted", ["other", "inserted"]);
  const deleted = readCount(source, "deleted");

  // A missing component is treated as zero for forward-compatible event
  // rows, but a present malformed component invalidates the complete row.
  const values = [typed, paste, otherInserted, deleted];
  if (values.some((entry) => entry !== undefined && !finiteNonNegative(entry))) {
    return undefined;
  }

  return {
    typed: typed ?? 0,
    paste: paste ?? 0,
    otherInserted: otherInserted ?? 0,
    deleted: deleted ?? 0,
  };
}

function deriveUtcDate(timestamp: string): string | undefined {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString().slice(0, 10);
}

/**
 * Validates and normalises one decoded JSON value.
 *
 * This is intentionally conservative about identity, path and count fields:
 * a file watcher noticing an unknown external change cannot satisfy these
 * requirements and therefore cannot create a synthetic activity event.
 */
export function normalizeActivityEvent(value: unknown): ActivityEvent | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const eventId = value.eventId;
  const deviceId = value.deviceId;
  const timestamp = value.timestamp;
  const localDateValue = value.localDate ?? value.date;
  const path = value.path ?? value.filePath;
  const fileId = value.fileId;
  const timezone = value.timezone ?? value.timeZone;
  const counts = readActivityCounts(value);

  if (
    typeof eventId !== "string"
    || eventId.length === 0
    || typeof deviceId !== "string"
    || deviceId.length === 0
    || typeof timestamp !== "string"
    || timestamp.length === 0
    || typeof path !== "string"
    || path.length === 0
    || counts === undefined
  ) {
    return undefined;
  }

  const localDate = typeof localDateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(localDateValue)
    ? localDateValue
    : deriveUtcDate(timestamp);
  if (localDate === undefined) {
    return undefined;
  }

  if (fileId !== undefined && typeof fileId !== "string") {
    return undefined;
  }

  const rawBodyCharacterCounts = value.bodyCharacterCounts ?? value.bodyCounts;
  const bodyCharacterCounts = rawBodyCharacterCounts === undefined
    ? undefined
    : readActivityCounts(rawBodyCharacterCounts);
  if (rawBodyCharacterCounts !== undefined && bodyCharacterCounts === undefined) {
    return undefined;
  }

  let modeCounts: ActivityModeCounts | undefined;
  if (value.modeCounts !== undefined) {
    if (!isRecord(value.modeCounts)) {
      return undefined;
    }
    modeCounts = {};
    for (const mode of ["creative", "body-characters"] as const) {
      if (!(mode in value.modeCounts)) {
        continue;
      }
      const parsed = readActivityCounts(value.modeCounts[mode]);
      if (parsed === undefined) {
        return undefined;
      }
      modeCounts[mode] = parsed;
    }
    if (Object.keys(modeCounts).length === 0) {
      return undefined;
    }
  }

  const source = value.source;
  if (source !== undefined && typeof source !== "string") {
    return undefined;
  }

  const formatVersion = value.formatVersion ?? value.schemaVersion ?? ACTIVITY_FORMAT_VERSION;
  if (typeof formatVersion !== "number" || !Number.isInteger(formatVersion) || formatVersion < 1) {
    return undefined;
  }

  // Preserve unknown metadata for forward compatibility while replacing
  // compatibility aliases with the canonical vector used by aggregation.
  return {
    ...value,
    eventId,
    deviceId,
    timestamp,
    localDate,
    timezone: typeof timezone === "string" && timezone.length > 0 ? timezone : "UTC",
    ...(fileId === undefined ? {} : { fileId }),
    path,
    source: source ?? "unknown",
    counts,
    ...(bodyCharacterCounts === undefined ? {} : { bodyCharacterCounts }),
    ...(modeCounts === undefined ? {} : { modeCounts }),
    formatVersion,
  } as ActivityEvent;
}

/** Returns a canonical vector for a typed event object. */
export function activityCounts(event: ActivityEvent): ActivityCounts {
  return event.counts;
}

/**
 * Select the requested bucket while remaining compatible with older events
 * that only contain the creative `counts` vector.
 */
export function activityCountsForMode(event: ActivityEvent, mode: CountMode): ActivityCounts {
  if (mode === "body-characters") {
    return event.bodyCharacterCounts
      ?? event.bodyCounts
      ?? event.modeCounts?.[mode]
      ?? event.counts;
  }
  return event.modeCounts?.creative ?? event.counts;
}
