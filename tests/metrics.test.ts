import { describe, expect, it } from "vitest";

import { countMarkdown, type CountVector } from "../src/core/counting";
import {
  deriveActivityMetrics,
  summarizeActivityChanges,
  type ActivityBuckets,
} from "../src/core/metrics";

const zero = (): CountVector => ({
  hanzi: 0,
  latinWords: 0,
  numbers: 0,
  punctuation: 0,
  visibleCharacters: 0,
  rawNonWhitespace: 0,
});

describe("activity metrics", () => {
  it("derives manual, increment, deletion, and net with paste excluded by default", () => {
    const buckets: ActivityBuckets = {
      typed: countMarkdown("你"),
      paste: countMarkdown("world"),
      otherInserted: countMarkdown("2026"),
      deleted: countMarkdown("旧"),
    };

    const metrics = deriveActivityMetrics(buckets);

    expect(metrics.manual).toMatchObject({ hanzi: 1, latinWords: 0 });
    expect(metrics.increment).toMatchObject({ hanzi: 1, latinWords: 1, numbers: 1 });
    expect(metrics.deletion).toMatchObject({ hanzi: 1 });
    expect(metrics.net).toMatchObject({ hanzi: 0, latinWords: 1, numbers: 1 });
  });

  it("can include paste in manual without changing increment, deletion, or net", () => {
    const buckets: ActivityBuckets = {
      typed: countMarkdown("你"),
      paste: countMarkdown("好"),
      otherInserted: zero(),
      deleted: zero(),
    };

    const excluded = deriveActivityMetrics(buckets);
    const included = deriveActivityMetrics(buckets, { includePasteInManual: true });

    expect(excluded.manual).toMatchObject({ hanzi: 1 });
    expect(included.manual).toMatchObject({ hanzi: 2 });
    expect(included.increment).toEqual(excluded.increment);
    expect(included.net).toEqual(excluded.net);
  });

  it("treats undo as deletion and redo as a new non-manual increment", () => {
    const buckets = summarizeActivityChanges([
      { source: "typing", inserted: countMarkdown("你") },
      { source: "undo", deleted: countMarkdown("你") },
      { source: "redo", inserted: countMarkdown("你") },
    ]);

    const metrics = deriveActivityMetrics(buckets);

    expect(metrics.manual).toMatchObject({ hanzi: 1 });
    expect(metrics.increment).toMatchObject({ hanzi: 2 });
    expect(metrics.deletion).toMatchObject({ hanzi: 1 });
    expect(metrics.net).toMatchObject({ hanzi: 1 });
  });

  it("allows deletion to exceed insertion so net values remain negative", () => {
    const metrics = deriveActivityMetrics({
      typed: zero(),
      paste: zero(),
      otherInserted: zero(),
      deleted: countMarkdown("你好"),
    });

    expect(metrics.net).toMatchObject({ hanzi: -2 });
  });
});
