import { describe, expect, it } from 'vitest';
import {
  inertProblem,
  streamWriter,
  treeWriter,
  type GradientRef,
  type StopColor,
  type SvgGradient,
  type SvgWriter,
  type ThemeStyleSheet,
} from './index.js';

const G: SvgGradient = {
  id: 'd1-gradient',
  start: 'var(--mermaid-gradientStart,#0042eb)' as StopColor,
  stop: 'var(--mermaid-gradientStop,#eb0042)' as StopColor,
};
const REF = 'url(#d1-gradient)' as GradientRef;
const DEFS =
  '<defs><linearGradient id="d1-gradient" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">' +
  '<stop offset="0" stop-color="var(--mermaid-gradientStart,#0042eb)"/>' +
  '<stop offset="1" stop-color="var(--mermaid-gradientStop,#eb0042)"/></linearGradient></defs>';
const ROOT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">';

function draw(w: SvgWriter, stroke: GradientRef | undefined, sheet = false): void {
  w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 10] });
  if (sheet)
    w.styleSheet(
      'svg[data-p=d1]{}@media (prefers-color-scheme:dark){svg[data-p=d1]{}}' as ThemeStyleSheet
    );
  w.open('g');
  w.leaf('rect', { x: 0, y: 0, width: 4, height: 4, stroke });
  w.close();
  w.close();
}

const both = (gradient: SvgGradient | undefined, stroke: GradientRef | undefined, sheet = false) =>
  [streamWriter({ gradient }), treeWriter({ gradient })].map((w) => {
    draw(w, stroke, sheet);
    return w.finish();
  });

describe('SvgWriter: the render’s gradient (D182)', () => {
  it('writes the defs as the root’s first child when an element refers to it', () => {
    const [stream, tree] = both(G, REF, true);
    expect(stream).toBe(tree);
    expect(stream!.startsWith(ROOT + DEFS + '<style>')).toBe(true);
    expect(stream).toContain('<rect x="0" y="0" width="4" height="4" stroke="url(#d1-gradient)"/>');
    expect(inertProblem(stream!, { themeStyle: true, gradient: 'd1-gradient' })).toBeUndefined();
  });

  it('writes nothing when nothing refers to it, or there is none', () => {
    const plain = both(undefined, undefined);
    expect(both(G, undefined)).toEqual(plain);
    expect(plain[0]).not.toContain('defs');
  });

  it('sees a reference a postRender hook adds or removes', () => {
    const add = treeWriter({ gradient: G });
    draw(add, undefined);
    const [rect] = add.tree.find({ tag: 'rect' });
    add.tree.setAttr(rect!, 'fill', REF);
    expect(add.finish()).toContain(DEFS);
    const drop = treeWriter({ gradient: G });
    draw(drop, REF);
    drop.tree.remove(drop.tree.find({ tag: 'g' })[0]!);
    expect(drop.finish()).not.toContain('defs');
  });

  it('does not let a renderer or a hook write gradient elements itself', () => {
    expect(() => streamWriter().open('defs' as 'g')).toThrow(/not an allowed/);
    expect(() => streamWriter().leaf('stop' as 'g')).toThrow(/not an allowed/);
    const w = treeWriter();
    draw(w, undefined);
    expect(() => w.tree.append(w.tree.root, 'linearGradient' as 'g')).toThrow(/not an allowed/);
    expect(() => streamWriter().leaf('rect', { 'stop-color': '#000' } as never)).toThrow(
      /not allowed on <rect>/
    );
  });
});

describe('assertInert: the gradient (D182, R-SEC-2)', () => {
  const doc = (defs: string, body = `<rect stroke="${REF}"/>`) => `${ROOT}${defs}${body}</svg>`;
  const ok = doc(DEFS);

  it('accepts the writer’s gradient, by its id or found in the document', () => {
    expect(inertProblem(ok)).toBeUndefined();
    expect(inertProblem(ok, { gradient: 'd1-gradient' })).toBeUndefined();
    expect(inertProblem(doc(DEFS, `<rect fill="${REF}"/>`))).toBeUndefined();
    const literal = DEFS.replace(/var\(--mermaid-gradientSt\w+,(#\w+)\)/g, '$1');
    expect(inertProblem(doc(literal))).toBeUndefined();
  });

  const bad: [string, string][] = [
    ['another id', doc(DEFS, '<rect stroke="url(#other-gradient)"/>')],
    ['a scheme', doc(DEFS, '<rect stroke="url(https://x.test/a.svg#d1-gradient)"/>')],
    ['a quoted url', doc(DEFS, `<rect stroke="url('#d1-gradient')"/>`)],
    ['a fallback', doc(DEFS, '<rect stroke="url(#d1-gradient) red"/>')],
    ['color', doc(DEFS, `<rect color="${REF}"/>`)],
    ['filter', doc(DEFS, `<rect filter="${REF}"/>`)],
    ['style', doc(DEFS, `<rect style="stroke:${REF}"/>`)],
    ['no defs', doc('')],
    ['defs that are not the first child', `${ROOT}<g/>${DEFS}</svg>`],
    ['nested defs', `${ROOT}<g>${DEFS}</g></svg>`],
    ['a second defs', doc(DEFS + DEFS)],
    ['an attribute on defs', doc(DEFS.replace('<defs>', '<defs class="x">'))],
    ['an href', doc(DEFS.replace('gradientUnits', 'href="#x" gradientUnits'))],
    ['userSpaceOnUse', doc(DEFS.replace('objectBoundingBox', 'userSpaceOnUse'))],
    ['another direction', doc(DEFS.replace('x2="1"', 'x2="0.5"'))],
    ['a missing coordinate', doc(DEFS.replace(' y2="0"', ''))],
    ['a percent coordinate', doc(DEFS.replace('x2="1"', 'x2="100%"'))],
    ['an id that is not -gradient', doc(DEFS.replace('id="d1-gradient"', 'id="d1"'), '<rect/>')],
    ['a class on a stop', doc(DEFS.replace('<stop offset="0"', '<stop class="a" offset="0"'))],
    ['a url stop colour', doc(DEFS.replace('var(--mermaid-gradientStart,#0042eb)', 'url(#x)'))],
    ['a style stop', doc(DEFS.replace('<stop offset="0"', '<stop style="fill:red" offset="0"'))],
    ['an offset out of range', doc(DEFS.replace('offset="1"', 'offset="2"'))],
    ['a third stop', doc(DEFS.replace('</linearGradient>', '<stop offset="1"/></linearGradient>'))],
    ['a g in defs', doc(DEFS.replace('<defs>', '<defs><g/>'))],
    ['a stop outside the gradient', doc(DEFS, '<g><stop offset="0"/></g>')],
    ['a linearGradient outside defs', doc(DEFS, '<linearGradient/>')],
    ['two gradients', doc(DEFS.replace('</defs>', DEFS.slice(6, -7) + '</defs>'))],
    ['a stop-color on a rect', doc(DEFS, '<rect stop-color="red"/>')],
    ['gradientUnits on a g', doc(DEFS, '<g gradientUnits="objectBoundingBox"/>')],
    ['an element with the gradient’s id', doc(DEFS, '<g id="d1-gradient"/>')],
  ];
  it.each(bad)('rejects %s', (_what, svg) => {
    expect(inertProblem(svg)).toBeDefined();
  });

  it('rejects a gradient that is not the render’s, or any when the render has none', () => {
    expect(inertProblem(ok, { gradient: 'd2-gradient' })).toMatch(/d1-gradient/);
    expect(inertProblem(ok, { gradient: false })).toMatch(/defs/);
  });
});
