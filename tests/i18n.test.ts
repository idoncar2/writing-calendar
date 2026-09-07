import { afterEach, describe, expect, it } from "vitest";

import { setUiLanguage, t } from "../src/i18n";

afterEach(() => setUiLanguage("auto"));

describe("i18n", () => {
  it("keeps Chinese when explicitly selected", () => {
    setUiLanguage("zh-CN");
    expect(t("写作日历")).toBe("写作日历");
  });

  it("translates core UI and dynamic statistics into English", () => {
    setUiLanguage("en");
    expect(t("写作日历")).toBe("Writing Calendar");
    expect(t("今日 1,234 字")).toBe("Today 1,234 words");
    expect(t("2026 年 9 月")).toBe("September 2026");
    expect(t("活跃 12 天 · 当前连续 3 天 · 最长 8 天")).toBe(
      "Active 12 days · Current streak 3 days · Longest 8 days",
    );
  });
});
