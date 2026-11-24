import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT_FAMILY,
  Style,
  resolveFontFamily,
  tableMeasurer,
  type FontKey,
  type Measurer,
} from './index.js';

// Expected widths are sums of the fonts' published advance widths (thousandths of an em),
// e.g. Arial: H 722, e 556, l 222, o 556; bold l 278, o 611.
const font = (family: string, size = 16, weight = 400): FontKey => ({ family, size, weight });
const arial = font('Arial');

describe('tableMeasurer', () => {
  it('sums Arial advance widths at the font size', () => {
    expect(tableMeasurer.width('Hello', arial, 0)).toBeCloseTo(36.448, 9);
  });

  it('uses the first family in the stack that has a table', () => {
    expect(tableMeasurer.width('Hello', font(DEFAULT_FONT_FAMILY), 0)).toBeCloseTo(37.216, 9); // Trebuchet MS
    expect(tableMeasurer.width('Hello', font('"Comic Neue", Verdana, Arial'), 0)).toBeCloseTo(
      40.032,
      9
    );
    expect(tableMeasurer.width('Hello', font("'ARIAL' ;"), 0)).toBeCloseTo(36.448, 9);
  });

  it('falls back to Arial for unknown families', () => {
    expect(tableMeasurer.width('Hello', font('Comic Neue, sans-serif'), 0)).toBeCloseTo(36.448, 9);
    expect(tableMeasurer.width('Hello', font(''), 0)).toBeCloseTo(36.448, 9);
  });

  it('uses the bold table for the Bold bit or a weight of 600 and up', () => {
    expect(tableMeasurer.width('Hello', arial, Style.Bold)).toBeCloseTo(39.12, 9);
    expect(tableMeasurer.width('Hello', font('Arial', 16, 700), 0)).toBeCloseTo(39.12, 9);
    expect(tableMeasurer.width('Hello', font('Arial', 16, 500), 0)).toBeCloseTo(36.448, 9);
  });

  it('covers Latin-1', () => {
    expect(tableMeasurer.width('é', arial, 0)).toBeCloseTo(8.896, 9); // 556
    expect(tableMeasurer.width(' ', arial, 0)).toBeCloseTo(4.448, 9); // no-break space 278
  });

  it('measures wide characters and emoji as one em', () => {
    expect(tableMeasurer.width('中文', arial, 0)).toBeCloseTo(32, 9);
    expect(tableMeasurer.width('한', arial, 0)).toBeCloseTo(16, 9);
    expect(tableMeasurer.width('😀', arial, 0)).toBeCloseTo(16, 9);
  });

  it('measures combining marks, zero-width and control characters as zero', () => {
    expect(tableMeasurer.width('é', arial, 0)).toBeCloseTo(8.896, 9);
    expect(tableMeasurer.width('a​b­c﻿', arial, 0)).toBeCloseTo(25.792, 9); // 556+556+500
    expect(tableMeasurer.width('\t\n', arial, 0)).toBe(0);
    expect(tableMeasurer.width('', arial, 0)).toBe(0);
  });

  it('measures other characters at the mean a–z advance of the face', () => {
    expect(tableMeasurer.width('Ω', arial, 0)).toBeCloseTo(7.824, 9); // Arial a–z mean 489
  });

  it('measures Mono text at 0.6 em, wide characters at 1.2 em', () => {
    expect(tableMeasurer.width('abc', arial, Style.Mono)).toBeCloseTo(28.8, 9);
    expect(tableMeasurer.width('中', arial, Style.Mono)).toBeCloseTo(19.2, 9);
  });

  it('measures subscript and superscript at the smaller size', () => {
    expect(tableMeasurer.width('Hello', arial, Style.Sub)).toBeCloseTo(36.448 / 1.2, 9);
    expect(tableMeasurer.width('Hello', arial, Style.Sup)).toBeCloseTo(36.448 / 1.2, 9);
  });

  it('ignores Italic and Underline for widths', () => {
    expect(tableMeasurer.width('Hello', arial, Style.Italic | Style.Underline)).toBeCloseTo(
      36.448,
      9
    );
  });

  it('takes vertical metrics from the table', () => {
    const m = tableMeasurer.metrics(arial);
    expect(m.ascent).toBeCloseTo(14.48, 9);
    expect(m.descent).toBeCloseTo(3.392, 9);
    expect(m.lineHeight).toBeCloseTo(18.4, 9);
    const t = tableMeasurer.metrics(font(DEFAULT_FONT_FAMILY, 20));
    expect(t.ascent).toBeCloseTo(18.78, 9);
    expect(t.descent).toBeCloseTo(4.44, 9);
    expect(t.lineHeight).toBeCloseTo(23.22, 9);
  });

  it('has a stable id for the determinism key', () => {
    expect(tableMeasurer.id).toBe('table');
  });
});

describe('custom measurers', () => {
  it('implement the same interface', () => {
    const grid: Measurer = {
      id: 'grid',
      width: (text) => text.length,
      metrics: () => ({ ascent: 1, descent: 0, lineHeight: 1 }),
    };
    expect(grid.width('abc', arial, 0)).toBe(3);
  });
});

describe('resolveFontFamily', () => {
  it("defaults to v12's font stack", () => {
    expect(DEFAULT_FONT_FAMILY).toBe('"trebuchet ms", verdana, arial, sans-serif');
    expect(resolveFontFamily()).toBe(DEFAULT_FONT_FAMILY);
    expect(resolveFontFamily('  ', '')).toBe(DEFAULT_FONT_FAMILY);
  });

  it('prefers the --mermaid-fontFamily variable, which is what the page draws with', () => {
    expect(resolveFontFamily('Inter, sans-serif', ' Roboto, sans-serif ')).toBe(
      'Roboto, sans-serif'
    );
    expect(resolveFontFamily('Inter, sans-serif', undefined)).toBe('Inter, sans-serif');
    expect(resolveFontFamily('Inter, sans-serif', ' ')).toBe('Inter, sans-serif');
  });
});
