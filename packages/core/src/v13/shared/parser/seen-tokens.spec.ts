import { Kind, sourceView, TRIVIA } from '../../parser-kit/index.js';
import type { TokenStream } from '../../parser-kit/index.js';
import { describe, expect, it } from 'vitest';
import {
  bodyTokens,
  bodyView,
  COMMENTS,
  cooked,
  keptTokens,
  NO_KINDS,
  seenIndices,
  seenTokens,
} from './seen-tokens.js';

const WORD = 10;

/** A stream over `source` from `[kind, start, end]` triples, with the final EOF added. */
function stream(
  source: string,
  tokens: readonly (readonly [number, number, number])[]
): TokenStream {
  const all = [...tokens, [Kind.EOF, source.length, source.length] as const];
  return {
    kind: Uint16Array.from(all.map((t) => t[0])),
    start: Uint32Array.from(all.map((t) => t[1])),
    end: Uint32Array.from(all.map((t) => t[2])),
    source,
    length: all.length,
  };
}

describe('seenTokens', () => {
  it('leaves out the comment line v12 removed before lexing, and the final EOF', () => {
    const src = 'pie\n%% gone\nx';
    const view = sourceView(src, 0, []);
    const out = seenTokens(
      src,
      stream(src, [
        [WORD, 0, 3],
        [Kind.Newline, 3, 4],
        [Kind.Comment, 4, 12],
        [WORD, 12, 13],
      ]),
      view
    );
    expect(out).toEqual([
      { kind: WORD, text: 'pie', range: { start: 0, end: 3 } },
      { kind: Kind.Newline, text: '\n', range: { start: 3, end: 4 } },
      { kind: WORD, text: 'x', range: { start: 12, end: 13 } },
    ]);
  });

  it('keeps a comment token that does not cover a removed span', () => {
    const src = 'pie %% kept';
    const view = sourceView(src, 0, []);
    const out = seenTokens(
      src,
      stream(src, [
        [WORD, 0, 3],
        [Kind.Comment, 4, 11],
      ]),
      view
    );
    expect(out.map((t) => t.kind)).toEqual([WORD, Kind.Comment]);
  });

  it('gives each token its text as v12 read it: CRLF as LF', () => {
    const src = 'a\r\nb';
    const view = sourceView(src, 0, []);
    const out = seenTokens(src, stream(src, [[WORD, 0, 4]]), view);
    expect(out[0]?.text).toBe('a\nb');
  });
});

describe('seenIndices', () => {
  it('gives the stream indices of the tokens v12 saw', () => {
    const src = 'pie\n%% gone\nx';
    const s = stream(src, [
      [WORD, 0, 3],
      [Kind.Newline, 3, 4],
      [Kind.Comment, 4, 12],
      [WORD, 12, 13],
    ]);
    expect(seenIndices(s, sourceView(src, 0, []))).toEqual([0, 1, 3]);
  });
});

describe('bodyTokens', () => {
  it('lexes from the body start, after front matter', () => {
    const src = '---\ntitle: t\n---\npie';
    const from = src.indexOf('pie');
    const seen: number[] = [];
    const out = bodyTokens(src, (text, at) => {
      seen.push(at);
      return stream(text, [[WORD, at, text.length]]);
    });
    expect(seen).toEqual([from]);
    expect(out).toEqual([{ kind: WORD, text: 'pie', range: { start: from, end: src.length } }]);
  });
});

describe('bodyView', () => {
  it('starts after front matter and cuts out the directives', () => {
    const src = '---\ntitle: t\n---\n%%{init: {}}%%\npie';
    const { bodyStart, view } = bodyView(src);
    expect(bodyStart).toBe(src.indexOf('%%{'));
    expect(view.holes.map((h) => h.kind)).toContain('directive');
  });
});

describe('keptTokens', () => {
  const src = 'a %% c\n  b';
  const s = stream(src, [
    [WORD, 0, 1],
    [Kind.Space, 1, 2],
    [Kind.Comment, 2, 6],
    [Kind.Newline, 6, 7],
    [Kind.Space, 7, 9],
    [WORD, 9, 10],
  ]);
  const raw = (j: number) => src.slice(s.start[j], s.end[j]);

  it('leaves out the kinds in `skip` and the final EOF, with the text `text` reads', () => {
    expect(keptTokens(s, TRIVIA, raw)).toEqual([
      { kind: WORD, text: 'a', range: { start: 0, end: 1 } },
      { kind: Kind.Newline, text: '\n', range: { start: 6, end: 7 } },
      { kind: WORD, text: 'b', range: { start: 9, end: 10 } },
    ]);
  });

  it('keeps blanks when `skip` is only comments and directives', () => {
    expect(keptTokens(s, COMMENTS, raw).map((t) => t.kind)).toEqual([
      WORD,
      Kind.Space,
      Kind.Newline,
      Kind.Space,
      WORD,
    ]);
  });

  it('reads each token through the source view with `cooked`', () => {
    const crlf = 'a\r\nb';
    const t = stream(crlf, [[WORD, 0, 4]]);
    const view = sourceView(crlf, 0, []);
    expect(keptTokens(t, NO_KINDS, cooked(crlf, t, view))[0]?.text).toBe('a\nb');
  });
});
