/**
 * `%%{name: args}%%` directives (DESIGN §4.1). They are located and read here and left in
 * place; lexers skip them as `Directive` trivia. Merging `init` arguments into config, moving
 * `config` to the diagram's section and the secure-key filter belong to config resolution.
 *
 * v12 (`utils.ts` `directiveRegex`, `detectDirective`) finds directives anywhere in the text
 * after the front matter, ends each at the first `}%%`, takes a bare word as a string argument
 * and otherwise `JSON.parse`s the argument after swapping every `'` for `"`. The reader below
 * gives the same values without the swap and with ranges.
 */
import {
  BACKSLASH,
  COLON,
  CR,
  DIGIT_0,
  DIGIT_9,
  DQUOTE,
  LF,
  SPACE,
  APOSTROPHE,
} from '../parser-kit/char-codes.js';
import { isWord } from '../parser-kit/chars.js';
import type { Diagnostics } from '../parser-kit/diagnostics.js';
import type { Range } from '../parser-kit/positions.js';
import { lineEnd } from '../parser-kit/scanner.js';

export type DirectiveKind = 'init' | 'wrap' | 'other';

export interface Directive {
  /** `init` for `init` and `initialize`, `wrap`, or `other` for any other name. */
  kind: DirectiveKind;
  /** The name as written; a `%%{` with no word after it is not a directive (v12). */
  name: string;
  /** From `%%{` to the end of `}%%`; an unclosed directive ends at the end of its line. */
  range: Range;
  /** The argument text after the name and optional `:`, trimmed. */
  argsRange?: Range;
  /** The parsed argument: a JSON value, or a string for a bare word. Absent when invalid. */
  args?: unknown;
}

/** Maximum nesting of arrays and objects in a directive argument. */
export const MAX_DIRECTIVE_DEPTH = 64;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const DIRECTIVE_KINDS: ReadonlyMap<string, DirectiveKind> = new Map([
  ['init', 'init'],
  ['initialize', 'init'],
  ['wrap', 'wrap'],
]);

function isJsonSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/** Find and read every directive in `src` from `from` on. */
export function scanDirectives(src: string, from: number, diagnostics: Diagnostics): Directive[] {
  const out: Directive[] = [];
  // Each search result is kept while later openers are still before it, and once a search for
  // `}%%` fails no later opener can close either: the scan stays linear.
  let closable = true;
  let close = -1;
  let eol = -1;
  let at = src.indexOf('%%{', from);
  while (at !== -1) {
    if (closable && close < at + 3) {
      close = src.indexOf('}%%', at + 3);
      closable = close !== -1;
    }
    if (!closable && eol < at) eol = lineEnd(src, at);
    // An unclosed directive ends at the end of its line; its name must be inside it.
    const contentEnd = closable ? close : eol;
    const name = nameAt(src, at, contentEnd);
    // v12 directiveRegex needs a word after `%%{` and blanks; anything else stays text.
    if (name.start === name.end) {
      at = src.indexOf('%%{', at + 3);
      continue;
    }
    if (!closable) {
      diagnostics.error(
        'UNCLOSED_DIRECTIVE',
        'This directive is never closed. Add `}%%` after it.',
        { start: at, end: at + 3 }
      );
      out.push(read(src, at, name, contentEnd, false, diagnostics));
      at = src.indexOf('%%{', contentEnd);
    } else {
      out.push(read(src, at, name, close, true, diagnostics));
      at = src.indexOf('%%{', close + 3);
    }
  }
  return out;
}

/** The name after the `%%{` at `open` and any blanks, up to `contentEnd`; empty if none. */
function nameAt(src: string, open: number, contentEnd: number): Range {
  let i = open + 3;
  while (i < contentEnd && isJsonSpace(src.charCodeAt(i))) i++;
  const start = i;
  while (i < contentEnd && isWord(src.charCodeAt(i))) i++;
  return { start, end: i };
}

function read(
  src: string,
  open: number,
  nameRange: Range,
  contentEnd: number,
  closed: boolean,
  diagnostics: Diagnostics
): Directive {
  const end = closed ? contentEnd + 3 : contentEnd;
  const name = src.slice(nameRange.start, nameRange.end);
  const kind: DirectiveKind = DIRECTIVE_KINDS.get(name) ?? 'other';
  const directive: Directive = { kind, name, range: { start: open, end } };

  let a = nameRange.end;
  while (a < contentEnd && isJsonSpace(src.charCodeAt(a))) a++;
  if (src.charCodeAt(a) === COLON && a < contentEnd) a++;
  while (a < contentEnd && isJsonSpace(src.charCodeAt(a))) a++;
  let b = contentEnd;
  while (b > a && isJsonSpace(src.charCodeAt(b - 1))) b--;
  if (b <= a) return directive;
  directive.argsRange = { start: a, end: b };
  if (!closed) return directive;

  let word = true;
  for (let k = a; k < b && word; k++) word = isWord(src.charCodeAt(k));
  if (word) {
    directive.args = src.slice(a, b);
    return directive;
  }
  const reader = new JsonReader(src, b, name, diagnostics);
  try {
    const [value, next] = reader.value(a, 1);
    if (next < b) reader.fail('unexpected text after the value', reader.skip(next));
    directive.args = value;
  } catch (err) {
    if (!(err instanceof JsonError)) throw err;
    diagnostics.warning(err.code, err.message, { start: err.at, end: err.at + 1 });
  }
  return directive;
}

// Thrown inside the reader and turned into a warning. Not an Error: no stack trace.
class JsonError {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly at: number
  ) {}
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  // v12 swaps `'` for `"` before JSON.parse, so `\'` reads as `"`.
  "'": '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/**
 * Strict JSON, with one v12 quirk kept: `'` and `"` are the same quote character, so a string
 * may open and close with either. Duplicate keys keep the last value, as `JSON.parse` does.
 */
class JsonReader {
  constructor(
    private readonly src: string,
    private readonly end: number,
    private readonly name: string,
    private readonly diagnostics: Diagnostics
  ) {}

  fail(detail: string, at: number, code = 'INVALID_DIRECTIVE'): never {
    throw new JsonError(code, `The \`${this.name}\` directive is not valid JSON: ${detail}.`, at);
  }

  private got(at: number): string {
    return at >= this.end ? 'the end of the directive' : `\`${this.src[at] ?? ''}\``;
  }

  skip(at: number): number {
    while (at < this.end && isJsonSpace(this.src.charCodeAt(at))) at++;
    return at;
  }

  private isQuote(at: number): boolean {
    const c = this.src.charCodeAt(at);
    return at < this.end && (c === DQUOTE || c === APOSTROPHE);
  }

  value(at: number, depth: number): [unknown, number] {
    at = this.skip(at);
    const s = this.src;
    const c = s[at];
    if (at < this.end && (c === '{' || c === '[')) {
      if (depth > MAX_DIRECTIVE_DEPTH) {
        this.fail(`nesting is deeper than ${MAX_DIRECTIVE_DEPTH} levels`, at, 'DIRECTIVE_TOO_DEEP');
      }
      return c === '{' ? this.object(at, depth) : this.array(at, depth);
    }
    if (this.isQuote(at)) return this.string(at);
    for (const [word, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ] as const) {
      if (s.startsWith(word, at) && at + word.length <= this.end) return [value, at + word.length];
    }
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return this.number(at);
    return this.fail(`expected a value, got ${this.got(at)}`, at);
  }

  private object(open: number, depth: number): [unknown, number] {
    const out: Record<string, unknown> = {};
    let at = this.skip(open + 1);
    if (this.src[at] === '}' && at < this.end) return [out, at + 1];
    for (;;) {
      at = this.skip(at);
      if (!this.isQuote(at)) this.fail(`expected a string key, got ${this.got(at)}`, at);
      const keyAt = at;
      let key: string;
      [key, at] = this.string(at);
      at = this.skip(at);
      if (this.src[at] !== ':' || at >= this.end)
        this.fail(`expected \`:\`, got ${this.got(at)}`, at);
      let value: unknown;
      [value, at] = this.value(at + 1, depth + 1);
      if (UNSAFE_KEYS.has(key)) {
        this.diagnostics.warning(
          'DIRECTIVE_UNSAFE_KEY',
          `The key \`${key}\` is not allowed and was ignored.`,
          { start: keyAt, end: keyAt + key.length + 2 }
        );
      } else {
        out[key] = value;
      }
      at = this.skip(at);
      const c = at < this.end ? this.src[at] : undefined;
      if (c === '}') return [out, at + 1];
      if (c !== ',') this.fail(`expected \`,\` or \`}\`, got ${this.got(at)}`, at);
      at++;
    }
  }

  private array(open: number, depth: number): [unknown, number] {
    const out: unknown[] = [];
    let at = this.skip(open + 1);
    if (this.src[at] === ']' && at < this.end) return [out, at + 1];
    for (;;) {
      let value: unknown;
      [value, at] = this.value(at, depth + 1);
      out.push(value);
      at = this.skip(at);
      const c = at < this.end ? this.src[at] : undefined;
      if (c === ']') return [out, at + 1];
      if (c !== ',') this.fail(`expected \`,\` or \`]\`, got ${this.got(at)}`, at);
      at++;
    }
  }

  private string(open: number): [string, number] {
    const s = this.src;
    let out = '';
    let at = open + 1;
    let run = at;
    for (;;) {
      if (at >= this.end) this.fail('the string is never closed', open);
      const c = s.charCodeAt(at);
      if (c === DQUOTE || c === APOSTROPHE) return [out + s.slice(run, at), at + 1];
      if (c === LF || c === CR) this.fail('line breaks in strings must be written as `\\n`', at);
      if (c < SPACE) this.fail('control characters in strings must be escaped', at);
      if (c !== BACKSLASH) {
        at++;
        continue;
      }
      out += s.slice(run, at);
      const e = s[at + 1] ?? '';
      if (e === 'u') {
        const hex = s.slice(at + 2, at + 6);
        if (at + 6 > this.end || !/^[0-9a-fA-F]{4}$/.test(hex)) {
          this.fail('`\\u` needs four hex digits', at);
        }
        out += String.fromCharCode(parseInt(hex, 16));
        at += 6;
      } else if (e in ESCAPES && at + 1 < this.end) {
        out += ESCAPES[e];
        at += 2;
      } else {
        this.fail('unknown escape sequence', at);
      }
      run = at;
    }
  }

  private number(start: number): [number, number] {
    const s = this.src;
    const digits = (at: number) => {
      while (at < this.end && s.charCodeAt(at) >= DIGIT_0 && s.charCodeAt(at) <= DIGIT_9) at++;
      return at;
    };
    let at = start;
    if (s[at] === '-') at++;
    const intStart = at;
    if (s[at] === '0') at++;
    else at = digits(at);
    if (at === intStart || at > this.end) this.fail('expected a digit', at);
    if (s[at] === '.' && at < this.end) {
      const frac = digits(at + 1);
      if (frac === at + 1) this.fail('expected a digit', frac);
      at = frac;
    }
    if ((s[at] === 'e' || s[at] === 'E') && at < this.end) {
      at++;
      if ((s[at] === '+' || s[at] === '-') && at < this.end) at++;
      const exp = digits(at);
      if (exp === at) this.fail('expected a digit', at);
      at = exp;
    }
    return [Number(s.slice(start, at)), at];
  }
}
