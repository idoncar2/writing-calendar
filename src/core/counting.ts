/** The independent count components kept for every Markdown snapshot/activity. */
export interface CountVector {
  /** Han characters in visible Markdown text. */
  hanzi: number;
  /** Runs of Latin-script letters in visible Markdown text. */
  latinWords: number;
  /** Runs of decimal digits in visible Markdown text. */
  numbers: number;
  /** Unicode punctuation in visible Markdown text. */
  punctuation: number;
  /** Non-whitespace Unicode code points in visible Markdown text. */
  visibleCharacters: number;
  /** Non-whitespace Unicode code points after YAML removal. */
  rawNonWhitespace: number;
}

const HAN_CHARACTER = /^\p{Script=Han}$/u;
const LATIN_CHARACTER = /^\p{Script=Latin}$/u;
const DECIMAL_NUMBER = /^\p{Decimal_Number}$/u;
const PUNCTUATION = /^\p{P}$/u;
const MARK = /^\p{M}$/u;
const WHITESPACE = /^\s$/u;

/** Return a fresh vector with every component set to zero. */
export function emptyCountVector(): CountVector {
  return {
    hanzi: 0,
    latinWords: 0,
    numbers: 0,
    punctuation: 0,
    visibleCharacters: 0,
    rawNonWhitespace: 0,
  };
}

/** Add any number of vectors without changing any input vector. */
export function addCountVectors(...vectors: readonly CountVector[]): CountVector {
  const result = emptyCountVector();
  for (const vector of vectors) {
    result.hanzi += vector.hanzi;
    result.latinWords += vector.latinWords;
    result.numbers += vector.numbers;
    result.punctuation += vector.punctuation;
    result.visibleCharacters += vector.visibleCharacters;
    result.rawNonWhitespace += vector.rawNonWhitespace;
  }
  return result;
}

/** Subtract the right-hand vector component-by-component. */
export function subtractCountVectors(left: CountVector, right: CountVector): CountVector {
  return {
    hanzi: left.hanzi - right.hanzi,
    latinWords: left.latinWords - right.latinWords,
    numbers: left.numbers - right.numbers,
    punctuation: left.punctuation - right.punctuation,
    visibleCharacters: left.visibleCharacters - right.visibleCharacters,
    rawNonWhitespace: left.rawNonWhitespace - right.rawNonWhitespace,
  };
}

/** Count a Markdown document into all reusable components. */
export function countMarkdown(markdown: string): CountVector {
  const withoutYaml = stripYamlFrontMatter(markdown);
  const visible = visibleMarkdownText(withoutYaml);
  const result = countVisibleText(visible);
  result.rawNonWhitespace = countNonWhitespaceCodePoints(withoutYaml);
  return result;
}

/** Count the default creative-writing units, or derive them from a vector. */
export function countCreativeWords(value: string | CountVector): number {
  const vector = typeof value === "string" ? countMarkdown(value) : value;
  return vector.hanzi + vector.latinWords + vector.numbers;
}

/** Count body characters after YAML and all whitespace are removed. */
export function countBodyCharacters(value: string | CountVector): number {
  return typeof value === "string" ? countNonWhitespaceCodePoints(stripYamlFrontMatter(value)) : value.rawNonWhitespace;
}

// Short aliases make the two display modes convenient to consume at call sites.
export const creativeWordCount = countCreativeWords;
export const bodyCharacterCount = countBodyCharacters;

function stripYamlFrontMatter(markdown: string): string {
  const lines = markdown.split(/\r?\n/u);
  const firstLine = (lines[0] ?? "").replace(/^\uFEFF/u, "");
  if (!/^\s*---\s*$/u.test(firstLine)) {
    return markdown;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (/^\s*(?:---|\.\.\.)\s*$/u.test(lines[index] ?? "")) {
      return lines.slice(index + 1).join("\n");
    }
  }

  // An opening marker without a closing marker is not treated as front matter.
  return markdown;
}

function visibleMarkdownText(markdown: string): string {
  let text = removeFencedCode(markdown);

  // Order matters: images must be removed before ordinary links, and comments
  // before HTML tags. Each replacement leaves a boundary so words cannot join
  // across removed content.
  text = text.replace(/<!--[\s\S]*?-->/gu, "\n");
  text = text.replace(/%%[\s\S]*?%%/gu, "\n");
  text = text.replace(/!\[\[[^\]\n]*\]\]/gu, "\n");
  text = text.replace(/!\[[^\]\n]*\]\([^\n]*?\)/gu, "\n");
  text = text.replace(/!\[[^\]\n]*\]\[[^\]\n]*\]/gu, "\n");
  text = text.replace(/<img\b[^>]*>/giu, "\n");
  text = text.replace(/`+[^`\n]*`+/gu, "\n");

  // Reference definitions are metadata, not visible prose or link labels.
  text = text.replace(/^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*$/gmu, "");

  text = text.replace(/\[\[[^\]|\n]+\|([^\]\n]+)\]\]/gu, "$1");
  text = text.replace(/\[\[([^\]|\n]+)\]\]/gu, "$1");
  text = text.replace(/\[([^\]\n]*)\]\([^\n]*?\)/gu, "$1");
  text = text.replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/gu, "$1");
  text = text.replace(/<[^>\n]+>/gu, "\n");
  text = text.replace(/\^[A-Za-z0-9][A-Za-z0-9_-]*/gu, "\n");

  // Remove Markdown delimiters while retaining punctuation that belongs to
  // visible prose. Escaped delimiters are unescaped first.
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!>])/gu, "$1");
  text = text.replace(/(^|\n)[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-+*][ \t]+|\d{1,9}[.)][ \t]+)/gu, "$1");
  text = text.replace(/(?:\*\*|__|~~)/gu, "");
  text = text.replace(/(^|[^\w])[*_](?=\S)/gmu, "$1");
  text = text.replace(/(\S)[*_](?!\w)/gu, "$1");
  text = text.replace(/[\[\]]/gu, "");

  return text;
}

function removeFencedCode(markdown: string): string {
  const lines = markdown.split(/\r?\n/u);
  let fenceCharacter: "`" | "~" | undefined;
  const visible: string[] = [];

  for (const line of lines) {
    const opening = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (fenceCharacter === undefined) {
      if (opening !== null) {
        fenceCharacter = opening[1]?.startsWith("~") ? "~" : "`";
        visible.push("");
      } else {
        visible.push(line);
      }
      continue;
    }

    const closing = new RegExp(`^ {0,3}${fenceCharacter}{3,}`);
    if (closing.test(line)) {
      fenceCharacter = undefined;
    }
    visible.push("");
  }

  return visible.map((line) => /^(?: {4}|\t)/u.test(line) ? "" : line).join("\n");
}

function countVisibleText(text: string): CountVector {
  const result = emptyCountVector();
  const codePoints = Array.from(text);
  result.visibleCharacters = codePoints.filter((character) => !WHITESPACE.test(character)).length;
  result.punctuation = codePoints.filter((character) => PUNCTUATION.test(character)).length;

  let index = 0;
  while (index < codePoints.length) {
    const character = codePoints[index] ?? "";
    if (HAN_CHARACTER.test(character)) {
      result.hanzi += 1;
      index += 1;
      continue;
    }
    if (LATIN_CHARACTER.test(character)) {
      result.latinWords += 1;
      index = consumeLatinWord(codePoints, index);
      continue;
    }
    if (DECIMAL_NUMBER.test(character)) {
      result.numbers += 1;
      index = consumeNumber(codePoints, index);
      continue;
    }
    index += 1;
  }

  return result;
}

function consumeLatinWord(codePoints: string[], start: number): number {
  let index = start;
  while (index < codePoints.length) {
    if (LATIN_CHARACTER.test(codePoints[index] ?? "")) {
      index += 1;
      continue;
    }
    if (MARK.test(codePoints[index] ?? "") && index > start) {
      index += 1;
      continue;
    }
    const apostrophe = codePoints[index] === "'" || codePoints[index] === "’";
    const nextIsLatin = LATIN_CHARACTER.test(codePoints[index + 1] ?? "");
    if (apostrophe && nextIsLatin) {
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function consumeNumber(codePoints: string[], start: number): number {
  let index = start;
  while (DECIMAL_NUMBER.test(codePoints[index] ?? "")) {
    index += 1;
  }
  return index;
}

function countNonWhitespaceCodePoints(text: string): number {
  return Array.from(text).filter((character) => !WHITESPACE.test(character)).length;
}
