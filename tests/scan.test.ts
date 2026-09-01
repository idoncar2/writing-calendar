import { describe, expect, it, vi } from "vitest";

import { retryFailedItems } from "../src/index/scan";

describe("scan retry helper", () => {
  it("retries a transiently failed file during the same scan", async () => {
    const attempts = new Map<string, number>();

    const unresolved = await retryFailedItems(
      ["正文/暂时不可读.md", "正文/正常.md"],
      async (path) => {
        const attempt = (attempts.get(path) ?? 0) + 1;
        attempts.set(path, attempt);
        return path === "正文/正常.md" || attempt >= 2;
      },
      1,
    );

    expect(unresolved).toEqual([]);
    expect(attempts.get("正文/暂时不可读.md")).toBe(2);
    expect(attempts.get("正文/正常.md")).toBe(1);
  });

  it("keeps a permanently failed file bounded and unresolved", async () => {
    const scan = vi.fn(async () => false);

    const unresolved = await retryFailedItems(["正文/损坏.md"], scan, 2);

    expect(unresolved).toEqual(["正文/损坏.md"]);
    expect(scan).toHaveBeenCalledTimes(3);
  });
});
