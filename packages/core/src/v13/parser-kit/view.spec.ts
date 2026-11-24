import { describe, expect, it } from 'vitest';
import { kindSet } from './cursor.js';
import { Kind, TokenWriter } from './tokens.js';
import { significantTokens, skipTo } from './view.js';

const WORD = 16;
const stream = (kinds: number[]) => {
  const w = new TokenWriter();
  kinds.forEach((k, i) => w.push(k, i, i + 1));
  return w.finish('x'.repeat(kinds.length));
};

describe('significantTokens', () => {
  it('drops trivia and keeps offsets', () => {
    const view = significantTokens(stream([WORD, Kind.Comment, WORD, Kind.Directive]));
    expect([...view.kind]).toEqual([WORD, WORD, Kind.EOF]);
    expect([...view.start]).toEqual([0, 2, 4]);
  });

  it('returns a stream without trivia as it is', () => {
    const s = stream([WORD, Kind.Newline]);
    expect(significantTokens(s)).toBe(s);
  });
});

describe('skipTo', () => {
  it('stops at the first boundary, or the end', () => {
    const view = significantTokens(stream([WORD, WORD, Kind.Newline, WORD]));
    expect(skipTo(view, 0, kindSet(Kind.Newline))).toBe(2);
    expect(skipTo(view, 2, kindSet(Kind.Newline))).toBe(2);
    expect(skipTo(view, 3, kindSet(Kind.Newline))).toBe(view.length);
  });
});
