import {
  addCountVectors,
  emptyCountVector,
  subtractCountVectors,
  type CountVector,
} from "./counting";

/** Raw activity buckets retained by the ledger before display derivation. */
export interface ActivityBuckets {
  typed: CountVector;
  paste: CountVector;
  otherInserted: CountVector;
  deleted: CountVector;
}

export interface ActivityMetrics {
  manual: CountVector;
  increment: CountVector;
  deletion: CountVector;
  net: CountVector;
}

export interface ActivityMetricOptions {
  /** Whether paste should be included in the manual-input display metric. */
  includePasteInManual?: boolean;
  /** Compatibility spelling for callers that describe the setting as a policy. */
  pasteCountsAsManual?: boolean;
  /** Short spelling used by some UI settings adapters. */
  includePaste?: boolean;
}

export type ActivityChangeSource =
  | "typing"
  | "ime"
  | "paste"
  | "drop"
  | "deletion"
  | "delete"
  | "cut"
  | "completion"
  | "programmatic"
  | "otherInserted"
  | "other"
  | "unknown"
  | "undo"
  | "redo";

/** A pure description of one editor transaction's count deltas. */
export interface ActivityChange {
  source: ActivityChangeSource;
  inserted?: CountVector;
  deleted?: CountVector;
}

/**
 * Derive the four user-facing metrics from independent raw activity buckets.
 * Missing buckets are treated as zero, and every returned vector is fresh.
 */
export function deriveActivityMetrics(
  buckets: Partial<ActivityBuckets>,
  options: ActivityMetricOptions | boolean = {},
): ActivityMetrics {
  const typed = buckets.typed ?? emptyCountVector();
  const paste = buckets.paste ?? emptyCountVector();
  const otherInserted = buckets.otherInserted ?? emptyCountVector();
  const deleted = buckets.deleted ?? emptyCountVector();
  const includePaste =
      typeof options === "boolean"
      ? options
      : options.includePasteInManual ?? options.pasteCountsAsManual ?? options.includePaste ?? false;

  const increment = addCountVectors(typed, paste, otherInserted);
  const manual = includePaste ? addCountVectors(typed, paste) : addCountVectors(typed);
  const deletion = addCountVectors(deleted);

  return {
    manual,
    increment,
    deletion,
    net: subtractCountVectors(increment, deletion),
  };
}

/** Aggregate pure editor changes into the four raw buckets. */
export function summarizeActivityChanges(changes: readonly ActivityChange[]): ActivityBuckets {
  const buckets: ActivityBuckets = {
    typed: emptyCountVector(),
    paste: emptyCountVector(),
    otherInserted: emptyCountVector(),
    deleted: emptyCountVector(),
  };

  for (const change of changes) {
    const inserted = change.inserted ?? emptyCountVector();
    const deleted = change.deleted ?? emptyCountVector();

    switch (change.source) {
      case "typing":
      case "ime":
        buckets.typed = addCountVectors(buckets.typed, inserted);
        buckets.deleted = addCountVectors(buckets.deleted, deleted);
        break;
      case "paste":
        buckets.paste = addCountVectors(buckets.paste, inserted);
        buckets.deleted = addCountVectors(buckets.deleted, deleted);
        break;
      case "deletion":
      case "delete":
      case "cut":
      case "undo":
        // Undo is deliberately deletion-only for metrics: it does not erase
        // the original manual-input event, but it changes net document size.
        buckets.deleted = addCountVectors(buckets.deleted, change.deleted ?? change.inserted ?? emptyCountVector());
        break;
      case "redo":
        // Redo is a fresh increment, never a second manual-input event.
        buckets.otherInserted = addCountVectors(buckets.otherInserted, inserted);
        buckets.deleted = addCountVectors(buckets.deleted, deleted);
        break;
      case "drop":
      case "completion":
      case "programmatic":
      case "otherInserted":
      case "other":
      case "unknown":
        buckets.otherInserted = addCountVectors(buckets.otherInserted, inserted);
        buckets.deleted = addCountVectors(buckets.deleted, deleted);
        break;
    }
  }

  return buckets;
}

// Concise aliases for consumers that use the shorter domain terms.
export const deriveMetrics = deriveActivityMetrics;
export const aggregateActivityChanges = summarizeActivityChanges;
