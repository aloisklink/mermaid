import { describe, expect, it } from 'vitest';
import type { Warning } from '../pipeline/types.js';
import {
  inlineSpans,
  layoutLabel,
  tableMeasurer,
  type FontKey,
  type InlineProvider,
  type InlineRequest,
  type MeasuredLabel,
} from './index.js';

// Arial at 10px: a 5.56, space 2.78; ascent 9.05, line height 11.5.
const arial: FontKey = { family: 'Arial', size: 10, weight: 400 };

/** A fixture provider: `$$…$$` becomes a box 4 px wide per source character. */
const fixture = (height = 8, baseline = 6): InlineProvider => ({
  open: '$$',
  close: '$$',
  box: (source) => ({
    width: 4 * source.length,
    height,
    baseline,
    node: { tag: 'rect', attrs: { width: 4 * source.length, height } },
  }),
});

function layout(
  raw: string,
  max = Infinity,
  providers: readonly InlineProvider[] = [fixture()],
  markdown = false,
  warnings: Warning[] = []
): MeasuredLabel {
  const inline = inlineSpans(providers, (w) => void warnings.push(w));
  return layoutLabel(raw, arial, max, tableMeasurer, { markdown, inline });
}

/** Each line as its runs: text, or `[box <width>]`. */
const shape = (label: MeasuredLabel): string[][] =>
  label.lines.map((line) => line.map((r) => (r.kind === 'box' ? `[box ${r.width}]` : r.text)));

describe('inline boxes in label layout (D177)', () => {
  it('measures a delimited span as one box run that keeps its source as text', () => {
    const label = layout('a $$xy$$ a');
    expect(shape(label)).toEqual([['a ', '[box 8]', ' a']]);
    expect(label.lines[0]![1]).toMatchObject({
      kind: 'box',
      text: '$$xy$$',
      width: 8,
      height: 8,
      baseline: 6,
    });
    expect(label.width).toBeCloseTo(5.56 + 2.78 + 8 + 2.78 + 5.56, 9);
  });

  it('wraps a box as one unbreakable piece at every width', () => {
    // 'aaa' = 16.68, space 2.78, the box 4 × 4 = 16.
    const src = 'aaa $$wxyz$$ aaa';
    expect(shape(layout(src))).toEqual([['aaa ', '[box 16]', ' aaa']]);
    expect(shape(layout(src, 40))).toEqual([['aaa ', '[box 16]'], ['aaa']]);
    expect(shape(layout(src, 20))).toEqual([['aaa'], ['[box 16]'], ['aaa']]);
    // Narrower than the box: alone on its line, never split.
    expect(shape(layout(src, 12))).toEqual([['aa'], ['a'], ['[box 16]'], ['aa'], ['a']]);
  });

  it('hands the provider the TeX untouched by line breaks, markdown or HTML', () => {
    const seen: string[] = [];
    const recording: InlineProvider = {
      ...fixture(),
      box: (source, request) => (seen.push(source), fixture().box(source, request)),
    };
    const label = layout('**b** $$\\nabla_x *y* <b>$$ _i_', Infinity, [recording], true);
    expect(seen).toEqual(['\\nabla_x *y* <b>']);
    expect(label.lines.map((line) => line.map((r) => [r.text, r.kind ?? r.style]))).toEqual([
      [
        ['b', 1],
        [' ', 0],
        ['$$\\nabla_x *y* <b>$$', 'box'],
        [' ', 0],
        ['i', 2],
      ],
    ]);
  });

  it('gives the provider the font, its metrics and its ex in px (half the font size)', () => {
    let request: InlineRequest | undefined;
    const spy: InlineProvider = {
      ...fixture(),
      box: (s, r) => ((request = r), fixture().box(s, r)),
    };
    layout('$$x$$', Infinity, [spy]);
    expect(request?.font).toEqual(arial);
    expect(request?.ex).toBe(5);
    expect(request?.metrics).toEqual(tableMeasurer.metrics(arial));
  });

  it('grows a line around a box taller than the font, keeping baselines aligned', () => {
    const { ascent } = tableMeasurer.metrics(arial);
    // Above the baseline: max(ascent 9.05, 20); below: max(2.45, 30 - 20).
    const label = layout('a $$x$$<br>b', Infinity, [fixture(30, 20)]);
    expect(label.baselines).toEqual([20, 30 + ascent]);
    expect(label.height).toBeCloseTo(30 + 11.5, 9);
    // A box that fits the line leaves the label's lines as text would have them.
    expect(layout('a $$x$$').baselines).toBeUndefined();
    expect(layout('a $$x$$').height).toBeCloseTo(11.5, 9);
  });

  it('never takes a character reference that decodes to a placeholder for a box', () => {
    expect(shape(layout('$$x$$ &#xFDD0;'))).toEqual([['[box 4]', ' \ufdd0']]);
    expect(shape(layout('`a $$x$$ &#xFDD0;`', Infinity, [fixture()], true))).toEqual([
      // Inline code keeps references as written; its box placeholders are still boxes.
      ['a ', '[box 4]', ' &#xFDD0;'],
    ]);
  });

  it('keeps a span as written when its provider declines it', () => {
    const declining: InlineProvider = { open: '$$', close: '$$', box: () => undefined };
    const warnings: Warning[] = [];
    expect(shape(layout('a $$x$$', Infinity, [declining], false, warnings))).toEqual([['a $$x$$']]);
    expect(warnings).toEqual([]);
  });

  it('without a provider lays out as before and warns MATH_NOT_RENDERED once per render', () => {
    const warnings: Warning[] = [];
    const inline = inlineSpans([], (w) => void warnings.push(w));
    for (const raw of ['From $$x(t)$$ to $$y(t)$$', '$$\\nabla$$', 'no math', 'a $$ b']) {
      const plain = layoutLabel(raw, arial, 30, tableMeasurer);
      expect(layoutLabel(raw, arial, 30, tableMeasurer, { inline })).toEqual(plain);
    }
    expect(warnings.map((w) => w.code)).toEqual(['MATH_NOT_RENDERED']);
    expect(warnings[0]!.message).not.toMatch(/@mermaid-js|plugin/);
  });

  it('does not warn about math for a label without a complete $$…$$ pair', () => {
    const warnings: Warning[] = [];
    layout('price $$5', Infinity, [], false, warnings);
    expect(warnings).toEqual([]);
  });
});
