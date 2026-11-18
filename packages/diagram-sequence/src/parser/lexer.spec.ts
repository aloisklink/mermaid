import { describe, expect, it } from 'vitest';
import { Kind, sourceView } from '@mermaid-js/core/v13/parser-kit/index.js';
import { preprocess } from '@mermaid-js/core/v13/preprocess/index.js';
import { sequenceTokens } from './index.js';
import { lex } from './lexer.js';
import { T } from './tokens.js';

const stream = (src: string) => {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const s = lex(src, pre.bodyStart, view);
  return Array.from({ length: s.length }, (_, j) => ({
    kind: s.kind[j] ?? Kind.EOF,
    start: s.start[j] ?? 0,
    end: s.end[j] ?? 0,
  }));
};
const of = (src: string, kind: number) => sequenceTokens(src).filter((t) => t.kind === kind);

// v12 removed comment lines and directives before lexing; v13 lexes the same text, so a
// token that runs over one stays one token (the parity gate would not see a split of these).
describe('tokens across removed spans', () => {
  it('keeps a multi-line accessibility description split by a comment line one token', () => {
    const src = 'sequenceDiagram\naccDescr {\na\n%% c\nb\n}\nA->>B: x';
    const values = of(src, T.AccDescrMultilineValue);
    expect(values.map((t) => t.text)).toEqual(['a\nb\n']);
    expect(src.slice(values[0]?.range.start, values[0]?.range.end)).toBe('a\n%% c\nb\n');
  });

  it('keeps participant metadata split by a comment line one token', () => {
    const src = 'sequenceDiagram\nparticipant A@{ "type":\n%% c\n "database" }\nA->>B: x';
    expect(of(src, T.ConfigContent).map((t) => t.text)).toEqual([' "type":\n "database" ']);
  });

  it('keeps a run of line breaks around a comment line one token, ranges in order', () => {
    const src = 'sequenceDiagram\nA->>B: x\n\n%% c\n\nB->>A: y';
    const tokens = stream(src);
    const breaks = tokens.filter((t) => t.kind === Kind.Newline);
    // The last is the line break v12 appended, clipped to the end of the source.
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\n', '\n\n%% c\n\n', '']);
    const comments = tokens.filter((t) => t.kind === Kind.Comment);
    // v12's `^\s*%%…` took the blank line before the comment too.
    expect(comments.map((t) => src.slice(t.start, t.end))).toEqual(['\n%% c\n']);
    const starts = tokens.map((t) => t.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('gives a CRLF line break one token from its CR', () => {
    const src = 'sequenceDiagram\r\nA->>B: x\r\n';
    const breaks = stream(src).filter((t) => t.kind === Kind.Newline);
    expect(breaks.map((t) => src.slice(t.start, t.end))).toEqual(['\r\n', '\r\n']);
    expect(of(src, T.Txt).map((t) => t.text)).toEqual([': x']);
  });

  it('writes the comments jison skipped as trivia, and entities as v12 read them', () => {
    const src = 'sequenceDiagram\nA->>B: x #quot;y#quot; # note\nC%%d';
    const tokens = stream(src);
    expect(
      tokens.filter((t) => t.kind === Kind.Comment).map((t) => src.slice(t.start, t.end))
    ).toEqual(['# note', 'C%%d']);
    expect(of(src, T.Txt).map((t) => t.text)).toEqual([': x &quot;y&quot; ']);
  });

  it('trims ids, and ends the range at the last character', () => {
    const src = 'sequenceDiagram\nparticipant  Alice   \nAlice  ->>  Bob : x';
    expect(of(src, T.Actor).map((t) => [t.text, src.slice(t.range.start, t.range.end)])).toEqual([
      ['Alice', 'Alice'],
      ['Alice', 'Alice'],
      ['Bob', 'Bob'],
    ]);
  });

  it('writes an Error where jison threw, and carries on in the initial state', () => {
    const src = 'sequenceDiagram\nparticipant\nA->>B: x';
    const kinds = sequenceTokens(src).map((t) => t.kind);
    expect(kinds.slice(0, 4)).toEqual([T.SD, Kind.Newline, T.Participant, Kind.Error]);
    expect(kinds).toContain(T.SolidArrow);
  });
});
