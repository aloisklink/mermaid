import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core/v13/index.js';
import {
  LIMIT_CODES,
  isLimitCode,
  resolveLimits,
  type Limits,
} from '@mermaid-js/core/v13/limits/index.js';
import { preprocess } from '@mermaid-js/core/v13/preprocess/index.js';
import type { SequenceStatement } from './model.js';
import { sequence } from './plugin.js';

/** A parse through the plugin, with the integrator's `limits` when given. */
const parse = (text: string, limits?: Partial<Limits>) =>
  sequence.parse(text, {
    preprocessed: preprocess(text),
    ...(limits ? { limits: resolveLimits(undefined, limits) } : {}),
  } as unknown as DiagramParseContext);

/** The limit errors of a parse, as codes; `[]` when it renders. Any other error fails. */
const limitCodes = (text: string, limits?: Partial<Limits>): string[] => {
  const errors = parse(text, limits).diagnostics.filter((d) => d.severity === 'error');
  expect(errors.filter((d) => !isLimitCode(d.code))).toEqual([]);
  return errors.map((d) => d.code);
};

/**
 * Every cap from 0 to two past `count`: one `LIMIT` error under `count`, none from it on, so the
 * result never goes from `LIMIT` back to rendered as the cap grows (#747, #748).
 */
const sweep = (text: string, limit: 'maxNodes' | 'maxEdges', count: number): void => {
  for (let cap = 0; cap <= count + 2; cap++) {
    expect(limitCodes(text, { [limit]: cap }), `${limit}: ${cap}`).toEqual(
      cap < count ? [LIMIT_CODES[limit]] : []
    );
  }
};

/** Messages in a statement list, blocks included. */
const messages = (list: readonly SequenceStatement[]): number =>
  list.reduce((n, s) => {
    if (s.kind === 'message') return n + 1;
    if (s.kind === 'rect') return n + messages(s.statements);
    if (s.kind === 'fragment')
      return n + s.sections.reduce((m, x) => m + messages(x.statements), 0);
    return n;
  }, 0);

/** The model's own count of participants and messages, which the caps count. */
const counts = (text: string): [number, number] => {
  const { model } = parse(text);
  return [model.participants.length, messages(model.statements)];
};

/** `n` participants `P0`…, each sending four messages around the ring: `4 × n` messages. */
const ring = (n: number): string =>
  'sequenceDiagram\n' +
  Array.from({ length: n }, (_, i) =>
    [1, 2, 3, 4].map((k) => `  P${i}->>P${(i + k) % n}: m`).join('\n')
  ).join('\n');

/** The sample of issue #747. */
const SAMPLE =
  'sequenceDiagram\n' + Array.from({ length: 6 }, (_, i) => `  P${i}->>P${i + 1}: m`).join('\n');

describe('sequence parse limits (R-SEC-5, #721, #747, D608)', () => {
  it("fails the issue's sample at maxNodes 5 and maxEdges 5, and draws it at its exact counts", () => {
    expect(counts(SAMPLE)).toEqual([7, 6]);
    expect(limitCodes(SAMPLE, { maxNodes: 5 })).toEqual(['NODE_LIMIT']);
    expect(limitCodes(SAMPLE, { maxEdges: 5 })).toEqual(['EDGE_LIMIT']);
    expect(limitCodes(SAMPLE, { maxNodes: 7, maxEdges: 6 })).toEqual([]);
    sweep(SAMPLE, 'maxNodes', 7);
    sweep(SAMPLE, 'maxEdges', 6);
  });

  it('counts the 40 participants and 160 messages of the measured diagram', () => {
    const text = ring(40);
    expect(counts(text)).toEqual([40, 160]);
    expect(limitCodes(text, { maxNodes: 5 })).toEqual(['NODE_LIMIT']);
    expect(limitCodes(text, { maxEdges: 5 })).toEqual(['EDGE_LIMIT']);
    sweep(text, 'maxNodes', 40);
    sweep(text, 'maxEdges', 160);
  });

  it('reports the first participant and message over the cap, in core words', () => {
    const nodes = parse(SAMPLE, { maxNodes: 5 }).diagnostics[0]!;
    expect(nodes.message).toBe(
      'The diagram has more than 5 participants, the limit. The limit is set by the page or app that renders the diagram.'
    );
    expect(SAMPLE.slice(nodes.range.start, nodes.range.end)).toBe('P5');
    const edges = parse(SAMPLE, { maxEdges: 5 }).diagnostics[0]!;
    expect(edges.message).toMatch(/^The diagram has more than 5 messages, the limit\./);
    expect(SAMPLE.slice(edges.range.start, edges.range.end)).toBe('P5->>P6: m');
  });

  it.each([
    ['a message that makes both its ends', 'sequenceDiagram\n  A->>B: m\n  C->>D: m', 4, 2],
    ['a self message', 'sequenceDiagram\n  A->>A: m', 1, 1],
    [
      'declared participants and actors, with a later mention',
      'sequenceDiagram\n  participant A\n  actor B as Bee\n  participant C@{ "type": "database" }\n  A->>B: m\n  participant A as Again',
      3,
      1,
    ],
    [
      'create participant and destroy',
      'sequenceDiagram\n  A->>B: m\n  create participant C\n  A->>C: hi\n  create actor D\n  C->>D: hi\n  destroy C\n  C-xA: bye',
      4,
      4,
    ],
    [
      'boxes',
      'sequenceDiagram\n  box Aqua One\n    participant A\n    participant B\n  end\n  box Two\n    participant C\n  end\n  A->>C: m\n  B->>D: m',
      4,
      2,
    ],
    [
      'notes (participants they name count, the notes do not)',
      'sequenceDiagram\n  A->>B: m\n  Note over A,C: n\n  Note right of D: n',
      4,
      1,
    ],
    [
      'messages in blocks',
      'sequenceDiagram\n  loop l\n    A->>B: m\n  end\n  alt a\n    B->>C: m\n  else b\n    C->>A: m\n  end\n  rect rgb(0, 0, 0)\n    par p\n      A-)B: m\n    and q\n      B--)C: m\n    end\n  end',
      3,
      5,
    ],
    [
      'activations, autonumber and menus (which are neither)',
      'sequenceDiagram\n  autonumber\n  A->>+B: m\n  activate A\n  deactivate A\n  B-->>-A: m\n  link E: Docs @ https://example.com',
      3,
      2,
    ],
    ['repeated messages', 'sequenceDiagram\n  A->>B: m\n  A->>B: m\n  A->>B: m', 2, 3],
  ])('counts %s', (_name, text, nodes, edges) => {
    expect(counts(text)).toEqual([nodes, edges]);
    sweep(text, 'maxNodes', nodes);
    sweep(text, 'maxEdges', edges);
  });

  it("defaults to core's maxNodes and maxEdges", () => {
    const participants = (n: number) =>
      'sequenceDiagram\n' + Array.from({ length: n }, (_, i) => `  participant P${i}`).join('\n');
    expect(limitCodes(participants(10_000))).toEqual([]);
    expect(limitCodes(participants(10_001))).toEqual(['NODE_LIMIT']);
    const msgs = (n: number) => 'sequenceDiagram\n' + '  A->>B: m\n'.repeat(n);
    expect(limitCodes(msgs(5_000))).toEqual([]);
    expect(limitCodes(msgs(5_001))).toEqual(['EDGE_LIMIT']);
  });
});
