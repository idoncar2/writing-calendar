import { describe, expect, it, vi } from "vitest";
import { ActivityTimezone } from "../src/service/activity-timezone";

describe("activity timezone", () => {
  it("reuses timezone during fast input and refreshes after a minute or clock rollback", () => {
    const resolve = vi.fn().mockReturnValue("Asia/Shanghai");
    const timezone = new ActivityTimezone(resolve);
    for (let time = 100_000; time < 160_000; time += 100) expect(timezone.get(time)).toBe("Asia/Shanghai");
    expect(resolve).toHaveBeenCalledTimes(1);
    resolve.mockReturnValue("Asia/Tokyo");
    expect(timezone.get(160_000)).toBe("Asia/Tokyo");
    expect(resolve).toHaveBeenCalledTimes(2);
    timezone.get(90_000);
    expect(resolve).toHaveBeenCalledTimes(3);
  });
});
