import { describe, expect, it } from 'vitest';
import {
  FIRST_DIAGRAM_KIND,
  Kind,
  kindSet,
  Probe,
  ProbeCursor,
  significantTokens,
  TokenWriter,
} from './index.js';

const Word = FIRST_DIAGRAM_KIND;
const Colon = FIRST_DIAGRAM_KIND + 1;
const Dash = FIRST_DIAGRAM_KIND + 2;
const Dot = FIRST_DIAGRAM_KIND + 3;
/** Kinds the cursor follows rather than extends. */
const FOLLOW = kindSet(Colon);

/** `ab ::: cd`: Word[0,2] Colon[3,6] Word[7,9] EOF, with the blanks as Space trivia. */
function stream() {
  const src = 'ab ::: cd';
  const w = new TokenWriter();
  w.push(Word, 0, 2);
  w.push(Kind.Space, 2, 3);
  w.push(Colon, 3, 6);
  w.push(Kind.Space, 6, 7);
  w.push(Word, 7, 9);
  return { src, tokens: w.finish(src) };
}

/** Index of the probed token of `view` at offset `o`, or -1. */
function probedIn(src: string, view: ReturnType<typeof significantTokens>, o: number): number {
  const p = new Probe(src, o, FOLLOW);
  for (let i = 0; i < view.length; i++) if (p.isAt(view, i)) return i;
  return -1;
}

describe('Probe', () => {
  it.each([
    [0, 0, 'ab'],
    [1, 0, 'ab'], // inside a word
    [2, 0, 'ab'], // at the end of a word: still the word
    [3, 1, ':::'], // in the blank before `:::`
    [6, 2, 'cd'], // right after `:::`: the token after it
    [9, 2, 'cd'],
  ])('offset %i probes significant token %i (%s)', (offset, index, _text) => {
    const { src } = stream();
    const tokens = significantTokens(stream().tokens);
    const probe = new Probe(src, offset, FOLLOW);
    const hits = [];
    for (let i = 0; i < tokens.length; i++) if (probe.isAt(tokens, i)) hits.push(i);
    expect(hits).toEqual([index]);
  });

  it('gives the prefix typed of a word, empty elsewhere', () => {
    const { src } = stream();
    const at = (o: number, start: number) => {
      const p = new Probe(src, o);
      p.tested(Word, start);
      return src.slice(p.result().prefix.start, p.result().prefix.end);
    };
    expect(at(1, 0)).toBe('a');
    expect(at(9, 7)).toBe('cd');
    expect(at(7, 7)).toBe('');
  });

  it('a cursor records at, eat and peekAt only at the probed token', () => {
    const { src, tokens } = stream();
    const probe = new Probe(src, 6, FOLLOW); // probes `cd`
    const c = new ProbeCursor(tokens, probe);
    expect(c.at(Colon)).toBe(false); // at `ab`: not recorded
    expect(c.peekAt(Colon)).toBe(true); // peeks `:::`: not recorded
    c.next();
    expect(c.peekAt(Word)).toBe(true); // peeks `cd`: recorded
    expect(c.eat(Colon)).toBe(true);
    c.tested([Colon, Kind.Newline]);
    expect(c.at(Word)).toBe(true);
    expect(probe.result().expected).toEqual([Word, Colon, Kind.Newline]);
  });

  it('stops recording at recovery once the probed token was tested', () => {
    const { src, tokens } = stream();
    const probe = new Probe(src, 0);
    const c = new ProbeCursor(tokens, probe);
    c.recovering(); // before the probed token was tested: no effect
    c.at(Colon);
    c.recovering();
    c.at(Kind.Newline);
    expect(probe.result().expected).toEqual([Colon]);
  });

  it('normalises the offset: whole, finite, inside the source', () => {
    const src = 'abc';
    const at = (o: number) => {
      const r = new Probe(src, o).result();
      return [r.offset, r.prefix.start, r.prefix.end];
    };
    expect(at(Number.NaN)).toEqual([0, 0, 0]);
    expect(at(1.7)).toEqual([1, 1, 1]);
    expect(at(Infinity)).toEqual([3, 3, 3]);
    expect(at(-5)).toEqual([0, 0, 0]);
  });

  it('follows tokens by kind; adjacent word tokens are one word, probed at its start', () => {
    const src = 'ab-c. x';
    const w = new TokenWriter();
    w.push(Word, 0, 2);
    w.push(Dash, 2, 3);
    w.push(Word, 3, 4);
    w.push(Dot, 4, 5); // a word part ending in punctuation
    w.push(Kind.Space, 5, 6);
    w.push(Word, 6, 7);
    const view = significantTokens(w.finish(src));
    const hit = (o: number) => probedIn(src, view, o);
    expect(hit(3)).toBe(0); // `ab-|`
    expect(hit(5)).toBe(0); // `ab-c.|`
    expect(hit(6)).toBe(4); // after the blank
    const p = new Probe(src, 5, FOLLOW);
    p.tested(Word, 0);
    expect(src.slice(p.result().prefix.start, 5)).toBe('ab-c.');
  });

  it('a followed token the offset is past a line break of is behind the cursor', () => {
    // `ab\n\n|\ncd`: a blank line inside one line-break run is after the separator, so the
    // probe is at the next token, not at the run (#32).
    const src = 'ab\n\n\ncd';
    const w = new TokenWriter();
    w.push(Word, 0, 2);
    w.push(Kind.Newline, 2, 5);
    w.push(Word, 5, 7);
    const view = significantTokens(w.finish(src));
    const hit = (o: number) => probedIn(src, view, o);
    expect(hit(2)).toBe(0); // `ab|`: still the word
    expect(hit(3)).toBe(2); // on the first blank line
    expect(hit(4)).toBe(2);
    expect(hit(5)).toBe(2);
  });

  it('a followed token the offset is in the trailing blanks of is behind the cursor', () => {
    // `ab :::  |  cd`: the `:::` token took the blanks after it, as link tokens do (#32).
    const src = 'ab :::    cd';
    const w = new TokenWriter();
    w.push(Word, 0, 2);
    w.push(Kind.Space, 2, 3);
    w.push(Colon, 3, 10);
    w.push(Word, 10, 12);
    const view = significantTokens(w.finish(src));
    expect(probedIn(src, view, 5)).toBe(1); // inside `:::`
    expect(probedIn(src, view, 6)).toBe(2); // right after it
    expect(probedIn(src, view, 8)).toBe(2); // in its blanks
  });

  it('never joins a word across a line break or blanks a token took', () => {
    // `end\n  A`: a keyword token took the line break and indent after it (#32 review).
    const src = 'ab\n  cd';
    const w = new TokenWriter();
    w.push(Word, 0, 5);
    w.push(Word, 5, 7);
    const view = significantTokens(w.finish(src));
    expect(probedIn(src, view, 7)).toBe(1);
    expect(probedIn(src, view, 6)).toBe(1);
    // In the blanks a word took, the cursor is after it: `ab\n  |cd`.
    expect(probedIn(src, view, 5)).toBe(1);
    expect(probedIn(src, view, 3)).toBe(1);
    expect(probedIn(src, view, 2)).toBe(0); // `ab|`: still the word
  });

  it('records nothing with a cursor whose offset is inside a comment', () => {
    const src = 'a %% xy\nb';
    const w = new TokenWriter();
    w.push(Word, 0, 1);
    w.push(Kind.Comment, 2, 7);
    w.push(Kind.Newline, 7, 8);
    w.push(Word, 8, 9);
    const probe = new Probe(src, 6);
    const c = new ProbeCursor(w.finish(src), probe);
    c.next();
    c.at(Kind.Newline);
    c.tested([Word]);
    expect(probe.result()).toMatchObject({ expected: [], mode: 'comment' });
  });
});
