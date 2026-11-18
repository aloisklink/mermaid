import { describe, expect, it } from 'vitest';
import {
  assertInert,
  checkColor,
  checkFilter,
  checkLinkTarget,
  checkStyle,
  checkUrl,
  inertProblem,
  streamWriter,
  translate,
  treeWriter,
  type SecurityLevel,
  type SvgWriter,
} from './index.js';
import { PAYLOADS, V12_XSS_CASES } from './testing/index.js';

// Writes hostile input through every writer entry point a renderer uses, the way a renderer
// would: text and labels as text, ids and classes as attributes, links through checkUrl,
// targets through checkLinkTarget, styles through checkStyle, colours through checkColor.
function document(
  w: SvgWriter,
  input: {
    text?: readonly string[];
    urls?: readonly string[];
    styles?: readonly string[];
    values?: readonly string[];
  },
  securityLevel: SecurityLevel
): void {
  w.open('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: [0, 0, 100, 100],
    role: 'img',
    'aria-labelledby': 'p-title',
  });
  for (const t of input.text ?? []) {
    w.open('title', { id: t });
    w.text(t);
    w.close();
    w.open('g', { class: t, 'data-id': t, transform: translate(1, 2) });
    w.label(
      {
        lines: [[{ text: t }], [{ text: t, bold: true }]],
        lineHeight: 20,
        height: 40,
        baseline: 14,
      },
      0,
      0,
      { class: t }
    );
    w.close();
  }
  for (const u of input.urls ?? []) {
    w.open('a', { href: checkUrl(u, { securityLevel }), target: checkLinkTarget(u) ?? '_blank' });
    w.open('title');
    w.text(u);
    w.close();
    w.close();
  }
  for (const s of input.styles ?? []) {
    const style = checkStyle(s.split(','));
    w.leaf('rect', { ...style.shape, width: 1, height: 1 });
    w.open('text', style.text);
    w.text(s);
    w.close();
  }
  for (const v of input.values ?? []) {
    w.leaf('rect', { fill: checkColor(v), stroke: checkColor(v), class: v });
    const style = checkStyle([`font-family:${v}`, `fill:${v}`]);
    w.open('text', style.text);
    w.text(v);
    w.close();
  }
  w.close();
}

const LEVELS: SecurityLevel[] = ['default', 'strict'];

describe('v12 XSS/GHSA cases', () => {
  for (const c of V12_XSS_CASES) {
    it(`stay inert through the writer: ${c.id}`, () => {
      for (const securityLevel of LEVELS) {
        const s = streamWriter();
        document(s, c, securityLevel);
        const t = treeWriter();
        document(t, c, securityLevel);
        const out = s.finish();
        expect(t.finish()).toBe(out);
        assertInert(out, { securityLevel });
        expect(out).not.toMatch(/<(?:script|style|img|iframe|foreignObject|div|p)\b/i);
      }
    });
  }
});

describe('hostile payloads', () => {
  it('stay inert in every entry point', () => {
    for (const p of PAYLOADS) {
      for (const securityLevel of LEVELS) {
        const w = streamWriter();
        document(
          w,
          { text: [p], urls: [p], styles: [`fill:${p}`, `${p}:red`, `stroke:${p}`], values: [p] },
          securityLevel
        );
        assertInert(w.finish(), { securityLevel });
      }
    }
  });

  it('never write <style> in default output', () => {
    const w = streamWriter();
    document(w, { text: PAYLOADS, urls: PAYLOADS, styles: PAYLOADS, values: PAYLOADS }, 'default');
    const out = w.finish();
    expect(out).not.toContain('<style');
    // @ts-expect-error -- <style> is not a tag the writer knows
    expect(() => streamWriter().open('style')).toThrow(TypeError);
  });
});

describe('assertInert', () => {
  const OK = [
    '',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100%" role="img"><g class="a"><rect x="1" y="-2.5" width="3" height="4"/></g></svg>',
    '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"/>',
    '<a href="/relative"><text x="0" y="0">a &lt; b &amp; &#169;</text></a>',
    '<svg style="max-width:10px;--_pf:var(--mermaid-primaryColor,#fff)"/>',
    '<path d="M0,0L10,10C1,2 3,4 5,6Z" transform="translate(1,2) rotate(45)"/>',
    '<rect filter="var(--_ds)"/>',
    '<rect filter="drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))"/>',
    '<rect filter="none"/>',
    '<g data-color-id="color-0"/>',
    '<g data-color-id="color-11"/>',
    '<path fill-rule="evenodd" clip-rule="nonzero" d="M0 0h4v4z"/>',
    '<svg style="--_ds:var(--mermaid-dropShadow,drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06)))"/>',
  ];
  for (const svg of OK) {
    it(`accepts ${svg.slice(0, 60)}`, () => {
      expect(inertProblem(svg)).toBeUndefined();
    });
  }

  // What the v12 attacks would have produced if they got through, plus structural tricks.
  const BAD = [
    '<script>alert(1)</script>',
    '<svg><style>*{background:red}</style></svg>',
    '<foreignObject><div>x</div></foreignObject>',
    '<image href="x" onerror="xssAttack()"/>',
    '<g onload="alert(1)"/>',
    '<a href="javascript:xssAttack()">x</a>',
    '<a href="JaVaScRiPt:alert(1)"/>',
    '<a href="&#106;avascript:alert(1)"/>',
    '<a href=" &#x09;javascript:alert(1)"/>',
    '<a href="java&#x0A;script:alert(1)"/>',
    '<a href="%6A%61%76%61%73%63%72%69%70%74:alert(1)"/>',
    '<a href="data:text/html,x"/>',
    '<a href="//evil.example/x"/>',
    '<a href="\\\\evil.example\\x"/>',
    '<a href="https://example.com" target="_blank"/>',
    '<a href="https://example.com" target="frame"/>',
    '<g href="https://example.com"/>',
    '<rect fill="url(https://evil.example/x.svg#a)"/>',
    '<rect filter="url(#drop-shadow)"/>',
    '<rect filter="url(https://evil.example/f.svg#x)"/>',
    '<rect filter="blur(2px)"/>',
    '<rect filter="var(--evil)"/>',
    '<rect filter="drop-shadow(4px 4px 0 red) url(#x)"/>',
    '<rect filter="drop-shadow(4px 4px 0 red);x:y"/>',
    '<rect filter="drop-shadow(999999px 999999px 999999px red)"/>',
    '<g data-color-id="red"/>',
    '<g data-color-id="color-1;x"/>',
    '<g data-color-id="color-1234"/>',
    '<path fill-rule="url(#a)"/>',
    '<path clip-rule="inherit;x:y"/>',
    '<rect style="background:url(x)"/>',
    '<rect style="background:red"/>',
    '<rect style="fill:red;}body{x:y"/>',
    '<rect x="1)expression(alert(1)"/>',
    '<rect x="NaN"/>',
    '<path d="M0,0 url(x)"/>',
    '<g transform="translate(1,2) url(x)"/>',
    '<g xmlns="http://www.w3.org/1999/xhtml"/>',
    '<text>a & b</text>',
    '<text>a > b</text>',
    '<g class="a" class="b"/>',
    '<g class=a/>',
    '<g class="a>',
    '<g>',
    '</g>',
    '<g></text>',
    '<!-- comment -->',
    '<![CDATA[x]]>',
    '<?xml version="1.0"?>',
    '<!DOCTYPE svg>',
    '<text>\u0000</text>',
    '<svg:script/>',
  ];
  for (const svg of BAD) {
    it(`refuses ${JSON.stringify(svg).slice(0, 70)}`, () => {
      expect(inertProblem(svg)).toBeTypeOf('string');
      expect(() => assertInert(svg)).toThrow(/not inert/);
    });
  }

  it('refuses scheme links at the strict level', () => {
    const svg = '<a href="https://example.com"/>';
    expect(inertProblem(svg)).toBeUndefined();
    expect(inertProblem(svg, { securityLevel: 'strict' })).toMatch(/scheme/);
  });

  it('re-checks output after a postRender hook edits the tree', () => {
    const w = treeWriter();
    w.open('a', { href: checkUrl('/ok', {}) });
    w.close();
    const [link] = w.tree.find({ tag: 'a' });
    // An untyped hook gets past the type system; the post-hook check still catches it.
    w.tree.setAttr(link!, 'href', 'javascript:alert(1)' as never);
    expect(() => assertInert(w.finish())).toThrow(/scheme/);
  });
});

describe('checkFilter: the drop-shadow allow-list (#85)', () => {
  const OK: [string, string][] = [
    ['none', 'none'],
    ['drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))', 'drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))'],
    ['  drop-shadow(4px 4px 0px #000)  ', 'drop-shadow(4px 4px 0px #000)'],
    ['drop-shadow(-2px 3px)', 'drop-shadow(-2px 3px)'],
    [
      'drop-shadow(1px 1px 2px red) drop-shadow(0 0 1px blue)',
      'drop-shadow(1px 1px 2px red) drop-shadow(0 0 1px blue)',
    ],
    [
      'drop-shadow(4px 4px 0 var(--mermaid-shadowColor))',
      'drop-shadow(4px 4px 0 var(--mermaid-shadowColor))',
    ],
  ];
  it.each(OK)('accepts %s', (input, out) => {
    expect(checkFilter(input)).toBe(out);
  });

  it.each([
    '',
    'url(#drop-shadow)',
    'url(https://evil.example/f.svg#x)',
    'drop-shadow(4px 4px 0 red) url(#x)',
    'blur(2px)',
    'drop-shadow(4px)',
    'drop-shadow(4px 4px 0 1px red)',
    'drop-shadow(4px 4px 0 url(x))',
    'drop-shadow(4px 4px 0 expression(alert(1)))',
    'drop-shadow(4px 4px 0 var(--evil))',
    'drop-shadow(4px 4px 0 red',
    'drop-shadow(4px 4px 0 red))',
    'drop-shadow(4px 4px 0 red);fill:red',
    'drop-shadow(4px 4px 0 "red")',
    'javascript:alert(1)',
    'none none',
    ...PAYLOADS,
  ])('refuses %j', (input) => {
    expect(checkFilter(input)).toBeUndefined();
  });

  it('caps every shadow length at 100px, so a filter cannot cost unbounded render time', () => {
    expect(checkFilter('drop-shadow(100px -100px 100px red)')).toBe(
      'drop-shadow(100px -100px 100px red)'
    );
    expect(checkFilter('drop-shadow(6em 6rem 6.25em)')).toBe('drop-shadow(6em 6rem 6.25em)');
    for (const v of [
      'drop-shadow(101px 0)',
      'drop-shadow(0 -101px)',
      'drop-shadow(0 0 101px red)',
      'drop-shadow(7em 0)',
      'drop-shadow(0 0 7rem)',
      'drop-shadow(999999px 999999px 999999px red)',
      Array(4).fill('drop-shadow(999999px 999999px 999999px red)').join(' '),
    ])
      expect(checkFilter(v), v).toBeUndefined();
  });

  it('refuses a negative blur radius, which CSS does not allow', () => {
    expect(checkFilter('drop-shadow(1px 1px -2px red)')).toBeUndefined();
  });

  it('refuses more than four shadows', () => {
    expect(checkFilter(Array(5).fill('drop-shadow(1px 1px)').join(' '))).toBeUndefined();
  });

  it('keeps hostile payloads out of the written filter attribute', () => {
    const w = streamWriter();
    w.open('svg', { xmlns: 'http://www.w3.org/2000/svg' });
    for (const p of PAYLOADS) w.leaf('rect', { filter: checkFilter(p) });
    w.close();
    assertInert(w.finish());
  });
});

describe('cursor attribute', () => {
  it('accepts the one keyword pointer (D605)', () => {
    expect(inertProblem('<g cursor="pointer"/>')).toBeUndefined();
    const w = treeWriter();
    w.open('g', { cursor: 'pointer' });
    w.close();
    expect(w.finish()).toContain('cursor="pointer"');
  });

  for (const v of [
    'default',
    'move',
    'pointer;x:y',
    'url(https://evil.example/c.cur)',
    'Pointer',
    '',
  ]) {
    it(`refuses cursor=${JSON.stringify(v)}`, () => {
      expect(inertProblem(`<g cursor="${v}"/>`)).toBeTypeOf('string');
    });
  }
});

describe('animate element (D606)', () => {
  const ANIMATE =
    '<animate attributeName="stroke-dashoffset" from="900" to="0" dur="20" repeatCount="indefinite"/>';

  it('accepts a dash offset running between two numbers, forever', () => {
    expect(inertProblem(`<g>${ANIMATE}</g>`)).toBeUndefined();
    for (const w of [streamWriter(), treeWriter()]) {
      w.open('g');
      w.leaf('animate', {
        attributeName: 'stroke-dashoffset',
        from: 900,
        to: 0,
        dur: 20,
        repeatCount: 'indefinite',
      });
      w.close();
      expect(w.finish()).toBe(`<g>${ANIMATE}</g>`);
    }
  });

  // What makes SMIL dangerous: another target, a list of values, a trigger, an event, a link.
  for (const attrs of [
    'attributeName="href" from="900" to="0"',
    'attributeName="xlink:href"',
    'attributeName="onclick"',
    'attributeName="stroke-dashoffset;href"',
    'attributeName="stroke-dashoffset" values="javascript:alert(1)"',
    'attributeName="stroke-dashoffset" from="javascript:alert(1)"',
    'attributeName="stroke-dashoffset" to="url(#x)"',
    'attributeName="stroke-dashoffset" dur="1s;x"',
    'attributeName="stroke-dashoffset" begin="x.click"',
    'attributeName="stroke-dashoffset" onbegin="alert(1)"',
    'attributeName="stroke-dashoffset" onrepeat="alert(1)"',
    'attributeName="stroke-dashoffset" href="#x"',
    'attributeName="stroke-dashoffset" attributeType="XML"',
    'attributeName="stroke-dashoffset" repeatCount="1"',
  ]) {
    it(`refuses <animate ${attrs}>`, () => {
      expect(inertProblem(`<g><animate ${attrs}/></g>`)).toBeTypeOf('string');
    });
  }

  for (const tag of ['set', 'animateTransform', 'animateMotion', 'mpath', 'discard']) {
    it(`refuses <${tag}>`, () => {
      expect(inertProblem(`<g><${tag}/></g>`)).toBe(`element <${tag}>`);
      // @ts-expect-error not an allowed tag
      expect(() => streamWriter().leaf(tag, {})).toThrow(TypeError);
    });
  }
});
