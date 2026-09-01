import { describe, expect, it } from "vitest";

import {
  addCountVectors,
  countBodyCharacters,
  countCreativeWords,
  countMarkdown,
  subtractCountVectors,
  type CountVector,
} from "../src/core/counting";

describe("markdown counting", () => {
  it("counts visible Chinese, Latin words, and number units while ignoring Markdown-only content", () => {
    const markdown = [
      "---",
      "title: ignored",
      "---",
      "## **你好，world！** [回家](chapter-02.md) 2026 😊",
      "",
      "`inline code` and ![图片](image.png)",
      "",
      "<!-- hidden comment -->",
      "```ts",
      "const hidden = 123;",
      "```",
      "正文 ^note-id",
    ].join("\n");

    expect(countCreativeWords(markdown)).toBe(9);
    expect(countMarkdown(markdown)).toMatchObject({
      hanzi: 6,
      latinWords: 2,
      numbers: 1,
      punctuation: 2,
    });
  });

  it("counts body characters as Unicode code points after removing YAML and whitespace only", () => {
    const markdown = "---\ntitle: ignored\n---\n# A **你**!";

    // # A **你**! => #, A, *, *, 你, *, *, !
    expect(countBodyCharacters(markdown)).toBe(8);
    expect(countBodyCharacters("😀 👍🏽")).toBe(3);
  });

  it("uses visible aliases for wiki links and reference links, but excludes reference images and definitions", () => {
    const markdown = [
      "![图片][asset] [链接][ref] [[目标|别名]] [[章节]]",
      "[asset]: image.png",
      "[ref]: chapter-02.md",
    ].join("\n");

    // 链接 (2) + 别名 (2) + 章节 (2).
    expect(countCreativeWords(markdown)).toBe(6);
  });

  it("keeps punctuation as a component even when an apostrophe joins one Latin word", () => {
    expect(countMarkdown("don't, 123")).toMatchObject({
      latinWords: 1,
      numbers: 1,
      punctuation: 2,
    });
  });

  it("excludes indented Markdown code blocks as well as fenced code", () => {
    expect(countCreativeWords("正文\n\n    hidden 123\n\n尾部")).toBe(4);
  });

  it("adds and subtracts every CountVector component without mutating inputs", () => {
    const left = countMarkdown("你好 12");
    const right = countMarkdown("world!");

    const sum = addCountVectors(left, right);
    const difference = subtractCountVectors(sum, right);

    expect(difference).toEqual(left);
    expect(left).toEqual(countMarkdown("你好 12"));
    expect(right).toEqual(countMarkdown("world!"));
  });

  it("supports negative component values when subtracting a larger vector", () => {
    const zero: CountVector = {
      hanzi: 0,
      latinWords: 0,
      numbers: 0,
      punctuation: 0,
      visibleCharacters: 0,
      rawNonWhitespace: 0,
    };

    expect(subtractCountVectors(zero, countMarkdown("你"))).toMatchObject({ hanzi: -1 });
  });
});
