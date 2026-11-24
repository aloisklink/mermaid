import { describe, expect, it } from 'vitest';
import { streamWriter } from './index.js';

describe('SvgWriter (streaming)', () => {
  it('writes nested elements, leaves and text in call order', () => {
    const w = streamWriter();
    w.open('g', { class: 'nodes' });
    w.leaf('rect', { x: 1, y: 2, width: 30, height: 40 });
    w.open('text', { x: 5, y: 6 });
    w.text('hi');
    w.close();
    w.close();
    expect(w.finish()).toBe(
      '<g class="nodes"><rect x="1" y="2" width="30" height="40"/><text x="5" y="6">hi</text></g>'
    );
  });

  it('escapes text content', () => {
    const w = streamWriter();
    w.open('text');
    w.text('a < b && c > "d" \'e\'');
    w.close();
    expect(w.finish()).toBe("<text>a &lt; b &amp;&amp; c &gt; &quot;d&quot; 'e'</text>");
  });

  it('escapes attribute values so they cannot break out of the quotes', () => {
    const w = streamWriter();
    w.leaf('g', { class: 'x" onload="alert(1)', 'data-id': '<script>&' });
    expect(w.finish()).toBe(
      '<g class="x&quot; onload=&quot;alert(1)" data-id="&lt;script&gt;&amp;"/>'
    );
  });

  it('drops characters that are not allowed in XML', () => {
    const w = streamWriter();
    w.open('text');
    w.text('a\u0000b\u0008c\u000bd\u001fe\u007ff￾g￿h\ud800i\tj\nk');
    w.close();
    expect(w.finish()).toBe('<text>abcdefghi\tj\nk</text>');
  });

  it('writes tab, LF and CR in attribute values as character references (#208)', () => {
    const w = streamWriter();
    w.leaf('g', { 'data-ast': 'n:a\tb\nc\r\nd' });
    w.open('text');
    w.text('a\tb\nc');
    w.close();
    // An XML reader turns a raw tab, LF or CR in an attribute into a space; text keeps them.
    expect(w.finish()).toBe('<g data-ast="n:a&#9;b&#10;c&#13;&#10;d"/><text>a\tb\nc</text>');
  });

  it('keeps astral characters (valid surrogate pairs)', () => {
    const w = streamWriter();
    w.open('text');
    w.text('😀 𝄞');
    w.close();
    expect(w.finish()).toBe('<text>😀 𝄞</text>');
  });

  it('formats numbers to at most two decimals without trailing zeros', () => {
    const w = streamWriter();
    w.leaf('rect', { x: 0, y: -0, width: 1.5, height: 2.006 });
    w.leaf('rect', { x: 10.1, y: -3.14159, width: 1e-9, height: 123456.789 });
    w.leaf('rect', { x: 0.1 + 0.2, y: -0.004, width: 7.999, height: 2.05 });
    expect(w.finish()).toBe(
      '<rect x="0" y="0" width="1.5" height="2.01"/>' +
        '<rect x="10.1" y="-3.14" width="0" height="123456.79"/>' +
        '<rect x="0.3" y="0" width="8" height="2.05"/>'
    );
  });

  it('refuses non-finite numbers', () => {
    const w = streamWriter();
    expect(() => w.leaf('rect', { x: Number.NaN })).toThrow(RangeError);
    expect(() => w.leaf('rect', { y: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });

  it('skips attributes whose value is undefined', () => {
    const w = streamWriter();
    w.leaf('rect', { x: 1, y: undefined, class: 'a' });
    expect(w.finish()).toBe('<rect x="1" class="a"/>');
  });

  it('refuses tags and attributes outside the allow-list at runtime too', () => {
    const w = streamWriter();
    // @ts-expect-error -- not an allowed tag
    expect(() => w.open('script')).toThrow(TypeError);
    // @ts-expect-error -- not an allowed tag
    expect(() => w.leaf('foreignObject')).toThrow(TypeError);
    // @ts-expect-error -- not an allowed attribute
    expect(() => w.leaf('g', { onload: 'alert(1)' })).toThrow(TypeError);
  });

  it('refuses unbalanced close and unfinished elements', () => {
    const w = streamWriter();
    expect(() => w.close()).toThrow(Error);
    const v = streamWriter();
    v.open('g');
    expect(() => v.finish()).toThrow(Error);
  });

  it('rejects text outside an element that can hold it', () => {
    const w = streamWriter();
    w.open('rect');
    expect(() => w.text('x')).toThrow(TypeError);
  });
});

describe('SvgWriter label', () => {
  it('centres each line on the point by default', () => {
    const w = streamWriter();
    w.label(
      { lines: [[{ text: 'ab' }], [{ text: 'c' }]], lineHeight: 10, height: 20, baseline: 8 },
      50,
      20
    );
    expect(w.finish()).toBe(
      '<text text-anchor="middle" xml:space="preserve"><tspan x="50" y="18">ab</tspan><tspan x="50" y="28">c</tspan></text>'
    );
  });

  it('draws a left-aligned label (bullet lists) from the box edge plus each line indent', () => {
    const w = streamWriter();
    w.label(
      {
        lines: [[{ text: '• ab' }], [{ text: 'cd' }]],
        lineHeight: 10,
        height: 20,
        baseline: 8,
        left: true,
        width: 40,
        indents: [0, 7.5],
      },
      50,
      20
    );
    expect(w.finish()).toBe(
      '<text text-anchor="start" xml:space="preserve"><tspan x="30" y="18">• ab</tspan><tspan x="37.5" y="28">cd</tspan></text>'
    );
  });

  it('starts a left-aligned label of one plain run at the box edge (#206)', () => {
    const w = streamWriter();
    w.label(
      {
        lines: [[{ text: 'ab' }]],
        lineHeight: 10,
        height: 10,
        baseline: 8,
        left: true,
        width: 40,
        indents: [2],
      },
      50,
      20,
      { class: 'label' }
    );
    expect(w.finish()).toBe('<text class="label" x="32" y="23" text-anchor="start">ab</text>');
  });
});
