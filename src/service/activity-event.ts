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

function buckets(activity: TrackedEditorActivity, inserted: number, deleted: number): ActivityCounts {
  const typed = activity.source === "typing" || activity.source === "ime" ? inserted : 0;
  const paste = activity.source === "paste" ? inserted : 0;
  const otherInserted = typed === 0 && paste === 0 ? inserted : 0;
  return { typed, paste, otherInserted, deleted };
}

export function buildActivityEvent(options: BuildActivityEventOptions): ActivityEvent {
  const inserted = countMarkdown(options.activity.insertedText);
  const deleted = countMarkdown(options.activity.deletedText);
  return {
    eventId: options.eventId,
    deviceId: options.deviceId,
    timestamp: options.timestamp.toISOString(),
    localDate: options.localDate,
    timezone: options.timezone,
    fileId: options.fileId,
    path: options.path,
    source: options.activity.source,
    counts: buckets(options.activity, countCreativeWords(inserted), countCreativeWords(deleted)),
    bodyCharacterCounts: buckets(options.activity, countBodyCharacters(inserted), countBodyCharacters(deleted)),
    formatVersion: ACTIVITY_FORMAT_VERSION,
  };
}
