/**
 * Sequence's own theme variables (spec #414 T2, D331): its geometry and the participant and
 * fragment colours that follow a shared one live in the plugin's table, keyed by family. Here
 * the colours come from v12's themes, so these check that they agree with v13's table.
 */
import type { DiagramPlugin } from '@mermaid-js/core/v13/index.js';
import { THEME_VARIABLES } from '@mermaid-js/core/v13/theme/index.js';
import { describe, expect, it } from 'vitest';
import { sequence } from '../plugin.js';
import { testTheme } from './testTheme.js';

const { theme: table }: Pick<DiagramPlugin, 'id' | 'theme'> = sequence;
const OWN = [
  'actorTextColor',
  'actorLineColor',
  'signalColor',
  'signalTextColor',
  'labelBoxBkgColor',
  'labelBoxBorderColor',
  'labelTextColor',
  'loopTextColor',
  'activationBkgColor',
  'activationBorderColor',
  'sequenceNumberColor',
];
const GEOMETRY = [
  'actorRadius',
  'actorGlyphBand',
  'messageEndGap',
  'labelBoxExtraHeight',
  'actorFooterPadding',
];

describe('the sequence theme table (#414 T2)', () => {
  it('owns its variables; core no longer names them', () => {
    expect(Object.keys(table.vars).sort()).toEqual([...OWN, ...GEOMETRY].sort());
    for (const name of [...OWN, ...GEOMETRY]) expect(THEME_VARIABLES[name], name).toBeUndefined();
  });

  it('reads the participant fill and border from core, which usecase reads too (#561, D474)', () => {
    for (const name of ['actorBkg', 'actorBorder'])
      expect(THEME_VARIABLES[name]?.usedBy, name).toEqual(['sequence', 'usecase']);
    const t = testTheme('default');
    expect(t.value('actorBkg')).toBe(t.value('mainBkg'));
    expect(t.value('labelBoxBkgColor')).toBe(t.value('actorBkg'));
    expect(t.value('actorLineColor')).toBe(t.value('actorBorder'));
  });

  it('takes v12 neo geometry in the redux and neo families, classic elsewhere', () => {
    const at = (name: Parameters<typeof testTheme>[0]) => {
      const t = testTheme(name);
      return GEOMETRY.map((g) => t.number(g));
    };
    expect(at('default')).toEqual([3, 0, 0, 0, 0]);
    expect(at('dark')).toEqual([3, 0, 0, 0, 0]);
    for (const name of ['redux', 'redux-dark-color', 'neo', 'neo-dark'] as const)
      expect(at(name), name).toEqual([6, 44, 3, 15, 30]);
  });

  it('derives the participant and label colours as v12 theme-base does', () => {
    // forest pins v12's mainBkg (#798), so its participants follow mainBkg, not primaryColor.
    const t = testTheme('forest', { mainBkg: '#123456', actorTextColor: '#654321' });
    expect(t.value('actorBkg')).toBe('#123456');
    expect(t.value('labelBoxBkgColor')).toBe('#123456');
    expect(t.value('actorLineColor')).toBe(t.value('actorBorder'));
    expect(t.value('actorTextColor')).toBe('#654321');
    expect([t.value('labelTextColor'), t.value('loopTextColor')]).toEqual(['#654321', '#654321']);
  });

  it('draws redux-dark messages white and their text in the text ink, as v12', () => {
    for (const name of ['redux-dark', 'redux-dark-color'] as const) {
      const t = testTheme(name);
      expect([t.value('signalColor').toLowerCase(), t.value('signalTextColor')], name).toEqual([
        '#ffffff',
        t.value('textColor'),
      ]);
    }
    const neoDark = testTheme('neo-dark');
    expect(neoDark.value('signalColor')).toBe(neoDark.value('textColor'));
  });
});
