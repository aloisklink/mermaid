// D597: this file stays whole as a Pele port; its `complexity` entries in eslint-suppressions.json are deliberate.
/**
 * Text helpers of the YAML reader (`yaml.ts`): pure functions over one line or one scalar's
 * text, with no reader state.
 */
import {
  ASCII_MAX,
  BMP_LAST,
  C1_LAST,
  CR,
  HIGH_SURROGATE_FIRST,
  HIGH_SURROGATE_LAST,
  LF,
  LOW_SURROGATE_FIRST,
  LOW_SURROGATE_LAST,
  NEL,
  REVERSED_BOM,
  SPACE,
  TAB,
} from '../parser-kit/char-codes.js';
import { lineEnd } from '../parser-kit/scanner.js';

const RE_KEY_START = /[\s#:,[\]{}&*!|>'"%@`]/;

export function isSpaceOrBreak(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

export function isSeqItem(line: string): boolean {
  return line === '-' || line.startsWith('- ');
}

/** `\r\n` and `\r` read as `\n` inside scalar text (offsets are not taken from it). */
export function lf(text: string): string {
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

// Splits `key: rest` at the start of a line. Returns the raw key and the offset where the value starts.
export function splitKey(line: string): { key: string; length: number } | null {
  const first = line[0];
  let end: number;
  let colon: number;
  if (first === '"' || first === "'") {
    let i = 1;
    for (;;) {
      if (i >= line.length) return null;
      const c = line[i];
      if (first === '"' && c === '\\') {
        i += 2;
      } else if (c === first) {
        if (first === '"' || line[i + 1] !== "'") break;
        i += 2;
      } else {
        i++;
      }
    }
    end = i + 1;
    colon = end;
    while (isSpaceOrBreak(line[colon])) colon++;
    if (line[colon] !== ':') return null;
  } else {
    if (first === undefined) return null;
    // `-`, `?` and `:` start a plain key when a non-blank follows (js-yaml readPlainScalar).
    const indicator = first === '-' || first === '?' || first === ':';
    if (!indicator && RE_KEY_START.test(first)) return null;
    if (
      indicator &&
      (line.length < 2 || isSpaceOrBreak(line[1]) || line[1] === ':' || line[1] === '#')
    ) {
      return null;
    }
    // js-yaml: the key ends at a `:` followed by a blank or the line end; `a:b` and `a#b`
    // are part of it, and `#` starts a comment only after a blank.
    colon = 1;
    while (colon < line.length) {
      const c = line[colon];
      if (c === ':' && (colon + 1 >= line.length || isSpaceOrBreak(line[colon + 1]))) break;
      if (c === '#' && isSpaceOrBreak(line[colon - 1])) return null;
      colon++;
    }
    if (line[colon] !== ':') return null;
    end = colon;
    while (isSpaceOrBreak(line[end - 1])) end--;
  }
  let length = colon + 1;
  if (length < line.length && !isSpaceOrBreak(line[length])) return null;
  while (isSpaceOrBreak(line[length])) length++;
  return { key: line.slice(0, end), length };
}

export const HEX_ESCAPE_LENGTH: Readonly<Record<'x' | 'u' | 'U', number>> = { x: 2, u: 4, U: 8 };

export const ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\x85',
  _: '\xa0',
  L: ' ',
  P: ' ',
};

// Folds the line breaks of a scalar: blanks around a break go, one break becomes a space, and
// each further break stays. The lines are trimmed by hand, because a pattern for blanks before
// a line break rescans a long run of blanks from every one of them.
export function fold(raw: string): string {
  const text = lf(raw);
  if (!text.includes('\n')) return text;
  const lines = text.split('\n');
  const last = lines.length - 1;
  for (let i = 0; i <= last; i++) {
    const line = lines[i] ?? '';
    let from = 0;
    let to = line.length;
    if (i > 0) {
      while (from < to && (line.charCodeAt(from) === SPACE || line.charCodeAt(from) === TAB))
        from++;
    }
    if (i < last) {
      while (to > from && (line.charCodeAt(to - 1) === SPACE || line.charCodeAt(to - 1) === TAB))
        to--;
    }
    lines[i] = line.slice(from, to);
  }
  return lines
    .join('\n')
    .replace(/\n+/g, (m) => (m.length === 1 ? ' ' : '\n'.repeat(m.length - 1)));
}

export function stripComment(s: string): string {
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) {
      return s.slice(0, i);
    }
  }
  return s;
}

/**
 * Offset of a `:` that is followed by a blank or ends `s` (js-yaml reads a mapping entry
 * there), or -1. With `value`, `s` starts a value, and a quoted or flow start is not plain.
 */
export function mappingIndicator(s: string, value: boolean): number {
  const first = s[0];
  if (value && (first === '"' || first === "'" || first === '{' || first === '[')) return -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ':' && (i + 1 === s.length || isSpaceOrBreak(s[i + 1]))) return i;
  }
  return -1;
}

/**
 * The first character in `[start, end)` that js-yaml's PATTERN_NON_PRINTABLE refuses (C0/C1
 * controls but tab, LF, CR and NEL; U+FFFE/U+FFFF; unpaired surrogates), or -1. A loop over
 * the range only: a regex would scan on to the end of the whole source on every call.
 */
export function nonPrintable(src: string, start: number, end: number): number {
  for (let i = start; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c < SPACE) {
      if (c !== TAB && c !== LF && c !== CR) return i;
    } else if (c >= ASCII_MAX && c <= C1_LAST) {
      if (c !== NEL) return i;
    } else if (c === REVERSED_BOM || c === BMP_LAST) {
      return i;
    } else if (c >= HIGH_SURROGATE_FIRST && c <= HIGH_SURROGATE_LAST) {
      const next = i + 1 < end ? src.charCodeAt(i + 1) : 0;
      if (next < LOW_SURROGATE_FIRST || next > LOW_SURROGATE_LAST) return i;
      i++;
    } else if (c >= LOW_SURROGATE_FIRST && c <= LOW_SURROGATE_LAST) {
      return i;
    }
  }
  return -1;
}

export function leading(s: string): number {
  return s.length - s.trimStart().length;
}

/**
 * The offset after the quoted value opening at `at` in `s` (`"…"` with `\\` escapes, `'…'`
 * with `''` for a quote), or -1 when it is not closed before `limit`.
 */
export function quotedEnd(s: string, at: number, limit: number): number {
  const q = s[at];
  for (let i = at + 1; i < limit; i++) {
    if (q === '"' && s[i] === '\\') i++;
    else if (s[i] === q && q === "'" && s[i + 1] === q) i++;
    else if (s[i] === q) return i + 1;
  }
  return -1;
}

/**
 * Tree mode, inside a flow collection of `s`: from `pos`, the offset of the next `,` or closing
 * bracket outside nested collections, quoted values and comments (or `limit`). A quote that is
 * never closed is read as a plain character. `start` is where the YAML text starts.
 */
export function flowResync(s: string, pos: number, limit: number, start: number): number {
  let depth = 0;
  for (; pos < limit; pos++) {
    const c = s[pos];
    if (c === '"' || c === "'") {
      const end = quotedEnd(s, pos, limit);
      if (end !== -1) pos = end - 1;
    } else if (c === '#' && (pos === start || /\s/.test(s[pos - 1] ?? ''))) {
      pos = Math.min(lineEnd(s, pos), limit) - 1;
    } else if (c === '{' || c === '[') {
      depth++;
    } else if (c === '}' || c === ']') {
      if (depth === 0) return pos;
      depth--;
    } else if (c === ',' && depth === 0) {
      return pos;
    }
  }
  return limit;
}

/** `end` moved back over the blanks before it in `s`, not before `floor`. */
export function trimBack(s: string, end: number, floor: number): number {
  while (end > floor && isSpaceOrBreak(s[end - 1])) end--;
  return end;
}
