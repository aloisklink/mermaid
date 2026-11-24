/**
 * Recovery (R-PARSE-4, pitfall 8): N errors in, N diagnostics out, each on its own line, and no
 * message names a token or grammar rule (R-ERR-5).
 */
import { describe, expect, it } from 'vitest';
import { JISON_NAMES, T } from './tokens.js';
import { parseSequence } from './index.js';

const errors = (src: string) =>
  parseSequence(src).diagnostics.filter((d) => d.severity === 'error');

/** `[source, codes of the errors, in order]`; one error per marked line. */
const CASES: [string, string[]][] = [
  ['sequenceDiagram\nA->>B: x\nend x', ['UNEXPECTED_END']],
  ['sequenceDiagram\nA->>B\nB->>A: ok', ['UNEXPECTED']],
  [
    'sequenceDiagram\nA->>B\nfoo bar\nA B: x\nB->>A: ok',
    ['UNEXPECTED', 'UNEXPECTED', 'UNEXPECTED'],
  ],
  ['sequenceDiagram\nparticipant\nparticipant A<b>\nA->>B: ok', ['UNEXPECTED', 'UNEXPECTED']],
  ['sequenceDiagram\nnote A: x\nnote over A,: y\nA->>B: ok', ['UNEXPECTED', 'UNEXPECTED']],
  ['sequenceDiagram\nloop x\nA->>B\nend\nB->>A: ok', ['UNEXPECTED']],
  ['sequenceDiagram\nloop x\nA->>B: y', ['UNCLOSED_BLOCK']],
  ['sequenceDiagram\nalt x\nloop y\nend', ['UNCLOSED_BLOCK']],
  ['sequenceDiagram\nend\nA->>B: x\nend', ['UNEXPECTED_END', 'UNEXPECTED_END']],
  ['sequenceDiagram\nloop x\nelse y\nend\nand z', ['UNEXPECTED_SECTION', 'UNEXPECTED_SECTION']],
  ['sequenceDiagram\nbox G\nA->>B: x\nparticipant C\nnote over C: n\nend', ['UNCLOSED_BLOCK']],
  ['sequenceDiagram\nbox X\nparticipant A\nA->>B: x\nB->>A: y\nC->>A: z', ['UNCLOSED_BLOCK']],
  [
    'sequenceDiagram\nA->>C: x\ncreate participant B\nA->>C: y\nA->>C: z\nA->>B: w',
    ['SEQUENCE_CREATE_MESSAGE'],
  ],
  [
    'sequenceDiagram\ncreate participant Z\nA->>B: m\nA->>B: m\nA->>B: m',
    ['SEQUENCE_CREATE_MESSAGE'],
  ],
  ['sequenceDiagram\ndestroy Z\nA->>B: m\nA->>B: m\nA->>B: m', ['SEQUENCE_DESTROY_MESSAGE']],
  ['sequenceDiagram\nautonumber x\nactivate\nA->>B: ok', ['UNEXPECTED', 'UNEXPECTED']],
  ['flowchart\nA->>B: x', ['UNEXPECTED']],
  ['sequenceDiagram\ndeactivate A\nA->>-B: x', ['SEQUENCE_INACTIVE', 'SEQUENCE_INACTIVE']],
  [
    'sequenceDiagram\nA->>B: x\ncreate participant A\nB->>A: y\ncreate participant C\nB->>A: z',
    ['SEQUENCE_CREATE_EXISTING', 'SEQUENCE_CREATE_MESSAGE'],
  ],
  ['sequenceDiagram\ndestroy A\nB->>C: x', ['SEQUENCE_DESTROY_MESSAGE']],
  [
    'sequenceDiagram\nbox G\nparticipant A\nend\nbox H\nparticipant A\nend',
    ['SEQUENCE_BOX_CONFLICT'],
  ],
  [
    'sequenceDiagram\nparticipant A@{ type: [ }\nA->>B: x\nA->>B',
    ['SEQUENCE_PARTICIPANT_DATA', 'UNEXPECTED'],
  ],
];

describe('sequence recovery', () => {
  it.each(CASES)('%j gives one diagnostic per error', (src, codes) => {
    expect(errors(src).map((d) => d.code)).toEqual(codes);
  });

  it('keeps parsing after an error: later statements are in the model', () => {
    const r = parseSequence('sequenceDiagram\nA->>B\nC->>D: ok\nloop x\nE->>F: y\nend');
    expect(r.model.participants.map((p) => p.id)).toEqual(['C', 'D', 'E', 'F']);
    expect(r.model.statements.map((s) => s.kind)).toEqual(['message', 'fragment']);
  });

  it('never names a token or rule in a message', () => {
    const names = new Set([...Object.values(JISON_NAMES), ...Object.keys(T)]);
    names.delete('-');
    names.delete('+');
    names.delete(',');
    for (const [src] of CASES) {
      for (const d of errors(src)) {
        // Keywords the author writes are quoted in backticks; the rest is prose.
        for (const word of d.message.replace(/`[^`]*`/g, '').split(/[^A-Za-z_]+/)) {
          if (word.length > 2 && /[A-Z_]/.test(word.slice(1)))
            expect(names.has(word), `${d.message} names ${word}`).toBe(false);
        }
      }
    }
  });

  it('points an unclosed block at its opener, with the end of the text as related', () => {
    const src = 'sequenceDiagram\nA->>B: x\nloop every minute\nA->>B: y';
    const [d] = errors(src);
    expect(d && src.slice(d.range.start, d.range.end)).toBe('loop every minute');
    expect(d?.related?.[0]?.range).toEqual({ start: src.length, end: src.length });
  });
});
