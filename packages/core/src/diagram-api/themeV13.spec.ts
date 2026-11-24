import { describe, expect, it } from 'vitest';
import type { DiagramThemeTable } from '../v13/theme/diagram.js';
import { themeFromV12 } from './themeV13.js';

const table: DiagramThemeTable = {
  vars: {},
  rules: { light: { tabBorder: 'inline(frameBorder, actorBorder)', lineColor2: 'actorBorder' } },
  families: {
    classic: { tokens: { radius: 3 } },
    redux: { tokens: { radius: 6 }, dark: { tokens: { radius: 8 } } },
  },
};

describe('themeFromV12', () => {
  it("reads v12's theme variables", () => {
    const theme = themeFromV12(
      { theme: 'default', themeVariables: { actorBorder: '#9370DB', fontSize: '16px' } },
      table
    );
    expect(theme.color('actorBorder')).toBe('#9370DB');
    expect(theme.number('fontSize')).toBe(16);
    expect(theme.color('missing')).toBe('none');
  });

  it('falls back to the rules of the diagram table', () => {
    const theme = themeFromV12({ themeVariables: { actorBorder: '#abc' } }, table);
    expect(theme.color('tabBorder')).toBe('#abc');
    expect(theme.color('lineColor2')).toBe('#abc');
  });

  it("takes geometry from the theme's family", () => {
    expect(themeFromV12({ theme: 'forest' }, table).number('radius')).toBe(3);
    expect(themeFromV12({ theme: 'redux' }, table).number('radius')).toBe(6);
    expect(themeFromV12({ theme: 'redux-dark' }, table).number('radius')).toBe(8);
  });

  it('draws shadows only for the neo and redux families, as CSS filters', () => {
    const shadow = 'drop-shadow( 1px 2px 2px rgba(185,185,185,1))';
    expect(
      themeFromV12({ theme: 'default', themeVariables: { dropShadow: shadow } }).value('dropShadow')
    ).toBe('none');
    // v12's redux themes refer to an SVG filter instead, which v13 diagrams do not define.
    const redux = themeFromV12({
      theme: 'redux',
      themeVariables: { dropShadow: 'url(#drop-shadow)' },
    });
    expect(redux.value('dropShadow')).toBe('drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))');
    const reduxDark = themeFromV12({
      theme: 'redux-dark',
      themeVariables: { dropShadow: 'url(#drop-shadow)' },
    });
    expect(reduxDark.value('dropShadow')).toBe('drop-shadow(4px 4px 0 rgb(255 255 255 / 0.06))');
    const neo = themeFromV12({ theme: 'neo', themeVariables: { dropShadow: `${shadow};` } });
    expect(neo.filter('dropShadow')).toMatch(/^drop-shadow\(/);
  });

  it('reads palettes, dropping colours that are not valid', () => {
    const theme = themeFromV12({
      themeVariables: { borderColorArray: ['#E879F9', '#A3E635 ', 'url(x)'] },
    });
    expect(theme.palette('borderColorArray')).toEqual(['#E879F9', '#A3E635']);
    expect(theme.palette('bkgColorArray')).toEqual([]);
  });
});
