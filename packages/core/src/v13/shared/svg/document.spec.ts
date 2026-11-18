import { describe, expect, it } from 'vitest';
import { streamWriter } from '../../svg/index.js';
import type { SafeColor, StyleText } from '../../svg/index.js';
import { cls, openSvgRoot, paletteSlots, styleCache, textElement } from './document.js';
import type { RootContext } from './document.js';

const ctx = (idPrefix?: () => string): RootContext => ({
  theme: { rootStyleText: () => '' as StyleText, autoDeclarations: () => undefined },
  get idPrefix() {
    return idPrefix?.();
  },
  version: '13.0.0',
});

describe('openSvgRoot', () => {
  it('writes the root at full width, named by its title and description', () => {
    const w = streamWriter();
    openSvgRoot(
      w,
      ctx(() => 'm1'),
      {
        name: 'er erDiagram',
        viewBox: [0, 0, 10, 20],
        maxWidth: true,
        title: 'T',
        desc: 'D',
      }
    );
    w.close();
    expect(w.finish()).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" class="mermaid mermaid-er erDiagram" ' +
        'viewBox="0 0 10 20" width="100%" role="img" aria-roledescription="er" ' +
        'aria-labelledby="m1-title" aria-describedby="m1-desc" data-mermaid-version="13.0.0" ' +
        'style="max-width:10px"><title id="m1-title">T</title><desc id="m1-desc">D</desc></svg>'
    );
  });

  it('writes a fixed size without reading the id prefix', () => {
    const w = streamWriter();
    const prefix = (): string => {
      throw new Error('read');
    };
    openSvgRoot(w, ctx(prefix), {
      name: 'class',
      roleDescription: 'classDiagram',
      viewBox: [1, 2, 10, 20],
      maxWidth: false,
      attrs: { 'font-size': 16 },
    });
    w.close();
    expect(w.finish()).toContain(
      'viewBox="1 2 10 20" width="10" height="20" role="img" aria-roledescription="classDiagram" ' +
        'data-mermaid-version="13.0.0" style="" font-size="16"/>'
    );
  });

  it('sizes the root from bounds, rounded up to whole pixels and at least 1', () => {
    const w = streamWriter();
    openSvgRoot(w, ctx(), {
      name: 'pie',
      viewBox: { x: -2.5, y: 3, width: 10.2, height: 0 },
      maxWidth: false,
    });
    w.close();
    expect(w.finish()).toContain('viewBox="-2.5 3 11 1" width="11" height="1"');
  });

  it('reads bounds without a corner as starting at the origin', () => {
    const w = streamWriter();
    openSvgRoot(w, ctx(), { name: 'state', viewBox: { width: 4.5, height: 2 }, maxWidth: false });
    w.close();
    expect(w.finish()).toContain('viewBox="0 0 5 2"');
  });

  it('trims the title and description, and writes neither when blank', () => {
    const w = streamWriter();
    openSvgRoot(
      w,
      ctx(() => 'm1'),
      { name: 'pie', viewBox: [0, 0, 1, 1], maxWidth: false, title: '  T \n', desc: ' \t' }
    );
    w.close();
    const svg = w.finish();
    expect(svg).toContain('<title id="m1-title">T</title>');
    expect(svg).not.toContain('<desc');
    expect(svg).not.toContain('aria-describedby');
  });
});

describe('textElement', () => {
  it('writes a title with an id, or a desc without one', () => {
    const w = streamWriter();
    w.open('g');
    textElement(w, 'title', 'a < b', 'x-title');
    textElement(w, 'desc', 'D');
    w.close();
    expect(w.finish()).toBe('<g><title id="x-title">a &lt; b</title><desc>D</desc></g>');
  });
});

describe('render helpers', () => {
  it('cls keeps safe class characters', () => {
    expect(cls(['a b', '', 'c-d'])).toBe(' ab c-d');
  });

  it('paletteSlots fills by order or by slot', () => {
    const lists = {
      borderColorArray: ['#111', '#222'] as SafeColor[],
      bkgColorArray: ['#a', '#b', '#c'] as SafeColor[],
    };
    const theme = { palette: (n: keyof typeof lists) => lists[n] };
    expect(paletteSlots(theme)(2)).toEqual({ id: 'color-0', stroke: '#111', fill: '#c' });
    expect(paletteSlots(theme, 'slot')(2)).toEqual({ id: 'color-0', stroke: '#111', fill: '#a' });
  });

  it('styleCache checks each distinct list once', () => {
    const styleOf = styleCache(new Map([['k', ['fill: red']]]), () => undefined);
    expect(styleOf(['k'], [' stroke:blue '])).toBe(styleOf(['k'], ['stroke:blue']));
    expect(styleOf(['k']).shape).toMatchObject({ fill: 'red' });
  });
});
