import type { CountMode } from "../ledger/types";

/** Current format written to the append-only Focus JSONL files. */
export const FOCUS_SESSION_FORMAT_VERSION = 1 as const;

export type FocusEndReason = "completed" | "manual" | "shutdown" | "plugin-disabled" | "recovered";
export type FocusPhase = "idle" | "focus" | "paused" | "result" | "rest";

export interface FocusSessionRecord {
  id: string;
  deviceId: string;
  localDate: string;
  countMode: CountMode;
  startTime: string;
  endTime: string;
  plannedDurationMs: number;
  inputCharacters: number;
  netCharacters: number;
  activeMs: number;
  idleMs: number;
  awayMs: number;
  endReason: FocusEndReason;
  /** Optional so older JSONL records remain readable. New records write v1. */
  formatVersion?: typeof FOCUS_SESSION_FORMAT_VERSION;
}

export interface FocusSessionSnapshot {
  inputCharacters: number;
  netCharacters: number;
  activeMs: number;
  idleMs: number;
  awayMs: number;
}

export interface FocusSnapshot {
  phase: FocusPhase;
  remainingMs: number;
  session?: FocusSessionSnapshot;
  lastResult?: FocusSessionRecord;
}

export interface FocusCheckpoint {
  version: 1;
  kind: "focus";
  id: string;
  deviceId: string;
  countMode: CountMode;
  startTime: string;
  plannedDurationMs: number;
  checkpointTime: string;
  inputCharacters: number;
  netCharacters: number;
  activeMs: number;
  idleMs: number;
  awayMs: number;
}
