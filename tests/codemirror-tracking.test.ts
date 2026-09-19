import { EditorState, Transaction } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { CompositionActivity, diffTextChange, extractTransactionActivity } from "../src/tracking/codemirror";

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


describe("bounded IME composition", () => {
  it("matches full diff across candidate replacements, cancellation and emoji", () => {
    for (const original of ["开头旧内容结尾", "正文😀尾", "abc"]) {
      const composition = new CompositionActivity();
      let state = EditorState.create({ doc: original });
      for (const insert of ["n", "ni", "你好😀", original.slice(1, -1)]) {
        const transaction = state.update({ changes: { from: 1, to: state.doc.length - 1, insert } });
        composition.add(transaction);
        state = transaction.state;
      }
      expect(composition.flush()).toEqual(diffTextChange(original, state.doc.toString()));
      expect(composition.flush()).toBeUndefined();
    }
  });

  it("only materializes the edited span in a long document", () => {
    const state = EditorState.create({ doc: "长文".repeat(100000) });
    const composition = new CompositionActivity();
    const transaction = state.update({ changes: { from: 100000, insert: "你好" } });
    // Converting the full rope to a string is forbidden in the input path.
    state.doc.toString = () => { throw new Error("whole document read"); };
    transaction.state.doc.toString = () => { throw new Error("whole document read"); };
    composition.add(transaction);
    expect(composition.flush()).toEqual({ insertedText: "你好", deletedText: "" });
  });
});


describe("IME change composition equivalence", () => {
  it("preserves full-diff semantics through multiple nonadjacent edits", () => {
    let state = EditorState.create({ doc: "😀开头旧文字中间正文尾巴😀" });
    const start = state.doc.toString();
    const changes = new CompositionActivity();
    for (let step = 0; step < 30; step++) {
      const from = (step * 7) % (state.doc.length + 1);
      const to = Math.min(state.doc.length, from + step % 3);
      const transaction = state.update({ changes: { from, to, insert: ["好", "😀", "", "新文字"][step % 4] } });
      changes.add(transaction);
      state = transaction.state;
    }
    expect(changes.flush()).toEqual(diffTextChange(start, state.doc.toString()));
  });
});
