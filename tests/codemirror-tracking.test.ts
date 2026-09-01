import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { diffTextChange, extractTransactionActivity } from "../src/tracking/codemirror";

describe("CodeMirror transaction extraction", () => {
  it("extracts inserted and deleted text from a replacement", () => {
    const state = EditorState.create({ doc: "旧内容" });
    const transaction = state.update({
      changes: { from: 0, to: 2, insert: "新" },
      annotations: Transaction.userEvent.of("input.type"),
    });

    expect(extractTransactionActivity(transaction)).toEqual({
      docChanged: true,
      insertedText: "新",
      deletedText: "旧内",
      userEvents: ["input.type"],
    });
  });

  it("keeps all changed ranges in one ordered activity", () => {
    const state = EditorState.create({ doc: "甲乙丙丁" });
    const transaction = state.update({
      changes: [
        { from: 0, to: 1, insert: "一" },
        { from: 3, to: 4, insert: "四" },
      ],
      annotations: Transaction.userEvent.of("input.type"),
    });

    expect(extractTransactionActivity(transaction)).toMatchObject({
      insertedText: "一四",
      deletedText: "甲丁",
    });
  });

  it("returns an inert activity for selection-only transactions", () => {
    const state = EditorState.create({ doc: "正文" });
    const transaction = state.update({ selection: { anchor: 1 } });

    expect(extractTransactionActivity(transaction)).toEqual({
      docChanged: false,
      insertedText: "",
      deletedText: "",
      userEvents: [],
    });
  });

  it("reduces an IME composition to the final inserted and replaced text", () => {
    expect(diffTextChange("开头旧内容结尾", "开头最终文字结尾")).toEqual({
      insertedText: "最终文字",
      deletedText: "旧内容",
    });
    expect(diffTextChange("正文😀尾", "正文好尾")).toEqual({
      insertedText: "好",
      deletedText: "😀",
    });
  });
});
