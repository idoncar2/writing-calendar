import type { PropertyOperator, PropertyValue } from "./types";

export type AdvancedQueryScalar = string | number | boolean | null;

export type AdvancedQueryTerm =
  | { kind: "folder"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "extension"; value: string }
  | { kind: "filename"; value: string }
  | {
    kind: "property";
    key: string;
    operator: PropertyOperator;
    value?: PropertyValue;
  };

export type AdvancedQueryNode =
  | { kind: "term"; term: AdvancedQueryTerm }
  | { kind: "and"; left: AdvancedQueryNode; right: AdvancedQueryNode }
  | { kind: "or"; left: AdvancedQueryNode; right: AdvancedQueryNode }
  | { kind: "not"; expression: AdvancedQueryNode };

export class AdvancedQuerySyntaxError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message}（位置 ${position + 1}）`);
    this.name = "AdvancedQuerySyntaxError";
  }
}

type Token =
  | { type: "identifier"; value: string; position: number }
  | { type: "string"; value: string; position: number }
  | { type: "number"; value: number; position: number }
  | { type: "operator"; value: "=" | "!="; position: number }
  | { type: "open" | "close" | "open-bracket" | "close-bracket" | "comma" | "eof"; position: number };

function syntaxError(message: string, position: number): never {
  throw new AdvancedQuerySyntaxError(message, position);
}

function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const character = input[index] as string;
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (character === "(" || character === ")" || character === ",") {
      tokens.push({ type: character === "(" ? "open" : character === ")" ? "close" : "comma", position: index });
      index += 1;
      continue;
    }
    if (character === "[" || character === "]") {
      tokens.push({ type: character === "[" ? "open-bracket" : "close-bracket", position: index });
      index += 1;
      continue;
    }
    if (character === "=") {
      tokens.push({ type: "operator", value: "=", position: index });
      index += 1;
      continue;
    }
    if (character === "!" && input[index + 1] === "=") {
      tokens.push({ type: "operator", value: "!=", position: index });
      index += 2;
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      const position = index;
      index += 1;
      let value = "";
      while (index < input.length && input[index] !== quote) {
        if (input[index] === "\\") {
          const escaped = input[index + 1];
          if (escaped === undefined) syntaxError("字符串末尾缺少转义内容", index);
          const escapeMap: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          value += escapeMap[escaped] ?? escaped;
          index += 2;
        } else {
          value += input[index] as string;
          index += 1;
        }
      }
      if (input[index] !== quote) syntaxError("字符串没有结束引号", position);
      tokens.push({ type: "string", value, position });
      index += 1;
      continue;
    }
    const numeric = input.slice(index).match(/^-?(?:\d+\.?\d*|\.\d+)/u);
    if (numeric) {
      tokens.push({ type: "number", value: Number(numeric[0]), position: index });
      index += numeric[0].length;
      continue;
    }
    const identifier = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_-]*/u);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0], position: index });
      index += identifier[0].length;
      continue;
    }
    syntaxError(`无法识别字符“${character}”`, index);
  }
  tokens.push({ type: "eof", position: input.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): AdvancedQueryNode {
    const node = this.parseOr();
    if (this.current().type !== "eof") {
      syntaxError("此处应为 AND、OR、右括号或表达式结束", this.current().position);
    }
    return node;
  }

  private parseOr(): AdvancedQueryNode {
    let node = this.parseAnd();
    while (this.isKeyword("or")) {
      this.advance();
      node = { kind: "or", left: node, right: this.parseAnd() };
    }
    return node;
  }

  private parseAnd(): AdvancedQueryNode {
    let node = this.parseUnary();
    while (this.isKeyword("and")) {
      this.advance();
      node = { kind: "and", left: node, right: this.parseUnary() };
    }
    return node;
  }

  private parseUnary(): AdvancedQueryNode {
    if (this.isKeyword("not")) {
      this.advance();
      return { kind: "not", expression: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AdvancedQueryNode {
    if (this.current().type === "open") {
      this.advance();
      const expression = this.parseOr();
      this.expect("close", "缺少右括号");
      return expression;
    }
    return { kind: "term", term: this.parseTerm() };
  }

  private parseTerm(): AdvancedQueryTerm {
    const functionName = this.expect("identifier", "需要筛选函数，例如 folder(\"正文\")");
    const normalizedName = functionName.value.toLocaleLowerCase("en-US");
    this.expect("open", "筛选函数后缺少左括号");
    const argument = this.expect("string", "筛选函数的参数需要使用引号");
    this.expect("close", "筛选函数缺少右括号");

    switch (normalizedName) {
      case "folder":
      case "infolder":
        return { kind: "folder", value: argument.value };
      case "tag":
      case "hastag":
        return { kind: "tag", value: argument.value };
      case "extension":
      case "ext":
        return { kind: "extension", value: argument.value };
      case "filename":
      case "name":
        return { kind: "filename", value: argument.value };
      case "property":
      case "prop":
        return this.parsePropertyTerm(argument.value);
      default:
        syntaxError(`不支持的筛选函数“${functionName.value}”`, functionName.position);
    }
  }

  private parsePropertyTerm(key: string): AdvancedQueryTerm {
    const token = this.current();
    let operator: PropertyOperator;
    if (token.type === "operator") {
      operator = token.value === "=" ? "equals" : "not-equals";
      this.advance();
    } else if (this.isKeyword("contains")) {
      operator = "contains";
      this.advance();
    } else if (this.isKeyword("exists") || this.isKeyword("missing")) {
      operator = (token as Extract<Token, { type: "identifier" }>).value.toLocaleLowerCase("en-US") as
        Extract<PropertyOperator, "exists" | "missing">;
      this.advance();
      return { kind: "property", key, operator };
    } else {
      syntaxError("Properties 条件需要 =、!=、CONTAINS、EXISTS 或 MISSING", token.position);
    }
    return { kind: "property", key, operator, value: this.parsePropertyValue() };
  }

  private parsePropertyValue(): PropertyValue {
    if (this.current().type !== "open-bracket") return this.parseScalar();
    this.advance();
    const values: AdvancedQueryScalar[] = [];
    if (this.current().type === "close-bracket") {
      this.advance();
      return values;
    }
    while (true) {
      values.push(this.parseScalar());
      if (this.current().type === "close-bracket") {
        this.advance();
        return values;
      }
      this.expect("comma", "Properties 数组值之间需要逗号");
    }
  }

  private parseScalar(): AdvancedQueryScalar {
    const token = this.current();
    if (token.type === "string" || token.type === "number") {
      this.advance();
      return token.value;
    }
    if (token.type === "identifier") {
      const keyword = token.value.toLocaleLowerCase("en-US");
      if (keyword === "true" || keyword === "false") {
        this.advance();
        return keyword === "true";
      }
      if (keyword === "null") {
        this.advance();
        return null;
      }
    }
    syntaxError("Properties 条件值需要字符串、数字、true、false 或 null", token.position);
  }

  private current(): Token {
    return this.tokens[this.index] as Token;
  }

  private advance(): Token {
    const token = this.current();
    this.index += 1;
    return token;
  }

  private expect<T extends Token["type"]>(type: T, message: string): Extract<Token, { type: T }> {
    const token = this.current();
    if (token.type !== type) syntaxError(message, token.position);
    this.index += 1;
    return token as Extract<Token, { type: T }>;
  }

  private isKeyword(keyword: string): boolean {
    const token = this.current();
    return token.type === "identifier" && token.value.toLocaleLowerCase("en-US") === keyword;
  }
}

/** Parse the small, standalone Dataview-style expression language used by a scope. */
export function parseAdvancedQuery(input: string): AdvancedQueryNode {
  const trimmed = input.trim();
  if (!trimmed) throw new AdvancedQuerySyntaxError("高级筛选不能为空", 0);
  return new Parser(lex(trimmed)).parse();
}

/** Evaluate a parsed expression without coupling it to Obsidian or a specific index. */
export function evaluateAdvancedQuery<T>(
  node: AdvancedQueryNode,
  matchesTerm: (term: AdvancedQueryTerm) => boolean,
): boolean {
  switch (node.kind) {
    case "term":
      return matchesTerm(node.term);
    case "and":
      return evaluateAdvancedQuery(node.left, matchesTerm) && evaluateAdvancedQuery(node.right, matchesTerm);
    case "or":
      return evaluateAdvancedQuery(node.left, matchesTerm) || evaluateAdvancedQuery(node.right, matchesTerm);
    case "not":
      return !evaluateAdvancedQuery(node.expression, matchesTerm);
  }
}
