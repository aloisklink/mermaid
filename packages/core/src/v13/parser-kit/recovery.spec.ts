import { describe, expect, it } from 'vitest';
import { FIRST_DIAGRAM_KIND, Kind, kindSet, syncTo, TokenCursor, TokenWriter } from './index.js';
import type { TokenStream } from './index.js';

const Id = FIRST_DIAGRAM_KIND;
const Semi = FIRST_DIAGRAM_KIND + 1;
const Junk = FIRST_DIAGRAM_KIND + 2;

/** One token per char: letters Id, `;` Semi, `\n` Newline, ` ` Space, `%` Comment, else Junk. */
function lex(src: string): TokenStream {
  const w = new TokenWriter();
  for (let i = 0; i < src.length; i++) {
    const c = src[i] ?? '';
    const k = /[a-z]/.test(c)
      ? Id
      : c === ';'
        ? Semi
        : c === '\n'
          ? Kind.Newline
          : c === ' '
            ? Kind.Space
            : c === '%'
              ? Kind.Comment
              : Junk;
    w.push(k, i, i + 1);
  }
  return w.finish(src);
}

describe('TokenCursor', () => {
  it('skips trivia (spaces, comments, directives) but not newlines', () => {
    const c = new TokenCursor(lex(' a %b\n'));
    expect(c.kind).toBe(Id);
    expect(c.text).toBe('a');
    expect(c.peek()).toBe(Id); // b, past the space and the comment
    c.next();
    expect(c.text).toBe('b');
    c.next();
    expect(c.kind).toBe(Kind.Newline);
    c.next();
    expect(c.kind).toBe(Kind.EOF);
    c.next();
    expect(c.kind).toBe(Kind.EOF); // stays on EOF
  });

  it('eats a token only when the kind matches and reports its range', () => {
    const c = new TokenCursor(lex('a;'));
    expect(c.eat(Semi)).toBe(false);
    expect(c.range).toEqual({ start: 0, end: 1 });
    expect(c.eat(Id)).toBe(true);
    expect(c.at(Semi)).toBe(true);
  });

  it('accepts a custom trivia set', () => {
    const c = new TokenCursor(lex('a\nb'), kindSet(Kind.Newline));
    c.next();
    expect(c.text).toBe('b');
  });

  it('two cursors over one stream are independent', () => {
    const s = lex('ab');
    const c1 = new TokenCursor(s);
    const c2 = new TokenCursor(s);
    c1.next();
    expect([c1.text, c2.text]).toEqual(['b', 'a']);
  });
});

describe('Recovery.syncTo', () => {
  const BOUNDARY = kindSet(Kind.Newline, Semi);

  it('skips to the next statement boundary without consuming it and returns the skipped range', () => {
    const c = new TokenCursor(lex('a ## b;c\nd'));
    c.next();
    expect(syncTo(c, BOUNDARY)).toEqual({ start: 2, end: 6 });
    expect(c.kind).toBe(Semi);
  });

  it('stops at EOF when no boundary follows', () => {
    const c = new TokenCursor(lex('a ##'));
    syncTo(c, BOUNDARY);
    expect(c.kind).toBe(Kind.EOF);
  });

  it('returns an empty range when already at a boundary', () => {
    const c = new TokenCursor(lex(';a'));
    expect(syncTo(c, BOUNDARY)).toEqual({ start: 0, end: 0 });
    expect(c.kind).toBe(Semi);
  });
});
