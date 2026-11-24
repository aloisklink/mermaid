/**
 * Probe mode on the sequence parser (R-LANG-7, D95): what the parser would accept at an offset,
 * and the lexer mode there. The language facet (#149) builds completion on it.
 */
import { Kind } from '@mermaid-js/core/v13/parser-kit/index.js';
import { describe, expect, it } from 'vitest';
import { parseSequence } from './parser.js';
import { T } from './tokens.js';

const NAMES = new Map<number, string>([
  [Kind.EOF, 'EOF'],
  [Kind.Newline, 'Newline'],
  ...Object.entries(T).map(([k, v]) => [v, k] as [number, string]),
]);

/** The probe at the `|` marker. */
function probeAt(marked: string) {
  const offset = marked.indexOf('|');
  const src = marked.slice(0, offset) + marked.slice(offset + 1);
  const p = parseSequence(src, { probe: offset }).probe;
  if (!p) throw new Error('no probe result');
  return {
    expected: p.expected.map((k) => NAMES.get(k) ?? String(k)),
    mode: p.mode,
    prefix: src.slice(p.prefix.start, p.prefix.end),
  };
}

describe('sequence probe', () => {
  it('before the header: `sequenceDiagram`', () => {
    expect(probeAt('|').expected).toContain('SD');
    expect(probeAt('seq|').prefix).toBe('seq');
  });

  it('at a line start: statements, and `end` only inside a block', () => {
    const top = probeAt('sequenceDiagram\n|').expected;
    expect(top).toEqual(expect.arrayContaining(['Participant', 'Note', 'Loop', 'Actor']));
    expect(top).not.toContain('End');
    expect(probeAt('sequenceDiagram\nloop x\n|').expected).toContain('End');
    expect(probeAt('sequenceDiagram\nloop x\n|').expected).not.toContain('Else');
    expect(probeAt('sequenceDiagram\nalt x\n|').expected).toContain('Else');
  });

  it('after a participant id: an arrow; after the arrow: `+`, `-`, `()` or an id', () => {
    expect(probeAt('sequenceDiagram\nA |').expected).toEqual(
      expect.arrayContaining(['SolidArrow', 'DottedArrow', 'Parens'])
    );
    expect(probeAt('sequenceDiagram\nA->>|').expected).toEqual(
      expect.arrayContaining(['Plus', 'Minus', 'Actor'])
    );
  });

  it('records the lexer mode: an id after `participant`', () => {
    expect(probeAt('sequenceDiagram\nparticipant |').mode).toBe('ID');
    expect(probeAt('sequenceDiagram\n%% c|\nA->>B: x').mode).toBe('comment');
  });
});
