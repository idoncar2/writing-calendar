import { describe, expect, it } from "vitest";

import { classifyEditorActivity } from "../src/tracking/classifier";

describe("classifyEditorActivity", () => {
  it("treats normal typing and committed IME input as manual input", () => {
    expect(
      classifyEditorActivity({
        docChanged: true,
        insertedText: "你",
        deletedText: "",
        userEvents: ["input.type"],
      }),
    ).toMatchObject({ source: "typing", countsAsManual: true, recordsActivity: true });

    expect(
      classifyEditorActivity({
        docChanged: true,
        insertedText: "好",
        deletedText: "",
        userEvents: ["input.type.compose"],
      }),
    ).toMatchObject({ source: "ime", countsAsManual: true, recordsActivity: true });
  });

  it("keeps paste, drop, completion and programmatic insertions out of manual input", () => {
    const cases = [
      ["input.paste", "paste"],
      ["input.drop", "drop"],
      ["input.complete", "completion"],
      ["input", "programmatic"],
    ] as const;

    for (const [event, source] of cases) {
      expect(
        classifyEditorActivity({
          docChanged: true,
          insertedText: "text",
          deletedText: "",
          userEvents: [event],
        }),
      ).toMatchObject({ source, countsAsManual: false, recordsActivity: true });
    }
  });

  it("records undo as deletion and redo as non-manual increment", () => {
    expect(
      classifyEditorActivity({
        docChanged: true,
        insertedText: "",
        deletedText: "撤销内容",
        userEvents: ["undo"],
      }),
    ).toMatchObject({ source: "undo", countsAsManual: false, recordsActivity: true });

    expect(
      classifyEditorActivity({
        docChanged: true,
        insertedText: "重做内容",
        deletedText: "",
        userEvents: ["redo"],
      }),
    ).toMatchObject({ source: "redo", countsAsManual: false, recordsActivity: true });
  });

  it("does not create an activity event for transactions without document changes", () => {
    expect(
      classifyEditorActivity({
        docChanged: false,
        insertedText: "",
        deletedText: "",
        userEvents: ["select.pointer"],
      }),
    ).toMatchObject({ source: "none", countsAsManual: false, recordsActivity: false });
  });

  it("recognizes replacement as one event with insertion and deletion", () => {
    expect(
      classifyEditorActivity({
        docChanged: true,
        insertedText: "新",
        deletedText: "旧内容",
        userEvents: ["input.type"],
      }),
    ).toMatchObject({ source: "typing", countsAsManual: true, hasInsertion: true, hasDeletion: true });
  });
});
