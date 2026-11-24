/**
 * Character classes on UTF-16 code units, as lexers read them with `charCodeAt`. Past the
 * end of a string the code is NaN, which is in no class. ASCII predicates ported from Pele's
 * `util/chars.ts`, the Unicode table approach from Pele's `util/unicode.ts`
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
 */
import {
  ASCII_MAX,
  HIGH_SURROGATE_FIRST,
  HIGH_SURROGATE_LAST,
  LOW_SURROGATE_FIRST,
  LOW_SURROGATE_LAST,
} from './char-codes.js';
import { UNICODE_LETTERS } from './unicode-table.js';

/**
 * Build a per-lexer ASCII class table: `Uint8Array(128)` where each entry is the OR of the
 * flags (bit values 1, 2, 4, …, 128) of the classes that contain that character.
 *
 * ```ts
 * const ID = 1, OP = 2;
 * const T = charTable([ID, 'abcdefghijklmnopqrstuvwxyz_'], [OP, '-=.>']);
 * if (hasClass(T, src.charCodeAt(i), ID)) …
 * ```
 */
export function charTable(
  ...classes: readonly (readonly [flag: number, chars: string])[]
): Uint8Array {
  const table = new Uint8Array(128);
  for (const [flag, chars] of classes) {
    for (let i = 0; i < chars.length; i++) {
      const c = chars.charCodeAt(i);
      if (c > ASCII_MAX) throw new RangeError(`charTable: non-ASCII character ${chars[i]}`);
      table[c] = (table[c] ?? 0) | flag;
    }
  }
  return table;
}

/** True when `code` is ASCII and has any of the bits in `flags` set in `table`. */
export function hasClass(table: Uint8Array, code: number, flags: number): boolean {
  return code < 128 && ((table[code] ?? 0) & flags) !== 0;
}

/** Whitespace as regex `\s` sees it. */
export function isSpace(c: number): boolean {
  if (c < 128) return c === 32 || (c >= 9 && c <= 13);
  return (
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

/** Space or tab. */
export function isBlank(c: number): boolean {
  return c === 32 || c === 9;
}

/** A line terminator: what regex `.` does not match. */
export function isLineEnd(c: number): boolean {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
}

export function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

/** ASCII letter. */
export function isLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

export function isHex(c: number): boolean {
  return isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

/** A character of regex `\w`. */
export function isWord(c: number): boolean {
  return isLetter(c) || isDigit(c) || c === 95;
}

/** Decoded once at load; read-only afterwards. Pairs `[start, end]`, inclusive, sorted. */
const LETTERS = /* @__PURE__ */ unpack(UNICODE_LETTERS);

function unpack(packed: string): Uint16Array {
  const parts = packed.split(' ');
  const out = new Uint16Array(parts.length);
  let prev = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const start = prev + parseInt(parts[i] ?? '', 36);
    prev = start + parseInt(parts[i + 1] ?? '', 36);
    out[i] = start;
    out[i + 1] = prev;
  }
  return out;
}

/** A non-ASCII letter that v12 flow.jison accepts in ids and text (`UNICODE_TEXT`). */
export function isUnicodeLetter(c: number): boolean {
  if (!(c >= 0xaa && c <= 0xffdc)) return false;
  let lo = 0;
  let hi = (LETTERS.length >> 1) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (c < (LETTERS[mid * 2] ?? 0)) hi = mid - 1;
    else if (c > (LETTERS[mid * 2 + 1] ?? 0)) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * The end of the code point at `text[i]`: `i + 2` on a surrogate pair, else `i + 1`. A lexer
 * that skips one bad character ends its error token here, so the token, and the diagnostic
 * on it, never splits an astral character (an emoji) in half.
 */
export function codePointEnd(text: string, i: number): number {
  const hi = text.charCodeAt(i);
  if (hi < HIGH_SURROGATE_FIRST || hi > HIGH_SURROGATE_LAST) return i + 1;
  const lo = text.charCodeAt(i + 1);
  return lo >= LOW_SURROGATE_FIRST && lo <= LOW_SURROGATE_LAST ? i + 2 : i + 1;
}
