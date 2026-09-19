import type { DiagnosticDeviceEvent } from "./model";

type DeviceEventLike = Pick<DiagnosticDeviceEvent, "deviceId" | "timestamp">;

interface RetainedDeviceEvent {
  event: DiagnosticDeviceEvent;
  timestamp: number;
}

function timestampValue(timestamp: string): number {
  return new Date(timestamp).getTime();
}

function shouldReplace(previous: number, candidate: number): boolean {
  if (!Number.isFinite(candidate)) return false;
  return !Number.isFinite(previous) || candidate > previous;
}

export function compactDiagnosticDeviceEvents(
  events: readonly DeviceEventLike[],
): DiagnosticDeviceEvent[] {
  const latest = new Map<string, RetainedDeviceEvent>();
  for (const candidate of events) {
    const timestamp = timestampValue(candidate.timestamp);
    const previous = latest.get(candidate.deviceId);
    if (previous === undefined) {
      latest.set(candidate.deviceId, {
        event: { deviceId: candidate.deviceId, timestamp: candidate.timestamp },
        timestamp,
      });
    } else if (shouldReplace(previous.timestamp, timestamp)) {
      latest.set(candidate.deviceId, {
        event: { deviceId: candidate.deviceId, timestamp: candidate.timestamp },
        timestamp,
      });
    }
  }
  return [...latest.values()].map(({ event }) => event);
}

export function appendDiagnosticDeviceEvent(
  events: readonly DeviceEventLike[],
  event: DeviceEventLike,
): DiagnosticDeviceEvent[] {
  const next = events.map((item) => ({ deviceId: item.deviceId, timestamp: item.timestamp }));
  const index = next.findIndex((item) => item.deviceId === event.deviceId);
  if (index < 0) {
    next.push({ deviceId: event.deviceId, timestamp: event.timestamp });
    return next;
  }

  const previousTimestamp = timestampValue(next[index].timestamp);
  if (shouldReplace(previousTimestamp, timestampValue(event.timestamp))) {
    next[index] = { deviceId: event.deviceId, timestamp: event.timestamp };
  }
  return next;
}
