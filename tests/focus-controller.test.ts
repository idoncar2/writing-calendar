import { describe, expect, it, vi } from "vitest";
import { FocusController } from "../src/focus/controller";

const minute = 60_000;

function tickThrough(controller: FocusController, from: number, to: number): void {
  for (let now = from + 1_000; now <= to; now += 1_000) controller.tick(now);
}

describe("FocusController", () => {
  it("counts the foreground time before the first edit as idle, not active", () => {
    const controller = new FocusController({
      deviceId: "pc-a",
      activeGraceMs: minute,
      createId: () => "focus-no-edit",
    });

    controller.startFocus(10 * minute, "creative", 0);
    tickThrough(controller, 0, 5 * minute);

    expect(controller.getSnapshot(5 * minute).session).toMatchObject({
      activeMs: 0,
      idleMs: 5 * minute,
      awayMs: 0,
    });
  });

  it("treats each edit as an activity window and unions overlapping windows", () => {
    const controller = new FocusController({
      deviceId: "pc-a",
      activeGraceMs: minute,
      createId: () => "focus-windows",
    });

    controller.startFocus(10 * minute, "creative", 0);
    controller.recordActivity(1, 1, 0);
    tickThrough(controller, 0, 40_000);
    controller.recordActivity(1, 1, 40_000);
    tickThrough(controller, 40_000, 100_000);

    expect(controller.getSnapshot(100_000).session).toMatchObject({
      activeMs: 100_000,
      idleMs: 0,
    });

    tickThrough(controller, 100_000, 160_000);
    expect(controller.getSnapshot(160_000).session).toMatchObject({
      activeMs: 100_000,
      idleMs: 60_000,
    });
  });

  it("accounts active, idle and away time only inside an explicit focus session", () => {
    const ended = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      createId: () => "focus-a",
      onSessionEnded: ended,
    });

    expect(controller.getSnapshot(0).phase).toBe("idle");
    controller.startFocus(25 * minute, "creative", 0);
    tickThrough(controller, 0, minute);
    controller.recordActivity(120, 100, minute);
    tickThrough(controller, minute, 5 * minute);
    controller.setAway(true, 5 * minute);
    tickThrough(controller, 5 * minute, 9 * minute);
    controller.setAway(false, 9 * minute);
    tickThrough(controller, 9 * minute, 10 * minute);

    const snapshot = controller.getSnapshot(10 * minute);
    expect(snapshot.session).toMatchObject({
      inputCharacters: 120,
      netCharacters: 100,
      activeMs: 2 * minute,
      idleMs: 4 * minute,
      awayMs: 4 * minute,
    });
    expect(ended).not.toHaveBeenCalled();
  });

  it("pauses countdown and time buckets, then completes at the adjusted deadline", () => {
    const ended = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      createId: () => "focus-b",
      onSessionEnded: ended,
    });
    controller.startFocus(5 * minute, "body-characters", 0);
    tickThrough(controller, 0, minute);
    controller.pause(minute);
    controller.tick(4 * minute);
    expect(controller.getSnapshot(4 * minute).remainingMs).toBe(4 * minute);
    controller.resume(4 * minute);
    tickThrough(controller, 4 * minute, 8 * minute);

    expect(ended).toHaveBeenCalledWith(expect.objectContaining({
      id: "focus-b",
      countMode: "body-characters",
      endReason: "completed",
      activeMs: 0,
      idleMs: 5 * minute,
    }));
    expect(controller.getSnapshot(8 * minute).phase).toBe("result");
  });

  it("ends and recovers sessions without counting time after the last checkpoint", () => {
    const first = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      createId: () => "focus-c",
    });
    first.startFocus(25 * minute, "creative", 0);
    first.recordActivity(10, 8, minute);
    const checkpoint = first.checkpoint(4 * minute);

    const ended = vi.fn();
    const recovered = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      onSessionEnded: ended,
    });
    recovered.recover(checkpoint);

    expect(ended).toHaveBeenCalledWith(expect.objectContaining({
      id: "focus-c",
      endReason: "recovered",
      endTime: new Date(4 * minute).toISOString(),
      activeMs: 2 * minute,
      idleMs: 2 * minute,
    }));
  });

  it("uses the current local device identity when recovering a checkpoint", () => {
    const ended = vi.fn();
    const controller = new FocusController({
      deviceId: "local-device",
      activeGraceMs: minute,
      onSessionEnded: ended,
    });

    controller.recover({
      version: 1,
      kind: "focus",
      id: "focus-old-device",
      deviceId: "old-synced-device",
      countMode: "creative",
      startTime: "1970-01-01T00:00:00.000Z",
      plannedDurationMs: 10 * minute,
      checkpointTime: "1970-01-01T00:05:00.000Z",
      inputCharacters: 1,
      netCharacters: 1,
      activeMs: minute,
      idleMs: 4 * minute,
      awayMs: 0,
    });

    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "local-device" }));
  });

  it("runs an optional rest timer without creating a focus record", () => {
    const ended = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      onSessionEnded: ended,
    });
    controller.startRest(5 * minute, 0);
    controller.tick(5 * minute);
    expect(controller.getSnapshot(5 * minute).phase).toBe("idle");
    expect(ended).not.toHaveBeenCalled();
  });

  it("discards focus sessions shorter than one minute", () => {
    const ended = vi.fn();
    const discarded = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      createId: () => "focus-short",
      onSessionEnded: ended,
      onShortSessionDiscarded: discarded,
    });

    controller.startFocus(25 * minute, "creative", 0);
    controller.end("manual", minute - 1);

    expect(ended).not.toHaveBeenCalled();
    expect(discarded).toHaveBeenCalledWith({ elapsedMs: minute - 1, reason: "manual" });
    expect(controller.getSnapshot(minute).phase).toBe("idle");
  });

  it("starts counting idle immediately after returning from away without waiting for an edit", () => {
    const controller = new FocusController({
      deviceId: "pc-a",
      activeGraceMs: minute,
      createId: () => "focus-return",
    });

    controller.startFocus(10 * minute, "creative", 0);
    controller.recordActivity(1, 1, 0);
    controller.setAway(true, 10_000);
    controller.setAway(false, 20_000);
    controller.tick(30_000);

    expect(controller.getSnapshot(30_000).session).toMatchObject({
      activeMs: 10_000,
      idleMs: 10_000,
      awayMs: 10_000,
    });
  });

  it("does not count a long timer gap as idle", () => {
    const ended = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      activeGraceMs: minute,
      createId: () => "focus-sleep",
      onSessionEnded: ended,
    });

    controller.startFocus(60 * minute, "creative", 0);
    tickThrough(controller, 0, minute);
    controller.tick(9 * 60 * minute);

    expect(ended).toHaveBeenCalledWith(expect.objectContaining({
      id: "focus-sleep",
      activeMs: 0,
      idleMs: minute,
      awayMs: 59 * minute,
    }));
  });

  it("records focus sessions shorter than one minute when explicitly enabled", () => {
    const ended = vi.fn();
    const discarded = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      createId: () => "focus-short-enabled",
      onSessionEnded: ended,
      onShortSessionDiscarded: discarded,
    });
    controller.setRecordShortSessions(true);

    controller.startFocus(25 * minute, "creative", 0);
    controller.end("manual", 30_000);

    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ id: "focus-short-enabled" }));
    expect(discarded).not.toHaveBeenCalled();
  });

  it("does not show the short-session discard prompt during shutdown", () => {
    const discarded = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      onShortSessionDiscarded: discarded,
    });

    controller.startFocus(25 * minute, "creative", 0);
    controller.end("shutdown", 30_000);

    expect(discarded).not.toHaveBeenCalled();
  });

  it("records a focus session once it reaches one minute", () => {
    const ended = vi.fn();
    const controller = new FocusController({
      deviceId: "pc-a",
      idleThresholdMs: 2 * minute,
      createId: () => "focus-minute",
      onSessionEnded: ended,
    });

    controller.startFocus(25 * minute, "creative", 0);
    controller.end("manual", minute);

    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ id: "focus-minute" }));
  });
});
