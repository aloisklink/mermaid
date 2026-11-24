/**
 * Hostile inputs for security tests (`@mermaid-js/core/svg/testing`). Not used at runtime.
 *
 * `PAYLOADS` is Pele's list of strings an attacker might put anywhere a diagram accepts text
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano, tests/support/inert.ts at 3a2f075).
 * `V12_XSS_CASES` are the attacks from mermaid v12's XSS/GHSA e2e pages
 * (`e2e/platform/xss*.html`, `ghsa*.html`, `css-injection.html`, `e2e/other/pr-check/*.spec.js`):
 * the full flowchart sources for renderer tests, and the hostile parts on their own, by the
 * writer entry point they reach.
 */

import type { PathBuilder } from '../path.js';
import type { Attrs } from '../types.js';
import type { OutlineDraw, OutlineRole, OutlineTag, SvgWriter } from '../writer.js';

/* cspell:disable */

export const PAYLOADS: readonly string[] = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<foreignObject><iframe src=javascript:alert(1)></iframe></foreignObject>',
  '</text></g></svg><script>alert(1)</script>',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  "' onload='alert(1)",
  '" onmouseover="alert(1)',
  'x" onclick="alert(1)" y="',
  '#60;script#62;alert(1)#60;/script#62;',
  '#106;avascript:alert(1)',
  '#34; onload=#34;alert(1)',
  'url#40;javascript:alert#40;1#41;#41;',
  'red#59;background:url#40;//evil.example/x#41;',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;script&#62;',
  'url(javascript:alert(1))',
  'expression(alert(1))',
  'red;background:url(//evil.example/x)',
  'red" onload="alert(1)',
  ']]><script>alert(1)</script>',
  '--><script>alert(1)</script>',
  '\u0000\u0001\u0008\u000b\u001f',
  'a\ufffeb\uffffc\ud800d\udc00e#65534;f',
  'u\u0001rl(//evil.example/x)',
  'u\ufffeRL(//evil.example/x)',
  'u\ud800rl(//evil.example/x)',
  'java\ufffescript:alert(1)',
  'java\udc00script:alert(1)',
  'file\uffff:///etc/passwd',
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  '{{7*7}}',
  '${alert(1)}',
  '%0ajavascript:alert(1)',
  'file:///etc/passwd',
  '//evil.example/share',
  '\\\\evil.example\\share',
  '#92;#92;nevil.example/share',
  '\t/#92;nevil.example/share',
  'smb://evil.example/share',
  'obsidian://open?vault=x',
  '\\"><script>',
];

export interface V12XssCase {
  /** The v12 page or spec the case comes from. */
  readonly id: string;
  /** Full diagram source, for renderer tests (flowchart cases only). */
  readonly source?: string;
  /** Hostile text that reaches a label, title or attribute as plain text. */
  readonly text?: readonly string[];
  /** Hostile link URLs. */
  readonly urls?: readonly string[];
  /** Hostile style declarations (`style`/`classDef`/`linkStyle`). */
  readonly styles?: readonly string[];
  /** Hostile colour or font values (themeVariables, fontFamily). */
  readonly values?: readonly string[];
}

export const V12_XSS_CASES: readonly V12XssCase[] = [
  {
    id: 'xss.spec: xss in tags',
    source:
      'graph LR\n      B-->D(<img onerror=location=`javascript\\u003axssAttack\\u0028document.domain\\u0029` src=x>);',
    text: [
      '<img onerror=location=`javascript\\u003axssAttack\\u0028document.domain\\u0029` src=x>',
    ],
  },
  {
    id: 'xss.spec: tags in the css (fontFamily)',
    source:
      "%%{init: { 'fontFamily': '\\\"></style><img src=x onerror=xssAttack()>'} }%%\ngraph LR\n     A --> B",
    values: ['\\"></style><img src=x onerror=xssAttack()>'],
  },
  {
    id: 'xss2: __proto__ in init',
    source:
      "%%{init: { 'theme':'base', '__proto__': {'polluted': 'asdf'}} }%%\ngraph LR\n  A --> B",
    text: ['__proto__', 'polluted'],
  },
  {
    id: 'xss3: fontFamily closes style',
    source:
      "%%{init: { 'fontFamily': '\\\"></style><img src=x onerror=xssAttack()>'} }%%\ngraph LR\n  A --> B",
    values: ['"></style><img src=x onerror=xssAttack()>'],
  },
  {
    id: 'xss4: iframe srcdoc label',
    source:
      '%%{init: {"flowchart": {"htmlLabels": "true"}} }%%\nflowchart\nA["<iframe srcdoc=\'<script src=/exploit.js></script>\'></iframe>"]',
    text: ["<iframe srcdoc='<script src=/exploit.js></script>'></iframe>"],
  },
  {
    id: 'xss5: img onerror with escaped colon',
    source:
      'graph LR\nB-->D("<img onerror=location=`javascript\x3a;xssAttack\u0028\u0029` src=x>");\n',
    text: ['<img onerror=location=`javascript\x3a;xssAttack\u0028\u0029` src=x>'],
  },
  {
    id: 'xss6: img onerror template',
    source: 'graph LR\nA(<img/src/onerror=xssAttack`1`>)',
    text: ['<img/src/onerror=xssAttack`1`>'],
  },
  {
    id: 'xss7: anchor with script in href',
    source: "graph LR\n B(<a href='<script></script>JavaScript:xssAttack`1`'>Click)",
    text: ["<a href='<script></script>JavaScript:xssAttack`1`'>Click"],
    urls: ['<script></script>JavaScript:xssAttack`1`'],
  },
  { id: 'xss8/9: state label img', text: ["<img/src='1'/onerror=xssAttack()>"] },
  { id: 'xss10: class generic', text: ["Square~<img/src='1'/onerror=xssAttack()>~"] },
  {
    id: 'xss11-13: state description',
    text: [
      "This is a state description<img/src='1'/onerror=xssAttack()>",
      "if n < 0<img/src='1'/onerror=xssAttack()>",
    ],
  },
  {
    id: 'xss14: class label iframe',
    text: ["<iframe/srcdoc='<script>parent.xssAttack(`XSS`)</script>'>"],
  },
  { id: 'xss15: sequence links', urls: ["javascript:alert('AudioParam')"] },
  {
    id: 'xss16/17: nested javascript scheme',
    urls: ["javasjavascript:cript:alert('goose')", 'javasjavascript:cript:alert("goose")'],
  },
  {
    id: 'xss18/19: class cardinality',
    text: ["<img/src='x'/onerror=xssAttack(1)>", "<<<img/src='1'/onerror=xssAttack()>>>"],
  },
  {
    id: 'xss20/21: entity colon in anchor',
    source: 'graph TD\nA --> B["<a href=\'javascript#colon;xssAttack()\'>AAA</a>"]',
    text: ["<a href='javascript#colon;xssAttack()'>AAA</a>"],
    urls: ['javascript#colon;xssAttack()', 'javascript&colon;xssAttack()'],
  },
  {
    id: 'xss22: tab entity in scheme',
    source:
      'graph TD\nA --> B["<a href=\'javascript#9;t#colon;alert(document.location)\'>AAA</a>"]',
    text: ["<a href='javascript#9;t#colon;alert(document.location)'>AAA</a>"],
    urls: [
      'javascript#9;t#colon;alert(document.location)',
      'javascript&#9;&colon;alert(document.location)',
    ],
  },
  {
    id: 'xss23-css: marker-end url in label',
    source:
      'graph TD\nA[["a marker-end=#quot;url(<s title=\'#<style>*{background:red}</style>\'>b"]]',
    text: ["a marker-end=\"url(<s title='#<style>*{background:red}</style>'>b"],
    styles: ["marker-end:url(<s title='#<style>*{background:red}</style>'>b"],
  },
  { id: 'xss24: backtick class names', text: ['`Class<img src=x onerror=xssAttack()>`'] },
  { id: 'xss25: block label', text: ['X<img src=x onerror=xssAttack()>'] },
  {
    id: 'ghsa1: textColor closes rule',
    source:
      '%%{ init: { "themeVariables" : { "textColor": "green;} #target { background-color: crimson }", "mainBkg": "#fff000" } } }%%\ngraph TD\n  A --> B',
    values: ['green;} #target { background-color: crimson }'],
  },
  {
    id: 'ghsa2: fontFamily entity brace',
    source: '%%{ init: { "fontFamily" : "&125; * { background: red }" } }%%\ngraph TD\n  A --> B',
    values: ['&125; * { background: red }', '} * { background: red }'],
  },
  {
    id: 'ghsa3: style tag in label',
    source:
      '%%{init: {"flowchart": {"htmlLabels": "true"}} }%%\nflowchart\nA["<p><style> * { background : red}</style>test</p>"]',
    text: ['<p><style> * { background : red}</style>test</p>'],
  },
  {
    id: 'css-injection: classDef breaks out of rule',
    styles: [
      '}}body{.otp{border: 1px solid red}.otp{color: red}.otp-1{ background-image: url("https://example.test/1.png")}',
      'background-image: url("https://example.test/1.png")',
    ],
  },
  {
    id: 'ghsa.spec: classDef closes style and svg',
    styles: [
      'fill:red</style></svg><style>*{x:x;y:y;overflow:visible!important}</style><div id="pwned">HACKED</div><svg><style>a:b',
    ],
  },
  {
    id: 'ghsa.spec: themeCSS :not(&)',
    source:
      "---\nconfig:\n  themeCSS: ':not(&){background:green !important}'\n---\nflowchart\n  A --> B",
    values: [':not(&){background:green !important}'],
  },
  {
    id: 'click_security: tooltip html and callbacks',
    source:
      'graph TB\n  URLTest1[URL test]\n  click URLTest1 "/empty.html" "Visit <strong>mermaid docs</strong>" _self',
    text: ['Visit <strong>mermaid docs</strong>'],
    urls: ['/empty.html'],
  },
];

/* cspell:enable */

/** The geometry attributes the fixture drawer turns into `d`; the rest go on the `<path>`. */
const GEOMETRY = new Set([
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'd',
]);

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/** An ellipse as two arcs from its left end. */
const ellipse = (p: PathBuilder, cx: number, cy: number, rx: number, ry: number): PathBuilder =>
  p
    .moveTo(cx - rx, cy)
    .arcTo(rx, ry, 0, false, true, cx + rx, cy)
    .arcTo(rx, ry, 0, false, true, cx - rx, cy)
    .close();

function outlineD(tag: OutlineTag, a: Attrs, p: PathBuilder): string {
  switch (tag) {
    case 'rect': {
      const x = n(a.x);
      const y = n(a.y);
      const r = x + n(a.width);
      const b = y + n(a.height);
      return p.moveTo(x, y).lineTo(r, y).lineTo(r, b).lineTo(x, b).close().done();
    }
    case 'circle':
      return ellipse(p, n(a.cx), n(a.cy), n(a.r), n(a.r)).done();
    case 'ellipse':
      return ellipse(p, n(a.cx), n(a.cy), n(a.rx), n(a.ry)).done();
    case 'line':
      return p.moveTo(n(a.x1), n(a.y1)).lineTo(n(a.x2), n(a.y2)).done();
    case 'polygon': {
      const pts = a.points ?? [];
      for (let i = 0; i + 1 < pts.length; i += 2)
        if (i === 0) p.moveTo(pts[0] as number, pts[1] as number);
        else p.lineTo(pts[i] as number, pts[i + 1] as number);
      return pts.length >= 2 ? p.close().done() : p.done();
    }
    case 'path':
      return a.d ?? '';
  }
}

/**
 * A fixture outline drawer (D302) for tests: each outline becomes `<g class="outline-<role>">`
 * around one `<path>` that traces the shape (rect corners square, circle and ellipse as two
 * arcs) and carries the shape's other attributes. Register it as
 * `{ id: 'fixture-outline', outline: outlineFixture }`.
 */
export const outlineFixture: {
  active(): boolean;
  readonly draw: OutlineDraw;
} = {
  active: () => true,
  draw(role, tag, attrs, sink) {
    const rest: Record<string, unknown> = {};
    for (const name of Object.keys(attrs))
      if (!GEOMETRY.has(name)) rest[name] = (attrs as Record<string, unknown>)[name];
    sink.open('g', { class: `outline-${role}` });
    sink.leaf('path', { ...(rest as Attrs), d: outlineD(tag, attrs, sink.path()) as Attrs['d'] });
    sink.close();
    return true;
  },
};

const OUTLINE_TAGS: ReadonlySet<string> = new Set([
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'line',
  'path',
]);

/**
 * `w`, with every `leaf` whose tag can be an outline written as `w.outline(role, …)` instead:
 * a stand-in for a diagram that draws all its shapes through the hook, for identity tests.
 * Labels go straight to `w`.
 */
export function outliningEveryLeaf(w: SvgWriter, role: OutlineRole = 'node'): SvgWriter {
  return {
    open: (tag, attrs) => w.open(tag, attrs),
    close: () => w.close(),
    leaf: (tag, attrs) =>
      OUTLINE_TAGS.has(tag) ? w.outline(role, tag as OutlineTag, attrs) : w.leaf(tag, attrs),
    outline: (r, tag, attrs) => w.outline(r, tag, attrs),
    plainEdge: (attrs) => w.plainEdge(attrs),
    text: (content) => w.text(content),
    label: (box, x, y, attrs) => w.label(box, x, y, attrs),
    path: () => w.path(),
    styleSheet: (css) => w.styleSheet(css),
    linearGradient: (g) => w.linearGradient(g),
    embed: (svg) => w.embed(svg),
  };
}
