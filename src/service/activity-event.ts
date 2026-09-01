import { countBodyCharacters, countCreativeWords, countMarkdown } from "../core/counting";
import { ACTIVITY_FORMAT_VERSION, type ActivityCounts, type ActivityEvent } from "../ledger/types";
import type { TrackedEditorActivity } from "../tracking/codemirror";

export interface BuildActivityEventOptions {
  activity: TrackedEditorActivity;
  eventId: string;
  deviceId: string;
  fileId: string;
  path: string;
  timestamp: Date;
  timezone: string;
  localDate: string;
}

function buckets(activity: TrackedEditorActivity, mode: "creative" | "body-characters"): ActivityCounts {
  const insertedVector = countMarkdown(activity.insertedText);
  const deletedVector = countMarkdown(activity.deletedText);
  const inserted = mode === "creative" ? countCreativeWords(insertedVector) : countBodyCharacters(insertedVector);
  const deleted = mode === "creative" ? countCreativeWords(deletedVector) : countBodyCharacters(deletedVector);
  const typed = activity.source === "typing" || activity.source === "ime" ? inserted : 0;
  const paste = activity.source === "paste" ? inserted : 0;
  const otherInserted = typed === 0 && paste === 0 ? inserted : 0;
  return { typed, paste, otherInserted, deleted };
}

export function buildActivityEvent(options: BuildActivityEventOptions): ActivityEvent {
  return {
    eventId: options.eventId,
    deviceId: options.deviceId,
    timestamp: options.timestamp.toISOString(),
    localDate: options.localDate,
    timezone: options.timezone,
    fileId: options.fileId,
    path: options.path,
    source: options.activity.source,
    counts: buckets(options.activity, "creative"),
    bodyCharacterCounts: buckets(options.activity, "body-characters"),
    formatVersion: ACTIVITY_FORMAT_VERSION,
  };
}
