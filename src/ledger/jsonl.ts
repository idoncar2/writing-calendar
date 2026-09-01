import {
  normalizeActivityEvent,
  type ActivityEvent,
  type JsonlDecodeResult,
  type JsonlWarning,
} from "./types";

/** Encode events as append-friendly JSONL with one event and one newline per row. */
export function encodeJsonl(events: readonly ActivityEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : "");
}

function warning(
  line: number,
  raw: string,
  kind: JsonlWarning["kind"],
  message: string,
): JsonlWarning {
  return {
    line,
    raw,
    kind,
    message,
    recoverable: true,
  };
}

/**
 * Decode a JSONL ledger without allowing one damaged row to hide later rows.
 * Empty and whitespace-only lines are deliberately ignored. Both malformed
 * JSON and JSON values that are not complete activity events are reported and
 * skipped; no synthetic event is generated from either kind of input.
 */
export function decodeJsonl(input: string): JsonlDecodeResult {
  const events: ActivityEvent[] = [];
  const warnings: JsonlWarning[] = [];
  const lines = input.replace(/^\uFEFF/, "").split(/\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const raw = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (raw.trim().length === 0) {
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid JSON";
      warnings.push(warning(lineNumber, raw, "invalid-json", `Invalid JSON on line ${lineNumber}: ${detail}`));
      return;
    }

    const event = normalizeActivityEvent(value);
    if (event === undefined) {
      warnings.push(
        warning(
          lineNumber,
          raw,
          "invalid-event",
          `JSON on line ${lineNumber} is not a complete activity event`,
        ),
      );
      return;
    }

    events.push(event);
  });

  return { events, warnings };
}

// Friendly aliases for callers that use parser/serializer terminology.
export const serializeJsonl = encodeJsonl;
export const parseJsonl = decodeJsonl;
export const readJsonl = decodeJsonl;
export const encodeEvents = encodeJsonl;
export const serializeEvents = encodeJsonl;
export const decodeEvents = decodeJsonl;
export const parseEvents = decodeJsonl;
