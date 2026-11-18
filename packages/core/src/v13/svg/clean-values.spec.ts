import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ATTRS,
  ALLOWED_TAGS,
  GRADIENT_ATTRS,
  HREF_TAGS,
  isAllowedAttr,
  isAllowedTag,
  PLAIN_ATTRS,
} from './allowlist.js';
import { checkTag, formatValue } from './encode.js';
import { inertProblem } from './inert.js';
import { escAttr } from './escape.js';
import { isBuilt, pathBuilder, rotate, scale, transforms, translate } from './path.js';
import { PAYLOADS } from './testing/index.js';
import type { Attrs, PathData, Transform } from './types.js';
import { streamWriter, treeWriter, type LabelBox, type SvgWriter } from './writer.js';

// The stream writer leaves three kinds of value unescaped without testing them: numbers,
// an attribute's code-constant keywords (`PLAIN_ATTRS`), and path data or transforms equal to
// ones `path.ts` built from numbers (`isBuilt`). These specs hold the boundary: any other value,
// however it reaches the writer, is escaped exactly as `escAttr` escapes it, and name checks
// accept and refuse exactly what they did one by one.

/** Strings that must never reach the output as written. */
const HOSTILE: readonly string[] = [
  '"',
  '<',
  '>',
  '&',
  '\t',
  '\n',
  '\r',
  '\x00',
  '\x01',
  '\x08',
  '\x0b',
  '\x1f',
  '\x7f',
  '￾',
  '￿',
  '\ud800',
  '\udfff',
  'a\ud800b',
  'a\udc00b',
  '"/><script>alert(1)</script>',
  "' onload='alert(1)",
  // One character off a keyword, a built path or a transform.
  'none"',
  ' none',
  'none\x00',
  'middle<',
  'preserve&',
  'noopener noreferrer"',
  'M0,0"',
  'M0,0L1,1<',
  'translate(1,2)"',
  'translate(1,2) onload="x',
  ...PAYLOADS,
];

/** The element an attribute is written on: one that allows it. */
const tagFor = (name: string): 'svg' | 'a' | 'g' =>
  name === 'xmlns' ? 'svg' : name === 'href' ? 'a' : 'g';

const writable = [...ALLOWED_ATTRS].filter((n) => !GRADIENT_ATTRS.has(n));

function write(make: () => SvgWriter & { finish(): string }, draw: (w: SvgWriter) => void) {
  const w = make();
  draw(w);
  return w.finish();
}

const both = (draw: (w: SvgWriter) => void): [string, string] => [
  write(streamWriter, draw),
  write(treeWriter, draw),
];

describe('values from outside the writer stay escaped', () => {
  it('in every attribute a renderer or hook can write, on both backings', () => {
    let checked = 0;
    for (const name of writable)
      for (const v of HOSTILE) {
        const tag = tagFor(name);
        const attrs = { [name]: v } as Attrs;
        const [stream, tree] = both((w) => w.leaf(tag, attrs));
        expect(stream, `${name}=${JSON.stringify(v)}`).toBe(`<${tag} ${name}="${escAttr(v)}"/>`);
        expect(tree).toBe(stream);
        checked++;
      }
    expect(checked).toBe(writable.length * HOSTILE.length);
  });

  it('as path data and transforms, after the writer has built real ones', () => {
    for (const v of HOSTILE) {
      const [stream, tree] = both((w) => {
        // Fill the record of built values first, so the hostile value is checked against it.
        const d = w.path().moveTo(0, 0).lineTo(1, 1).done();
        const t = translate(1, 2);
        w.leaf('path', { d, transform: t });
        w.leaf('path', { d: v as PathData, transform: v as Transform });
      });
      const e = escAttr(v);
      expect(stream).toBe(
        `<path d="M0,0L1,1" transform="translate(1,2)"/><path d="${e}" transform="${e}"/>`
      );
      expect(tree).toBe(stream);
    }
  });

  it('as the rel of a _blank link', () => {
    for (const v of HOSTILE) {
      const [stream, tree] = both((w) => {
        w.leaf('a', { rel: v as 'noopener noreferrer' });
        w.leaf('a', { rel: v as 'noopener noreferrer', target: '_blank' });
      });
      expect(stream).toBe(`<a rel="${escAttr(v)}"/><a rel="noopener noreferrer" target="_blank"/>`);
      expect(tree).toBe(stream);
    }
  });

  it('as label attributes and text', () => {
    for (const v of HOSTILE) {
      const [stream, tree] = both((w) =>
        w.label({ lines: [[{ text: v }]], lineHeight: 20, height: 20, baseline: 14 }, 0, 10, {
          class: v,
          fill: v as 'none',
          'text-anchor': v as 'middle',
        })
      );
      const e = escAttr(v);
      // The writer's own text-anchor replaces the caller's, in the caller's place.
      expect(stream).toContain(`<text class="${e}" fill="${e}" text-anchor="middle" x="0" y="14"`);
      expect(stream).not.toMatch(/<(?!\/?text\b)/);
      expect(tree).toBe(stream);
    }
  });
});

describe('keywords written as they are', () => {
  it('are exactly the values escaping leaves unchanged, and only on their own attribute', () => {
    let n = 0;
    for (const [name, keywords] of PLAIN_ATTRS)
      for (const k of keywords) {
        expect(escAttr(k), `${name}=${k}`).toBe(k);
        const [stream, tree] = both((w) => w.leaf('g', { [name]: k } as Attrs));
        expect(stream).toBe(`<g ${name}="${k}"/>`);
        expect(tree).toBe(stream);
        n++;
      }
    expect(n).toBeGreaterThan(30);
  });

  it('are literals of the attribute types, not free text', () => {
    // Free-text attributes (ids, classes, data, styles, paints other than keywords) have none.
    for (const name of ['class', 'id', 'data-id', 'data-ast', 'style', 'aria-label', 'd'])
      expect(PLAIN_ATTRS.get(name)?.size, name).toBe(0);
  });
});

describe('a value cannot be passed off as built', () => {
  it('by writing to a builder: its path data is a private field', () => {
    const b = pathBuilder().moveTo(1, 2);
    (b as unknown as { d: string }).d = '"/><script>alert(1)</script>';
    expect(b.done()).toBe('M1,2');
    expect(isBuilt('"/><script>alert(1)</script>')).toBe(false);
  });

  it('by calling a builder method on another object', () => {
    const proto = Object.getPrototypeOf(pathBuilder()) as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    const fake = { d: '<script>' };
    for (const m of ['done', 'moveTo', 'lineTo', 'close'])
      expect(() => proto[m]!.call(fake, 1, 2), m).toThrow(TypeError);
    expect(isBuilt('<script>')).toBe(false);
  });

  it('by passing anything but finite numbers to a builder', () => {
    const bad: unknown[] = [
      '<script>',
      '1"',
      { valueOf: () => 1, toString: () => '"' },
      [1],
      NaN,
      Infinity,
      undefined,
      null,
      1n,
    ];
    for (const x of bad) {
      const n = x as number;
      expect(() => pathBuilder().moveTo(n, 0), String(x)).toThrow();
      expect(() => pathBuilder().arcTo(1, 1, 0, false, false, 0, n)).toThrow();
      expect(() => translate(0, n)).toThrow();
      expect(() => rotate(n)).toThrow();
      if (x !== undefined) expect(() => rotate(0, 0, n)).toThrow();
      expect(() => scale(n)).toThrow();
    }
  });

  it('by replacing a builder method: what it returns is escaped', () => {
    const proto = Object.getPrototypeOf(pathBuilder()) as { done: () => string };
    const done = proto.done;
    try {
      proto.done = function (this: unknown) {
        done.call(this);
        return '"/><script>alert(1)</script>';
      };
      const svg = write(streamWriter, (w) => w.leaf('path', { d: w.path().moveTo(0, 0).done() }));
      expect(svg).toBe(`<path d="${escAttr('"/><script>alert(1)</script>')}"/>`);
    } finally {
      proto.done = done;
    }
  });

  it('built values are only digits, signs, points, letters, commas, spaces and parentheses', () => {
    const numbers = [
      0,
      -0,
      1,
      -1,
      0.004,
      0.005,
      -0.005,
      1.005,
      12.345,
      -98765.4321,
      1e-9,
      1e10,
      1e11,
      -1e11,
      123456789012.34,
      1e21,
      -1e21,
      1e300,
      -1e300,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      Number.MIN_VALUE,
      Number.EPSILON,
    ];
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      const n = numbers[seed % numbers.length]!;
      const v = n * (seed % 3 === 0 ? 1 : seed / 1e5);
      return Number.isFinite(v) ? v : n;
    };
    for (let i = 0; i < 2000; i++) {
      const r = () => random();
      const d = pathBuilder()
        .moveTo(r(), r())
        .lineTo(r(), r())
        .curveTo(r(), r(), r(), r(), r(), r())
        .quadTo(r(), r(), r(), r())
        .arcTo(r(), r(), r(), i % 2 === 0, i % 3 === 0, r(), r())
        .close()
        .done();
      expect(isBuilt(d)).toBe(true);
      for (const v of [
        d,
        translate(r(), r()),
        rotate(r()),
        rotate(r(), r(), r()),
        scale(r(), r()),
      ]) {
        expect(v).toMatch(/^[A-Za-z0-9.,+\- ()]*$/);
        expect(escAttr(v)).toBe(v);
      }
    }
  });

  it('keeps only the last four built values', () => {
    const first = translate(1, 1);
    for (let i = 2; i <= 5; i++) translate(i, i);
    expect(isBuilt(first)).toBe(false);
    expect(isBuilt(translate(9, 9))).toBe(true);
  });
});

describe('transforms() joins caller strings, so its result is never trusted', () => {
  it('is never recorded as built, even when every part was', () => {
    const joined = transforms(translate(1, 2), scale(2));
    expect(isBuilt(joined)).toBe(false);
    for (const v of HOSTILE) {
      expect(isBuilt(transforms(v as Transform)), JSON.stringify(v)).toBe(false);
      expect(isBuilt(transforms(translate(1, 2), v as Transform))).toBe(false);
    }
  });

  it('is escaped when written', () => {
    for (const v of HOSTILE) {
      const t = transforms(v as Transform, translate(1, 2));
      const [stream, tree] = both((w) => w.leaf('g', { transform: t }));
      expect(stream, JSON.stringify(v)).toBe(`<g transform="${escAttr(t)}"/>`);
      expect(tree).toBe(stream);
    }
  });

  it('is escaped where the writer joins a boxed label’s own transform', () => {
    // writeBoxed passes the caller's `transform` through transforms() for each box's <g>.
    const box = (): LabelBox => ({
      lines: [
        [
          { text: 'a', width: 10 },
          {
            kind: 'box',
            text: '$x$',
            width: 8,
            height: 8,
            baseline: 6,
            node: { tag: 'rect', attrs: { width: 8, height: 8 } },
          } as LabelBox['lines'][number][number],
        ],
      ],
      lineHeight: 20,
      height: 20,
      baseline: 14,
    });
    for (const v of HOSTILE) {
      const [stream, tree] = both((w) => w.label(box(), 0, 10, { transform: v as Transform }));
      const e = escAttr(v);
      expect(stream, JSON.stringify(v)).toContain(`<text transform="${e}" `);
      expect(stream).toContain(`<g transform="${e} translate(`);
      expect(stream).not.toMatch(/<(?!\/?(text|tspan|g|rect)\b)/);
      expect(tree).toBe(stream);
    }
  });

  // Not pinned: that the record of built values is consulted only for `d` and `transform`.
  // Everything in it escapes to itself, so consulting it for another name cannot change a byte
  // of output, and there is no observable difference to test without instrumenting the writer.
});

describe('name checks resolved once give the same answers', () => {
  // The checks `formatValue` made one by one before `PLAIN_ATTRS`.
  function reference(tag: string, name: string): string | undefined {
    if (GRADIENT_ATTRS.has(name)) return `${name} is not allowed on <${tag}>`;
    if (!isAllowedAttr(name)) return `${name} is not an allowed SVG attribute`;
    if (name === 'href' && !HREF_TAGS.has(tag)) return `href is not allowed on <${tag}>`;
    if (name === 'xmlns' && tag !== 'svg') return `xmlns is only allowed on <svg>`;
    return undefined;
  }

  const error = (f: () => unknown): string | undefined => {
    try {
      f();
      return undefined;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const TAGS = [...ALLOWED_TAGS, 'script', 'foreignObject', 'style', 'SVG', '', '__proto__'];
  const NAMES = [
    ...ALLOWED_ATTRS,
    'onclick',
    'onload',
    'ONLOAD',
    'xlink:href',
    'HREF',
    'href ',
    'formaction',
    'srcdoc',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    '',
  ];

  it('for every element and name, as formatValue and the writers', () => {
    for (const tag of TAGS) {
      expect(error(() => checkTag(tag)) === undefined, tag).toBe(isAllowedTag(tag));
      if (!isAllowedTag(tag)) continue;
      for (const name of NAMES) {
        const want = reference(tag, name);
        expect(
          error(() => formatValue(tag, name, 'x')),
          `<${tag} ${name}>`
        ).toBe(want);
        // An undefined value is skipped before any check, as before.
        expect(formatValue(tag, name, undefined)).toBeUndefined();
        const attrs = JSON.parse(`{${JSON.stringify(name)}:"x"}`) as Attrs;
        expect(error(() => write(streamWriter, (w) => w.leaf(tag as 'g', attrs)))).toBe(want);
        expect(error(() => write(treeWriter, (w) => w.leaf(tag as 'g', attrs)))).toBe(want);
      }
    }
  });

  it('for names inherited from the prototype', () => {
    const attrs = Object.create({ onclick: 'alert(1)' }) as Attrs;
    expect(() => streamWriter().leaf('g', attrs)).toThrow(
      'onclick is not an allowed SVG attribute'
    );
    expect(() => treeWriter().leaf('g', attrs)).toThrow('onclick is not an allowed SVG attribute');
  });
});

describe('the writers’ tables are fixed at module load', () => {
  // Mutating the exported sets after load is unsupported (allowlist.ts). This pins what happens
  // if someone does: the writers keep the lists they started with, while assertInert and the
  // extension checks read the live sets, so the two stop agreeing.
  function restore(set: Set<string>, saved: readonly string[]) {
    set.clear();
    for (const v of saved) set.add(v);
  }

  it('keeps writing an attribute deleted from ALLOWED_ATTRS', () => {
    const attrs = ALLOWED_ATTRS as Set<string>;
    const saved = [...attrs];
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g class="a"/></svg>';
    expect(inertProblem(svg)).toBeUndefined();
    try {
      attrs.delete('class');
      expect(isAllowedAttr('class')).toBe(false);
      const [stream, tree] = both((w) => w.leaf('g', { class: 'a' }));
      expect(stream).toBe('<g class="a"/>');
      expect(tree).toBe(stream);
      expect(inertProblem(svg)).toBeDefined();
    } finally {
      restore(attrs, saved);
    }
    expect([...ALLOWED_ATTRS]).toEqual(saved);
  });

  it('keeps refusing a tag added to ALLOWED_TAGS', () => {
    const tags = ALLOWED_TAGS as Set<string>;
    const saved = [...tags];
    try {
      tags.add('script');
      expect(isAllowedTag('script')).toBe(true);
      expect(() => checkTag('script')).toThrow('<script> is not an allowed SVG element');
      expect(() => streamWriter().leaf('script' as 'g')).toThrow();
      expect(() => treeWriter().leaf('script' as 'g')).toThrow();
    } finally {
      restore(tags, saved);
    }
    expect([...ALLOWED_TAGS]).toEqual(saved);
  });
});
