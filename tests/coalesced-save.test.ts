import { describe, expect, it, vi } from "vitest";
import { CoalescedSave } from "../src/storage/coalesced-save";

describe("coalesced local saves", () => {
  it("writes the latest state once for a burst of requests", async () => {
    let state = 0;
    const saved: number[] = [];
    const saver = new CoalescedSave(async () => { saved.push(state); });
    const pending = Array.from({ length: 20 }, (_, index) => {
      state = index;
      return saver.request();
    });
    await Promise.all(pending);
    expect(saved).toEqual([19]);
  });

  it("follows an in-flight write with one fresh snapshot for all queued changes", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let state = 0;
    const saved: number[] = [];
    const saver = new CoalescedSave(async () => {
      saved.push(state);
      if (saved.length === 1) await blocked;
    });
    const first = saver.request();
    await Promise.resolve();
    const pending = Array.from({ length: 20 }, (_, index) => {
      state = index + 1;
      return saver.request();
    });
    release();
    await Promise.all([first, ...pending]);
    expect(saved).toEqual([0, 20]);
  });

  it("reports write failures and permits a subsequent retry", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockResolvedValue(undefined);
    const saver = new CoalescedSave(persist);
    const first = saver.request();
    const second = saver.request();
    await expect(first).rejects.toThrow("disk full");
    await expect(second).rejects.toThrow("disk full");
    await saver.request();
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
