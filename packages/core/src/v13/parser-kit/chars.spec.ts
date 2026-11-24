import { describe, expect, it } from 'vitest';
import {
  charTable,
  codePointEnd,
  hasClass,
  isBlank,
  isDigit,
  isHex,
  isLetter,
  isLineEnd,
  isSpace,
  isUnicodeLetter,
  isWord,
} from './index.js';

const code = (s: string) => s.charCodeAt(0);

describe('CharClass', () => {
  it('builds a Uint8Array(128) bit table from flag/char pairs', () => {
    const ID = 1;
    const PUNCT = 2;
    const table = charTable([ID, 'abc_'], [PUNCT, '-_']);
    expect(table).toBeInstanceOf(Uint8Array);
    expect(table.length).toBe(128);
    expect(hasClass(table, code('a'), ID)).toBe(true);
    expect(hasClass(table, code('-'), ID)).toBe(false);
    expect(hasClass(table, code('_'), ID | PUNCT)).toBe(true);
    expect(hasClass(table, code('_'), PUNCT)).toBe(true);
    expect(hasClass(table, code('z'), ID)).toBe(false);
  });

  it('answers false for non-ASCII codes and NaN (past the end of a string)', () => {
    const table = charTable([1, 'a']);
    expect(hasClass(table, 0xe9, 1)).toBe(false);
    expect(hasClass(table, 'a'.charCodeAt(5), 1)).toBe(false);
  });

  it('rejects non-ASCII characters in a table spec', () => {
    expect(() => charTable([1, 'é'])).toThrow(RangeError);
  });

  it('has the ASCII predicates lexers need', () => {
    expect([' ', '\t', '\n', '\v', '\f', '\r', ' ', '　', '﻿'].every((c) => isSpace(code(c)))).toBe(
      true
    );
    expect(isSpace(code('a'))).toBe(false);
    expect(isBlank(code(' '))).toBe(true);
    expect(isBlank(code('\n'))).toBe(false);
    expect(['\n', '\r', ' ', ' '].every((c) => isLineEnd(code(c)))).toBe(true);
    expect(isLineEnd(code(' '))).toBe(false);
    expect(isDigit(code('7')) && !isDigit(code('a'))).toBe(true);
    expect(isLetter(code('Q')) && !isLetter(code('1'))).toBe(true);
    expect(isHex(code('f')) && isHex(code('F')) && !isHex(code('g'))).toBe(true);
    expect(isWord(code('_')) && isWord(code('9')) && !isWord(code('-'))).toBe(true);
  });

  it('knows the Unicode id letters of v12 flow.jison UNICODE_TEXT', () => {
    // Inside the class (first, last and assorted ranges of flow.jison).
    for (const c of ['ª', 'µ', 'À', 'ö', 'ø', 'Ω', 'я', 'א', 'ﾾ', 'ￜ', '中']) {
      expect(isUnicodeLetter(code(c)), c).toBe(true);
    }
    // Outside: ASCII, × and ÷ (gaps), punctuation, emoji halves, the end of the BMP.
    for (const c of ['a', 'Z', '×', '÷', '·', '—', '\ud83d', '￝']) {
      expect(isUnicodeLetter(code(c)), c).toBe(false);
    }
    expect(isUnicodeLetter(Number.NaN)).toBe(false);
  });
});

describe('codePointEnd', () => {
  it('steps over a whole surrogate pair', () => {
    expect(codePointEnd('a😀b', 1)).toBe(3);
    expect(codePointEnd('😀', 0)).toBe(2);
  });

  it('steps one code unit otherwise', () => {
    expect(codePointEnd('ab', 0)).toBe(1);
    expect(codePointEnd('é', 0)).toBe(1);
    // A lone high surrogate, at the end or before a non-surrogate; a lone low surrogate.
    expect(codePointEnd('\ud83d', 0)).toBe(1);
    expect(codePointEnd('\ud83dx', 0)).toBe(1);
    expect(codePointEnd('\ude00', 0)).toBe(1);
    expect(codePointEnd('', 0)).toBe(1);
  });
});
