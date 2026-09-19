import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorIdleTasks } from "../src/service/editor-idle-tasks";

afterEach(() => vi.useRealTimers());

describe("mobile editor background tasks", () => {
  it("keeps expensive tasks out of continuous typing and runs once after idle", () => {
    vi.useFakeTimers();
    const tasks = new EditorIdleTasks(750);
    const render = vi.fn();
    tasks.schedule("render", render, 80);
    for (let i = 0; i < 20; i++) {
      tasks.noteActivity();
      vi.advanceTimersByTime(100);
    }
    expect(render).not.toHaveBeenCalled();
    vi.advanceTimersByTime(650);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("coalesces each file independently and does not delay desktop work", () => {
    vi.useFakeTimers();
    const tasks = new EditorIdleTasks(0);
    const old = vi.fn();
    const latest = vi.fn();
    const second = vi.fn();
    tasks.schedule("file:a", old, 1000);
    tasks.schedule("file:a", latest, 1000);
    tasks.schedule("file:b", second, 1000);
    tasks.noteActivity();
    vi.advanceTimersByTime(1000);
    expect(old).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancels pending tasks on dispose and rejects late scheduling", () => {
    vi.useFakeTimers();
    const tasks = new EditorIdleTasks(750);
    const work = vi.fn();
    tasks.schedule("save", work, 500);
    tasks.dispose();
    tasks.schedule("late", work, 500);
    vi.runAllTimers();
    expect(work).not.toHaveBeenCalled();
  });
});
