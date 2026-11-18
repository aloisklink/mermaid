import { describe, expect, it } from 'vitest';
import {
  checkColor,
  checkUrl,
  px,
  streamWriter,
  translate,
  treeWriter,
  type Attrs,
  type LabelBox,
  type SvgWriter,
} from './index.js';
import { PAYLOADS } from './testing/index.js';

// A writer-call corpus: each program is a list of writer calls, replayed on both backings.
type Program = (w: SvgWriter) => void;

const label = (lines: LabelBox['lines']): LabelBox => ({
  lines,
  lineHeight: 24,
  height: lines.length * 24,
  baseline: 17,
});

const HANDWRITTEN: Program[] = [
  () => undefined,
  (w) => w.leaf('rect'),
  (w) => {
    w.open('g');
    w.close();
  },
  (w) => {
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 100.5, 50], role: 'img' });
    w.open('title', { id: 'p-title' });
    w.text('Title & <more>');
    w.close();
    w.open('g', { class: 'nodes', transform: translate(10, 20.256) });
    w.leaf('path', {
      d: w.path().moveTo(0, 0).lineTo(10, 10).curveTo(1, 2, 3, 4, 5, 6).close().done(),
    });
    w.leaf('polygon', { points: [0, 0, 10, 0, 5, 8.333] });
    w.close();
    w.close();
  },
  (w) => {
    const href = checkUrl('https://example.com/?a=1&b="2"', {});
    w.open('a', { href, target: '_blank' });
    w.leaf('rect', { width: 1, height: 1 });
    w.close();
    w.open('a', { rel: 'noopener noreferrer', href, target: '_blank' });
    w.close();
    w.open('a', { href, target: '_self' });
    w.close();
  },
  (w) => w.label(label([[{ text: 'single' }]]), 50, 20, { class: 'label' }),
  (w) =>
    w.label(
      label([
        [{ text: 'bold', bold: true }, { text: ' and ' }, { text: 'it', italic: true }],
        [],
        [{ text: 'u', underline: true }],
      ]),
      0,
      0
    ),
  (w) => w.label(label([]), 0, 0),
  (w) => w.label({ ...label([[{ text: 'left' }]]), left: true, width: 30, indents: [4] }, 50, 20),
  (w) => w.leaf('g', { 'data-ast': 'n:a\tb\nc\r\nd', class: 'x\ny' }),
  (w) => {
    w.open('text');
    w.text('');
    w.text('\u0000');
    w.close();
    w.open('text');
    w.text('a');
    w.text('b');
    w.close();
  },
  (w) => w.leaf('rect', { fill: checkColor('#f9f'), stroke: 'none', 'stroke-width': px(2.5) }),
];

// Seeded LCG, as in Pele's fuzz corpus.
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomProgram(seed: number): Program {
  return (w) => {
    const rnd = random(seed);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
    const text = (): string => pick(PAYLOADS) + (rnd() < 0.3 ? pick(PAYLOADS) : '');
    const n = (): number => (rnd() - 0.5) * 10 ** Math.floor(rnd() * 6);
    const attrs = (): Attrs => {
      const a: Record<string, unknown> = {};
      if (rnd() < 0.5) a.class = text();
      if (rnd() < 0.5) a['data-id'] = text();
      if (rnd() < 0.5) a.x = n();
      if (rnd() < 0.3) a.y = n();
      if (rnd() < 0.2) a.fill = checkColor(text()) ?? 'none';
      if (rnd() < 0.2) a.transform = translate(n(), n());
      return a as Attrs;
    };
    let depth = 0;
    const steps = 1 + Math.floor(rnd() * 40);
    for (let i = 0; i < steps; i++) {
      const r = rnd();
      if (r < 0.25) {
        w.open(pick(['g', 'a', 'text', 'tspan', 'title'] as const), attrs());
        depth++;
      } else if (r < 0.45 && depth > 0) {
        w.close();
        depth--;
      } else if (r < 0.65) {
        w.leaf(pick(['rect', 'circle', 'path', 'line'] as const), attrs());
      } else if (r < 0.85) {
        w.label(
          label([[{ text: text(), bold: rnd() < 0.3 }], [{ text: text() }]]),
          n(),
          n(),
          attrs()
        );
      } else if (depth > 0) {
        try {
          w.text(text());
        } catch {
          // the open element cannot hold text; both backings refuse it the same way
        }
      }
    }
    while (depth-- > 0) w.close();
  };
}

function both(program: Program): [string, string] {
  const s = streamWriter();
  program(s);
  const t = treeWriter();
  program(t);
  return [s.finish(), t.finish()];
}

describe('streaming and tree backings', () => {
  it('give byte-identical output over the handwritten corpus', () => {
    for (const program of HANDWRITTEN) {
      const [a, b] = both(program);
      expect(b).toBe(a);
    }
  });

  it('give byte-identical output over 2000 seeded random programs', () => {
    let chars = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const [a, b] = both(randomProgram(seed));
      if (a !== b) expect(b, `seed ${seed}`).toBe(a);
      chars += a.length;
    }
    expect(chars).toBeGreaterThan(100_000);
  });

  it('write rel="noopener noreferrer" on every _blank link', () => {
    const [out] = both(HANDWRITTEN[4] as Program);
    expect(out).toBe(
      '<a href="https://example.com/?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener noreferrer"><rect width="1" height="1"/></a>' +
        '<a rel="noopener noreferrer" href="https://example.com/?a=1&amp;b=&quot;2&quot;" target="_blank"/>' +
        '<a href="https://example.com/?a=1&amp;b=&quot;2&quot;" target="_self"/>'
    );
  });

  it('write a one-span label as a single centred <text>', () => {
    const [out] = both(HANDWRITTEN[5] as Program);
    expect(out).toBe('<text class="label" x="50" y="25" text-anchor="middle">single</text>');
  });

  it('write a multi-line label as tspans, one baseline per line', () => {
    const [out] = both(HANDWRITTEN[6] as Program);
    expect(out).toBe(
      '<text text-anchor="middle" xml:space="preserve">' +
        '<tspan x="0" y="-19" font-weight="bold">bold</tspan><tspan> and </tspan><tspan font-style="italic">it</tspan>' +
        '<tspan x="0" y="5"> </tspan>' +
        '<tspan x="0" y="29" text-decoration="underline">u</tspan>' +
        '</text>'
    );
  });
});

describe('SvgTree view', () => {
  function sample() {
    const w = treeWriter();
    w.open('g', { class: 'nodes' });
    w.leaf('rect', { class: 'node big', 'data-id': 'A', x: 1 });
    w.open('g', { class: 'node', 'data-id': 'B' });
    w.open('text');
    w.text('B');
    w.close();
    w.close();
    w.close();
    return w;
  }

  it('finds elements by tag, class token and data-id in document order', () => {
    const w = sample();
    const t = w.tree;
    expect(t.find({ class: 'node' }).map((n) => t.getAttr(n, 'data-id'))).toEqual(['A', 'B']);
    expect(t.find({ tag: 'rect' })).toHaveLength(1);
    expect(t.find({ 'data-id': 'B', tag: 'g' })).toHaveLength(1);
    expect(t.find((n) => t.tag(n) === 'text')).toHaveLength(1);
  });

  it('edits attributes, appends and removes before serialisation', () => {
    const w = sample();
    const t = w.tree;
    const [a] = t.find({ 'data-id': 'A' });
    const [b] = t.find({ 'data-id': 'B' });
    t.setAttr(a!, 'x', 5.555);
    t.setAttr(a!, 'fill', checkColor('red'));
    t.setAttr(a!, 'class', undefined);
    const extra = t.append(b!, 'title');
    t.appendText(extra, 'tip <b>');
    t.remove(t.find({ tag: 'text' })[0]!);
    expect(w.finish()).toBe(
      '<g class="nodes"><rect data-id="A" x="5.56" fill="red"/><g class="node" data-id="B"><title>tip &lt;b&gt;</title></g></g>'
    );
  });

  it('adds rel when a hook makes a link open in a new window', () => {
    const w = treeWriter();
    w.open('a', { href: checkUrl('/x', {}) });
    w.close();
    const [link] = w.tree.find({ tag: 'a' });
    w.tree.setAttr(link!, 'target', '_blank');
    expect(w.finish()).toBe('<a href="/x" target="_blank" rel="noopener noreferrer"/>');
  });

  it('accepts only allowed tags and attributes, also from untyped callers', () => {
    const w = sample();
    const t = w.tree;
    const [g] = t.find({ class: 'nodes' });
    // @ts-expect-error -- not an allowed tag
    expect(() => t.append(g!, 'script')).toThrow(TypeError);
    // @ts-expect-error -- not an allowed attribute
    expect(() => t.setAttr(g!, 'onclick', 'x')).toThrow(TypeError);
    // @ts-expect-error -- href needs a SafeUrl, and is not allowed on <g>
    expect(() => t.setAttr(g!, 'href', 'javascript:alert(1)')).toThrow(TypeError);
    expect(() => t.appendText(g!, 'x')).toThrow(TypeError);
  });
});
