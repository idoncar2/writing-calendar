import type { CountMode } from "../ledger/types";
import type {
  FocusCheckpoint,
  FocusEndReason,
  FocusSessionRecord,
  FocusSnapshot,
} from "./types";
import { FOCUS_SESSION_FORMAT_VERSION } from "./types";

interface FocusControllerOptions {
  deviceId: string;
  /** Duration for which an edit keeps the editor in the active bucket. */
  activeGraceMs?: number;
  /** @deprecated Use activeGraceMs. Kept for existing callers and settings. */
  idleThresholdMs?: number;
  recordShortSessions?: boolean;
  createId?: () => string;
  onSessionEnded?: (record: FocusSessionRecord) => void | Promise<void>;
  onShortSessionDiscarded?: (details: {
    elapsedMs: number;
    reason: FocusEndReason;
  }) => void;
}

interface RunningFocus {
  id: string;
  countMode: CountMode;
  startMs: number;
  plannedDurationMs: number;
  endAtMs: number;
  remainingMs: number;
  lastAccountedMs: number;
  /** End of the union of all edit activity windows. */
  activeUntilMs: number | null;
  inputCharacters: number;
  netCharacters: number;
  activeMs: number;
  idleMs: number;
  awayMs: number;
  away: boolean;
  paused: boolean;
}

interface RestTimer { endAtMs: number }

const DEFAULT_ACTIVE_GRACE_MS = 60_000;
const MIN_RECORDED_FOCUS_MS = 60_000;
const SLEEP_GAP_THRESHOLD_MS = 30_000;

function localDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class FocusController {
  private focus?: RunningFocus;
  private rest?: RestTimer;
  private lastResult?: FocusSessionRecord;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: FocusControllerOptions) {
    this.options.activeGraceMs = this.normalizedActiveGrace(
      options.activeGraceMs ?? options.idleThresholdMs,
    );
  }

  /** @deprecated Use setActiveGrace. */
  setIdleThreshold(idleThresholdMs: number): void {
    this.setActiveGrace(idleThresholdMs);
  }

  setActiveGrace(activeGraceMs: number): void {
    this.options.activeGraceMs = this.normalizedActiveGrace(activeGraceMs);
  }

  setRecordShortSessions(recordShortSessions: boolean): void {
    this.options.recordShortSessions = recordShortSessions;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getCountMode(): CountMode | undefined {
    return this.focus?.countMode;
  }

  startFocus(durationMs: number, countMode: CountMode, now = Date.now()): void {
    const duration = Math.max(1, Math.round(durationMs));
    this.rest = undefined;
    this.lastResult = undefined;
    this.focus = {
      id: this.options.createId?.() ?? `focus-${now}-${Math.random().toString(36).slice(2, 8)}`,
      countMode,
      startMs: now,
      plannedDurationMs: duration,
      endAtMs: now + duration,
      remainingMs: duration,
      lastAccountedMs: now,
      activeUntilMs: null,
      inputCharacters: 0,
      netCharacters: 0,
      activeMs: 0,
      idleMs: 0,
      awayMs: 0,
      away: false,
      paused: false,
    };
    this.notify();
  }

  startRest(durationMs: number, now = Date.now()): void {
    this.focus = undefined;
    this.lastResult = undefined;
    this.rest = { endAtMs: now + Math.max(1, Math.round(durationMs)) };
    this.notify();
  }

  recordActivity(inputDelta: number, netDelta: number, now = Date.now()): void {
    if (!this.focus || this.focus.paused) return;
    this.reconcile(now);
    if (!this.focus) return;
    this.focus.inputCharacters += Math.max(0, inputDelta);
    this.focus.netCharacters += netDelta;
    if (!this.focus.away) {
      const activeUntilMs = now + this.activeGraceMs;
      this.focus.activeUntilMs = Math.max(this.focus.activeUntilMs ?? now, activeUntilMs);
    }
    this.notify();
  }

  setAway(away: boolean, now = Date.now()): void {
    if (!this.focus || this.focus.paused || this.focus.away === away) return;
    this.reconcile(now);
    if (!this.focus) return;
    if (away) {
      // An edit before leaving must not keep the active window alive after
      // returning without another edit.
      this.focus.activeUntilMs = now;
    }
    this.focus.away = away;
    this.notify();
  }

  pause(now = Date.now()): void {
    if (!this.focus || this.focus.paused) return;
    this.reconcile(now);
    if (!this.focus) return;
    this.focus.remainingMs = Math.max(0, this.focus.endAtMs - now);
    this.focus.paused = true;
    this.notify();
  }

  resume(now = Date.now()): void {
    if (!this.focus?.paused) return;
    this.focus.paused = false;
    this.focus.endAtMs = now + this.focus.remainingMs;
    this.focus.lastAccountedMs = now;
    this.focus.activeUntilMs = null;
    this.focus.away = false;
    this.notify();
  }

  tick(now = Date.now()): void {
    if (this.rest) {
      if (now >= this.rest.endAtMs) this.rest = undefined;
      this.notify();
      return;
    }
    // A normal timer callback arrives about once per second. If this gap is
    // unusually large, keep it out of idle so computer sleep cannot create a
    // multi-hour idle session.
    this.reconcile(now, true, true);
    this.notify();
  }

  end(reason: Exclude<FocusEndReason, "completed" | "recovered"> = "manual", now = Date.now()): void {
    if (!this.focus) return;
    this.reconcile(now, false);
    if (this.focus) this.finish(reason, now);
  }

  checkpoint(now = Date.now()): FocusCheckpoint | null {
    if (!this.focus) return null;
    this.reconcile(now);
    const focus = this.focus;
    if (!focus) return null;
    return {
      version: 1,
      kind: "focus",
      id: focus.id,
      deviceId: this.options.deviceId,
      countMode: focus.countMode,
      startTime: new Date(focus.startMs).toISOString(),
      plannedDurationMs: focus.plannedDurationMs,
      checkpointTime: new Date(now).toISOString(),
      inputCharacters: focus.inputCharacters,
      netCharacters: focus.netCharacters,
      activeMs: focus.activeMs,
      idleMs: focus.idleMs,
      awayMs: focus.awayMs,
    };
  }

  recover(checkpoint: FocusCheckpoint | null | undefined): void {
    if (!checkpoint || checkpoint.kind !== "focus" || checkpoint.version !== 1) return;
    const endMs = new Date(checkpoint.checkpointTime).getTime();
    const startMs = new Date(checkpoint.startTime).getTime();
    if (!Number.isFinite(endMs) || !Number.isFinite(startMs)) return;
    if (
      !this.options.recordShortSessions &&
      checkpoint.activeMs + checkpoint.idleMs + checkpoint.awayMs < MIN_RECORDED_FOCUS_MS
    ) {
      this.lastResult = undefined;
      this.notify();
      return;
    }
    const record: FocusSessionRecord = {
      id: checkpoint.id,
      deviceId: this.options.deviceId,
      localDate: localDate(startMs),
      countMode: checkpoint.countMode,
      startTime: checkpoint.startTime,
      endTime: checkpoint.checkpointTime,
      plannedDurationMs: checkpoint.plannedDurationMs,
      inputCharacters: checkpoint.inputCharacters,
      netCharacters: checkpoint.netCharacters,
      activeMs: checkpoint.activeMs,
      idleMs: checkpoint.idleMs,
      awayMs: checkpoint.awayMs,
      endReason: "recovered",
      formatVersion: FOCUS_SESSION_FORMAT_VERSION,
    };
    this.lastResult = record;
    void this.options.onSessionEnded?.(record);
    this.notify();
  }

  getSnapshot(now = Date.now()): FocusSnapshot {
    if (this.focus) {
      return {
        phase: this.focus.paused ? "paused" : "focus",
        remainingMs: this.focus.paused
          ? this.focus.remainingMs
          : Math.max(0, this.focus.endAtMs - now),
        session: {
          inputCharacters: this.focus.inputCharacters,
          netCharacters: this.focus.netCharacters,
          activeMs: this.focus.activeMs,
          idleMs: this.focus.idleMs,
          awayMs: this.focus.awayMs,
        },
      };
    }
    if (this.rest) return { phase: "rest", remainingMs: Math.max(0, this.rest.endAtMs - now) };
    if (this.lastResult) return { phase: "result", remainingMs: 0, lastResult: this.lastResult };
    return { phase: "idle", remainingMs: 0 };
  }

  private reconcile(now: number, complete = true, protectSleepGap = false): void {
    const focus = this.focus;
    if (!focus || focus.paused || now <= focus.lastAccountedMs) return;
    const until = Math.min(now, focus.endAtMs);
    if (until > focus.lastAccountedMs) {
      const elapsed = until - focus.lastAccountedMs;
      const sleepGap = protectSleepGap && now - focus.lastAccountedMs > SLEEP_GAP_THRESHOLD_MS;
      if (sleepGap || focus.away) {
        // This is intentionally separate from idle. A frozen timer must never
        // turn a sleeping computer into hours of supposed inactivity.
        focus.awayMs += elapsed;
      } else {
        const activeEnd = Math.min(
          until,
          Math.max(focus.lastAccountedMs, focus.activeUntilMs ?? focus.lastAccountedMs),
        );
        focus.activeMs += Math.max(0, activeEnd - focus.lastAccountedMs);
        focus.idleMs += Math.max(0, until - Math.max(focus.lastAccountedMs, activeEnd));
      }
      focus.lastAccountedMs = until;
    }
    if (complete && now >= focus.endAtMs) this.finish("completed", focus.endAtMs);
  }

  private finish(reason: FocusEndReason, endMs: number): void {
    const focus = this.focus;
    if (!focus) return;
    const recordedMs = focus.activeMs + focus.idleMs + focus.awayMs;
    if (!this.options.recordShortSessions && recordedMs < MIN_RECORDED_FOCUS_MS) {
      this.focus = undefined;
      this.lastResult = undefined;
      if (reason === "manual") {
        this.options.onShortSessionDiscarded?.({ elapsedMs: recordedMs, reason });
      }
      this.notify();
      return;
    }
    const record: FocusSessionRecord = {
      id: focus.id,
      deviceId: this.options.deviceId,
      localDate: localDate(focus.startMs),
      countMode: focus.countMode,
      startTime: new Date(focus.startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      plannedDurationMs: focus.plannedDurationMs,
      inputCharacters: focus.inputCharacters,
      netCharacters: focus.netCharacters,
      activeMs: focus.activeMs,
      idleMs: focus.idleMs,
      awayMs: focus.awayMs,
      endReason: reason,
      formatVersion: FOCUS_SESSION_FORMAT_VERSION,
    };
    this.focus = undefined;
    this.lastResult = record;
    void this.options.onSessionEnded?.(record);
    this.notify();
  }

  private get activeGraceMs(): number {
    return this.options.activeGraceMs ?? DEFAULT_ACTIVE_GRACE_MS;
  }

  private normalizedActiveGrace(value: number | undefined): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.max(1, Math.round(value))
      : DEFAULT_ACTIVE_GRACE_MS;
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
