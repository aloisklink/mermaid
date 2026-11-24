import { describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core/v13/index.js';
import type { ResolvedConfig } from '@mermaid-js/core/v13/config/index.js';
import { cellProfile, pxProfile } from '@mermaid-js/core/v13/layout/index.js';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/v13/text/index.js';
import type { SequenceModel } from '../model.js';
import { FIXTURES, act, frag, model, msg, note, p } from './fixtures.js';
import { layoutSequence, type SequenceLayout } from './index.js';
import { sequenceLayoutViolations } from './invariants.js';
import { testTheme } from '../theme/testTheme.js';

/** Stand-in for v13's `cellMeasurer` (text output, not ported): one cell per character. */
const cellMeasurer: Measurer = {
  id: 'cell',
  width: (text) => [...text].length,
  metrics: () => ({ ascent: 1, descent: 0, lineHeight: 1 }),
};

// Inputs from the #141 review and its config fuzz, each of which broke an invariant.

// `redux` carries v12 neo geometry, `default` v12 classic (#194).
function lay(
  m: SequenceModel,
  cell = false,
  sequence: Record<string, unknown> = {},
  warnings: Warning[] = [],
  theme: { classic?: boolean; vars?: Record<string, unknown> } = {}
): SequenceLayout {
  return layoutSequence(m, {
    config: { sequence } as ResolvedConfig,
    measurer: cell ? cellMeasurer : tableMeasurer,
    units: cell ? cellProfile() : pxProfile,
    theme: testTheme(theme.classic ? 'default' : 'redux', theme.vars),
    warn: (w) => warnings.push(w),
  });
}

const violations = (
  m: SequenceModel,
  cell = false,
  sequence: Record<string, unknown> = {},
  theme: Parameters<typeof lay>[4] = {}
) => sequenceLayoutViolations(m, lay(m, cell, sequence, [], theme));

describe('sequence layout, review regressions', () => {
  it('a box centred on a destroying message clears the row above', () => {
    for (const [cell, lines] of [
      [false, 6],
      [true, 4],
    ] as const) {
      const label = Array.from({ length: lines }, (_, i) => `l${i}`).join('<br>');
      const m = model(
        [p('A'), p('B', 'participant', { label, destroyedBy: 'm:B>A#d' })],
        [note('over', ['B'], 'n'), { ...msg('B', 'A', 'bye'), ast: 'm:B>A#d' }]
      );
      expect(violations(m, cell)).toEqual([]);
    }
    expect(violations(FIXTURES.lifecycle!, false, { height: 98 })).toEqual([]);
  });

  it('a frame holds a message label wider than its line', () => {
    const long = 'a very very long message label that is much wider than the span of the columns';
    const m = model([p('A'), p('B'), p('C')], [frag('loop', ['L', [msg('A', 'C', long)]])]);
    expect(violations(m)).toEqual([]);
    const l = lay(m);
    const [f] = l.fragments;
    expect(l.messages[0]!.label!.x).toBeGreaterThanOrEqual(f!.x);
  });

  it('a frame holds its title when the title cannot wrap', () => {
    const word = 'averyveryveryveryveryverylongunbreakabletitleword';
    const m = model([p('A'), p('B'), p('C')], [frag('loop', [word, [msg('A', 'B', 'x')]])]);
    expect(violations(m)).toEqual([]);
    expect(violations(m, true)).toEqual([]);
  });

  it('a frame holds a self loop that reaches past a narrow width', () => {
    const m = model([p('A'), p('B')], [frag('loop', ['', [msg('B', 'B', 'x')]])]);
    expect(violations(m, false, { width: 80 })).toEqual([]);
    expect(violations(m, false, { width: 58, wrap: true })).toEqual([]);
  });

  it('leaves out a statement naming an undeclared participant, with a warning', () => {
    const m = model(
      [p('A')],
      [
        { kind: 'autonumber', ast: 'st:n', visible: true },
        msg('A', 'Z', 'x'),
        note('over', ['A', 'Z'], 'n'),
        msg('A', 'A', 'numbered after the gap'),
      ]
    );
    const warnings: Warning[] = [];
    const l = lay(m, false, {}, warnings);
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      ['SEQUENCE_UNKNOWN_PARTICIPANT', [m.statements[1]!.ast]],
      ['SEQUENCE_UNKNOWN_PARTICIPANT', [m.statements[2]!.ast]],
    ]);
    // The left-out message still takes its number, as the participant v12 adds would.
    expect(l.messages.map((x) => x.number?.value)).toEqual([2]);
    expect(sequenceLayoutViolations(m, l)).toEqual([
      `${m.statements[1]!.ast} is not laid out`,
      `${m.statements[2]!.ast} is not laid out`,
    ]);
  });

  it('allows float error in the comparisons', () => {
    const cfg = {
      width: 52,
      activationWidth: 31,
      wrapPadding: 64,
      labelBoxWidth: 119,
      diagramMarginX: 19,
      diagramMarginY: 92,
      mirrorActors: false,
      wrap: true,
    };
    expect(violations(FIXTURES.lifecycle!, false, cfg)).toEqual([]);
  });

  it('a lifeline reaches past the tail of a short activation', () => {
    const m = model(
      [p('A'), p('B')],
      [msg('A', 'B', 'x', 'solid', { activation: 'activate' }), act('B', false)]
    );
    expect(violations(m, false, { boxMargin: 5, mirrorActors: false })).toEqual([]);
    expect(violations(m, false, { boxMargin: 5 })).toEqual([]);
  });

  it('`autonumber N` restarts the step at 1, as v12 does', () => {
    const m = model(
      [p('A'), p('B')],
      [
        { kind: 'autonumber', ast: 'st:1', start: 10, step: 5, visible: true },
        msg('A', 'B', '1'),
        { kind: 'autonumber', ast: 'st:2', start: 20, visible: true },
        msg('A', 'B', '2'),
        msg('A', 'B', '3'),
      ]
    );
    expect(lay(m).messages.map((x) => x.number?.value)).toEqual([10, 20, 21]);
  });

  it('a box with no visible member takes no room', () => {
    const plain = model([p('A')], [msg('A', 'A', 'x')]);
    const empty = { ...plain, boxes: [{ ast: 'box:0', label: 'Empty', participants: [] }] };
    expect(lay(empty).participants[0]!.top).toBe(lay(plain).participants[0]!.top);
    const hidden = model([p('A'), p('B', 'participant', { box: 0 })], [msg('A', 'A', 'x')], {
      boxes: [{ ast: 'box:0', label: 'Hidden', participants: ['B'] }],
    });
    const l = lay(hidden, false, { hideUnusedParticipants: true });
    expect([l.boxes.length, l.participants[0]!.top]).toEqual([0, lay(plain).participants[0]!.top]);
  });

  it('message ends stay on their columns when bars or wrapped boxes are wide', () => {
    expect(violations(FIXTURES.activations!, false, { activationWidth: 119, width: 40 })).toEqual(
      []
    );
    expect(violations(FIXTURES.messagesAndNotes!, false, { width: 0, wrap: true })).toEqual([]);
  });
});

describe('sequence layout, config fuzz', () => {
  const keys = [
    'actorMargin',
    'width',
    'height',
    'boxMargin',
    'boxTextMargin',
    'noteMargin',
    'activationWidth',
    'wrapPadding',
    'labelBoxWidth',
    'labelBoxHeight',
    'diagramMarginX',
    'diagramMarginY',
  ];
  it('holds the invariants for 200 seeded random configs', () => {
    let seed = 1;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const found = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const cfg: Record<string, unknown> = {};
      for (const k of keys) if (rnd() < 0.5) cfg[k] = Math.floor(rnd() * 120);
      if (rnd() < 0.3) cfg.mirrorActors = false;
      for (const k of ['rightAngles', 'wrap', 'hideUnusedParticipants'])
        if (rnd() < 0.3) cfg[k] = true;
      // Both geometry sets, and now and then a glyph band of any height (#194).
      const vars: Record<string, unknown> = {};
      if (rnd() < 0.3) vars.actorGlyphBand = Math.floor(rnd() * 100);
      const theme = { classic: i % 2 === 1, vars };
      for (const cell of [false, true])
        for (const [name, m] of Object.entries(FIXTURES))
          for (const v of violations(m, cell, cfg, theme))
            found.add(
              `${cell ? 'cell' : 'px'} ${name}: ${v} ${JSON.stringify({ ...cfg, ...theme })}`
            );
    }
    expect([...found].slice(0, 10)).toEqual([]);
  });
});
