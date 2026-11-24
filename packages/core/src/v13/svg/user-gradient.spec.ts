import { describe, expect, it } from 'vitest';
import { BLEND_MODES } from './style.js';
import {
  assertInert,
  checkStyle,
  inertProblem,
  streamWriter,
  styleText,
  treeWriter,
  type GradientRef,
  type LinearGradient,
  type SafeColor,
  type SafeValue,
  type StopColor,
  type SvgGradient,
  type SvgWarning,
  type WriterOptions,
} from './index.js';

const RED = '#d62728' as SafeColor;
const BLUE = '#1f77b4' as SafeColor;
const LINK: LinearGradient = { x1: 10, x2: 90.256, from: RED, to: BLUE };
const ROOT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 10">';
const BOX: SvgGradient = {
  id: 'd1-gradient',
  start: 'var(--mermaid-gradientStart,#0042eb)' as StopColor,
  stop: '#eb0042' as StopColor,
};

/** Draws one path per gradient, stroked with it, on both backings; returns the SVG and refs. */
function draw(gradients: readonly LinearGradient[], options: WriterOptions = {}) {
  const refs: GradientRef[][] = [];
  const out = [streamWriter(options), treeWriter(options)].map((w) => {
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 100, 10] });
    const mine = gradients.map((g) => w.linearGradient(g));
    refs.push(mine);
    for (const stroke of mine) w.leaf('path', { d: w.path().moveTo(0, 0).done(), stroke });
    if (options.gradient) w.leaf('rect', { stroke: `url(#${options.gradient.id})` as GradientRef });
    w.close();
    return w.finish();
  });
  expect(out[0]).toBe(out[1]);
  expect(refs[0]).toEqual(refs[1]);
  return { svg: out[0] as string, refs: refs[0] as GradientRef[] };
}

const idOf = (ref: GradientRef) => ref.slice(5, -1);

describe('SvgWriter.linearGradient: user-space gradients (D391)', () => {
  it('writes one horizontal user-space gradient with two stops into the root’s defs', () => {
    const { svg, refs } = draw([LINK], { idPrefix: () => 'd1' });
    const id = idOf(refs[0]!);
    expect(id).toMatch(/^d1-g-[0-9a-z]{1,7}$/);
    expect(svg).toBe(
      ROOT +
        `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="90.26" y2="0">` +
        '<stop offset="0" stop-color="#d62728"/><stop offset="1" stop-color="#1f77b4"/>' +
        `</linearGradient></defs><path d="M0,0" stroke="url(#${id})"/></svg>`
    );
    assertInert(svg, { gradient: false, scope: 'd1' });
  });

  it('gives equal gradients one id and one element, and different ones their own', () => {
    const { svg, refs } = draw([
      LINK,
      { ...LINK },
      { ...LINK, x2: 90.2551 }, // written as 90.26, so the same gradient
      { ...LINK, y: 3 },
      { ...LINK, from: BLUE, to: RED },
      { ...LINK, x1: 11 },
    ]);
    expect(new Set(refs.slice(0, 3)).size).toBe(1);
    expect(new Set(refs).size).toBe(4);
    expect(svg.match(/<linearGradient /g)).toHaveLength(4);
    expect(svg).toContain('y1="3" x2="90.26" y2="3"');
    assertInert(svg);
  });

  it('is deterministic, the id a hash of the ends and stops', () => {
    expect(draw([LINK]).svg).toBe(draw([LINK]).svg);
    expect(draw([LINK]).refs).toEqual(draw([{ ...LINK }]).refs);
  });

  it('starts every id with the render’s scope, so two renders never share one', () => {
    const a = draw([LINK], { idPrefix: () => 'a' }).refs[0]!;
    const b = draw([LINK], { idPrefix: () => 'b' }).refs[0]!;
    expect(idOf(a)).toMatch(/^a-g-/);
    expect(idOf(b)).toMatch(/^b-g-/);
    // An id prefix that is not an XML name is scoped as styleScope does.
    expect(idOf(draw([LINK], { idPrefix: () => ':r1:' }).refs[0]!)).toMatch(/^p-[0-9a-z]+-g-/);
    expect(idOf(draw([LINK]).refs[0]!)).toMatch(/^mermaid-g-/);
  });

  it('reads the id prefix only when asked for a gradient', () => {
    let reads = 0;
    const idPrefix = () => {
      reads++;
      return 'd1';
    };
    draw([], { idPrefix });
    expect(reads).toBe(0);
    draw([LINK, LINK], { idPrefix });
    expect(reads).toBe(2); // once per backing
  });

  it('keeps ids unique however many gradients a render has', () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ ...LINK, x1: i / 100 }));
    const { svg, refs } = draw(many);
    expect(new Set(refs).size).toBe(many.length);
    assertInert(svg);
  });

  it('writes the render’s gradient (D182) first, byte for byte, then the user-space ones', () => {
    const { svg, refs } = draw([LINK], { gradient: BOX, idPrefix: () => 'd1' });
    expect(svg).toContain(
      '<defs><linearGradient id="d1-gradient" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="var(--mermaid-gradientStart,#0042eb)"/>' +
        `<stop offset="1" stop-color="#eb0042"/></linearGradient><linearGradient id="${idOf(refs[0]!)}"`
    );
    assertInert(svg, { gradient: 'd1-gradient', scope: 'd1' });
  });

  it('keeps the user-space gradients when a postRender edit drops their references', () => {
    const w = treeWriter();
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg' });
    w.open('g');
    w.leaf('path', { stroke: w.linearGradient(LINK) });
    w.close();
    w.close();
    w.tree.remove(w.tree.find({ tag: 'path' })[0]!);
    const svg = w.finish();
    expect(svg).toContain('<linearGradient ');
    assertInert(svg);
  });

  it('refuses a stop colour that is not one, and a number that is not finite', () => {
    const w = streamWriter();
    expect(() => w.linearGradient({ ...LINK, from: 'url(#x)' as SafeColor })).toThrow(
      /stop colour/
    );
    expect(() => w.linearGradient({ ...LINK, to: 'red;x' as SafeColor })).toThrow(/stop colour/);
    expect(() => w.linearGradient({ ...LINK, x2: Number.NaN })).toThrow(RangeError);
    expect(() => w.linearGradient({ ...LINK, y: Infinity })).toThrow(RangeError);
  });

  it('takes theme references as stop colours', () => {
    const from = 'var(--_c0)' as StopColor;
    const to = 'var(--mermaid-gradientStop,#eb0042)' as StopColor;
    const { svg } = draw([{ ...LINK, from, to }]);
    expect(svg).toContain(`<stop offset="0" stop-color="var(--_c0)"/>`);
    assertInert(svg);
  });
});

describe('assertInert: user-space gradients (D391, R-SEC-2)', () => {
  const { svg: OK, refs } = draw([LINK, { ...LINK, x1: 20 }], { idPrefix: () => 'd1' });
  const ID = idOf(refs[0]!);
  const OPEN = `<linearGradient id="${ID}" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="90.26" y2="0">`;
  const FIRST = OK.slice(OK.indexOf(OPEN), OK.indexOf('</linearGradient>') + 17);
  const change = (from: string, to: string) => {
    expect(OK).toContain(from);
    return OK.replace(from, to);
  };
  const foreign =
    '<linearGradient id="d1-g-zzz" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="5" y2="0">' +
    '<stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient>';

  it('accepts exactly what the writer writes, and a planted one of the same shape', () => {
    expect(inertProblem(OK)).toBeUndefined();
    expect(inertProblem(OK, { scope: 'd1' })).toBeUndefined();
    expect(inertProblem(OK, { gradient: false, scope: 'd1' })).toBeUndefined();
    expect(inertProblem(change('</defs>', foreign + '</defs>'), { scope: 'd1' })).toBeUndefined();
  });

  const STOP0 = '<stop offset="0" stop-color="#d62728"/>';
  const bad: [string, string, string?][] = [
    [
      'a gradient of another scope',
      change('</defs>', foreign.replace('d1-g-', 'evil-g-') + '</defs>'),
    ],
    ['a gradient that is not the render’s scope', OK, 'd2'],
    ['an id outside the scope pattern', change(`id="${ID}"`, 'id="d1-link"')],
    ['an id with capitals', change(`id="${ID}"`, 'id="d1-g-ABC"')],
    [
      'a reference to an undeclared gradient',
      change(`stroke="url(#${ID})"`, 'stroke="url(#d1-g-zzz)"'),
    ],
    ['a second gradient with the same id', change('</defs>', FIRST + '</defs>')],
    ['objectBoundingBox units', change(OPEN, OPEN.replace('userSpaceOnUse', 'objectBoundingBox'))],
    ['strokeWidth units', change(OPEN, OPEN.replace('userSpaceOnUse', 'strokeWidth'))],
    ['no units', change(OPEN, OPEN.replace(' gradientUnits="userSpaceOnUse"', ''))],
    ['y1 different from y2', change(OPEN, OPEN.replace('y2="0"', 'y2="1"'))],
    ['a missing x2', change(OPEN, OPEN.replace(' x2="90.26"', ''))],
    ['another attribute in place of y2', change(OPEN, OPEN.replace('y2="0"', 'class="0"'))],
    ['a percent coordinate', change(OPEN, OPEN.replace('x1="10"', 'x1="10%"'))],
    ['a coordinate that is not a number', change(OPEN, OPEN.replace('x1="10"', 'x1="NaN"'))],
    ['a gradientTransform', change(OPEN, OPEN.replace('">', '" gradientTransform="rotate(90)">'))],
    ['an href', change(OPEN, OPEN.replace('">', '" href="#d1-gradient">'))],
    ['a class', change(OPEN, OPEN.replace('">', '" class="x">'))],
    ['a spreadMethod', change(OPEN, OPEN.replace('">', '" spreadMethod="repeat">'))],
    ['a third stop', change(OPEN + STOP0, OPEN + STOP0 + '<stop offset="0.5" stop-color="red"/>')],
    ['one stop', change(OPEN + STOP0 + '<stop offset="1" stop-color="#1f77b4"/>', OPEN + STOP0)],
    ['no stops', change(FIRST, OPEN.replace('">', '"/>'))],
    ['a stop-opacity', change(STOP0, STOP0.replace('/>', ' stop-opacity="0.5"/>'))],
    ['a url stop colour', change('stop-color="#d62728"', 'stop-color="url(#x)"')],
    ['an element with a gradient’s id', change('<path d="M0,0"', `<path id="${ID}" d="M0,0"`)],
    ['a gradient outside defs', change('</svg>', foreign + '</svg>')],
  ];
  it.each(bad)('rejects %s', (_what, svg, scope) => {
    expect(inertProblem(svg, { scope })).toBeDefined();
  });

  it('takes the scope from the render’s gradient (D182) when none is given', () => {
    expect(inertProblem(OK, { gradient: 'd2-gradient' })).toMatch(/is not this SVG's/);
    const { svg } = draw([LINK], { gradient: BOX, idPrefix: () => 'd2' });
    expect(inertProblem(svg)).toMatch(/d2-g-.* is not this SVG's/);
  });

  it.each([
    ['empty', `${ROOT}<defs></defs><g/></svg>`],
    ['self-closing', `${ROOT}<defs/><g/></svg>`],
  ])('rejects %s defs, with or without a render gradient', (_what, svg) => {
    expect(inertProblem(svg)).toMatch(/defs/);
    expect(inertProblem(svg, { gradient: false })).toMatch(/defs/);
  });

  it('still rejects the render’s gradient (D182) where the render has none', () => {
    const { svg } = draw([LINK], { gradient: BOX, idPrefix: () => 'd1' });
    expect(inertProblem(svg, { gradient: 'd1-gradient' })).toBeUndefined();
    expect(inertProblem(svg, { gradient: false })).toMatch(/defs/);
  });
});

describe('mix-blend-mode (D392)', () => {
  const run = (decls: string[]) => {
    const warnings: SvgWarning[] = [];
    return { style: checkStyle(decls, (w) => warnings.push(w)), warnings };
  };

  it('is kept by checkStyle with normal and multiply only, as a style on the shape', () => {
    expect(BLEND_MODES).toEqual(new Set(['normal', 'multiply']));
    expect(run(['mix-blend-mode: multiply']).style).toEqual({
      shape: { style: 'mix-blend-mode:multiply' },
      text: {},
    });
    const { style, warnings } = run(['fill:#f00', 'mix-blend-mode:NORMAL !important']);
    expect(style.shape).toEqual({ fill: '#f00', style: 'mix-blend-mode:normal' });
    expect(warnings).toEqual([]);
  });

  it.each(['screen', 'difference', 'multiply screen', 'var(--x)', 'url(#a)', ''])(
    'drops mix-blend-mode: %s with a warning',
    (value) => {
      const { style, warnings } = run([`mix-blend-mode:${value}`]);
      expect(style.shape).toEqual({});
      expect(warnings.map((w) => w.code)).toEqual(['STYLE_VALUE_DROPPED']);
    }
  );

  it('joins a renderer’s own style as styleText’s tail, so neither replaces the other', () => {
    const { shape } = checkStyle(['mix-blend-mode:multiply']);
    expect(styleText({ width: 3 }, shape.style)).toBe('width:3;mix-blend-mode:multiply');
  });

  it('is written by styleText and accepted by assertInert, with those values only', () => {
    const style = styleText({ 'mix-blend-mode': 'multiply' as SafeValue });
    const svg = (s: string) => `${ROOT}<path d="M0,0" style="${s}"/></svg>`;
    expect(inertProblem(svg(style))).toBeUndefined();
    expect(inertProblem(svg('mix-blend-mode:normal'))).toBeUndefined();
    expect(() => styleText({ 'mix-blend-mode': 'screen' as SafeValue })).toThrow(/Unsafe/);
    expect(inertProblem(svg('mix-blend-mode:screen'))).toMatch(/style/);
    expect(inertProblem(svg('mix-blend-mode:multiply screen'))).toMatch(/style/);
    expect(inertProblem(`${ROOT}<path d="M0,0" mix-blend-mode="multiply"/></svg>`)).toMatch(
      /attribute mix-blend-mode/
    );
  });
});
