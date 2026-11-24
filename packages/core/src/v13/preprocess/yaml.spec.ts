/**
 * The YAML subset reader. Expected values are js-yaml 4 `load(src, { schema: JSON_SCHEMA })`
 * results (what v12 uses for front matter), captured as literals. Cases from Pele's
 * `tests/util/yaml.test.ts` plus front-matter shapes from v12's `frontmatter.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { LineIndex } from '../parser-kit/index.js';
import { MAX_YAML_DEPTH, parseYaml } from './index.js';

const AGREES_WITH_JS_YAML: [string, unknown][] = [
  ['{\n shape: rounded \n}', { shape: 'rounded' }],
  ['{\nshape: rounded , label: "DD"\n}', { shape: 'rounded', label: 'DD' }],
  ['{\n label: "This is }", other: "clock"\n}', { label: 'This is }', other: 'clock' }],
  [
    '{\n animate: true, animation: fast, w: 100, h: 50.5, x: null, y: ~\n}',
    { animate: true, animation: 'fast', w: 100, h: 50.5, x: null, y: null },
  ],
  [
    '{\n label: \'single quoted\', icon: "fa:fa-user", form: circle, pos: t \n}',
    { label: 'single quoted', icon: 'fa:fa-user', form: 'circle', pos: 't' },
  ],
  ['{\n a: [1, 2, three], b: {c: d, e: [f]}\n}', { a: [1, 2, 'three'], b: { c: 'd', e: ['f'] } }],
  ['{\n}', {}],
  ['\n        shape: circle\n        other: "clock"\n     \n', { shape: 'circle', other: 'clock' }],
  [
    '\n        label: |\n          This is a\n          multiline string\n        other: "clock"\n     \n',
    { label: 'This is a\nmultiline string\n', other: 'clock' },
  ],
  [
    '\n        label: >\n          folded\n          text\n\n          second paragraph\n        other: 1\n',
    { label: 'folded text\nsecond paragraph\n', other: 1 },
  ],
  [
    'title: Hello world\nconfig:\n  theme: dark\n  flowchart:\n    curve: linear\n    htmlLabels: false\n',
    {
      title: 'Hello world',
      config: { theme: 'dark', flowchart: { curve: 'linear', htmlLabels: false } },
    },
  ],
  [
    'title: "Quoted: title"\ndisplayMode: compact\n',
    { title: 'Quoted: title', displayMode: 'compact' },
  ],
  [
    'config:\n  themeVariables:\n    primaryColor: "#ff0000"\n    fontSize: 16px\n  look: handDrawn # trailing comment\n',
    {
      config: { themeVariables: { primaryColor: '#ff0000', fontSize: '16px' }, look: 'handDrawn' },
    },
  ],
  [
    'list:\n  - a\n  - b: 1\n    c: 2\n  - [x, y]\nempty:\n',
    { list: ['a', { b: 1, c: 2 }, ['x', 'y']], empty: null },
  ],
  [
    'a: 0x1f\nb: -12\nc: 1e3\nd: .5\ne: "12"\nf: True\ng: FALSE\nh: Null\n',
    { a: 31, b: -12, c: 1000, d: 0.5, e: '12', f: true, g: false, h: null },
  ],
  [
    'key with spaces: plain value\nurl: http://example.com/a#b\n',
    { 'key with spaces': 'plain value', url: 'http://example.com/a#b' },
  ],
  [
    'multi: this is\n  continued on the next line\nnext: 1\n',
    { multi: 'this is continued on the next line', next: 1 },
  ],
  ['# only a comment\n', null],
  ['', null],
  ['just a scalar', 'just a scalar'],
  ['- 1\n- 2\n', [1, 2]],
  [
    'a: {\n  b: 1,\n  c: [2,\n    3]\n}\nd: "two\n  lines"\ne: 5\n',
    { a: { b: 1, c: [2, 3] }, d: 'two lines', e: 5 },
  ],
  ['{\n a: 1, # comment\n b: 2\n}', { a: 1, b: 2 }],
  ['title: |\n   multi-line string\n   ---\n', { title: 'multi-line string\n---\n' }],
  ['a: "esc \\u00e9 \\t \\"q\\""\nb: \'it\'\'s\'\n', { a: 'esc é \t "q"', b: "it's" }],
  ['a:\r\n  b: 1\r\n  c: "x"\r\n', { a: { b: 1, c: 'x' } }],
  ['seq:\n- a\n- b\nnested:\n  - - 1\n    - 2\n', { seq: ['a', 'b'], nested: [[1, 2]] }],
  ['k: -.inf\nm: 0o17\nn: +12\no: 1.5e-3\n', { k: -Infinity, m: 15, n: 12, o: 0.0015 }],
  ['a: [1 2]', { a: ['1 2'] }],
];

/** Inputs js-yaml rejects, with the text the error should point at. */
const REJECTED_BY_JS_YAML: [src: string, at: string][] = [
  ['!!!', '!!!'],
  ['a: 1\na: 2', 'a: 2'],
  ['a: *x', '*x'],
  ['a: @x', '@x'],
  ['  a: 1\n b: 2', 'b: 2'],
  ['a:\n\tb: 1', '\tb'],
  ['{ a: 1', '{ a'],
  ['a: [1, 2', '[1'],
  ['a: "x', '"x'],
  ["a: 'x", "'x"],
  ['a: 1\n  b: 2', 'b: 2'],
  ['{a: 1}} x', '} x'],
];

describe('parseYaml', () => {
  it.each(AGREES_WITH_JS_YAML)('agrees with js-yaml on %j', (src, expected) => {
    const r = parseYaml(src);
    expect(r.diagnostics).toEqual([]);
    expect(r.value).toEqual(expected);
  });

  it.each(REJECTED_BY_JS_YAML)('rejects %j like js-yaml, at the offending text', (src, at) => {
    const r = parseYaml(src);
    expect(r.value).toBeNull();
    expect(r.diagnostics).toHaveLength(1);
    const [d] = r.diagnostics;
    expect(d?.severity).toBe('error');
    expect(d?.message).toMatch(/^Invalid YAML: .+\.$/);
    expect(d?.range.start).toBe(src.indexOf(at));
  });

  it('reads a range of a larger text in place, with an indent removed', () => {
    const src = 'xx\n\t\ttitle: a\n\t\tconfig:\n\t\t  theme: dark\nyy';
    const start = 3;
    const end = src.indexOf('\nyy');
    expect(parseYaml(src, { start, end, indent: '\t\t' })).toEqual({
      value: { title: 'a', config: { theme: 'dark' } },
      diagnostics: [],
    });
  });

  it('reports errors at their line and column in the larger text', () => {
    const src = 'flowchart\n  a: 1\n  b: [1, 2\n  c: 3\n';
    const r = parseYaml(src, { start: 10, end: src.length, indent: '  ' });
    const lines = new LineIndex(src);
    expect(r.diagnostics.map((d) => [d.code, lines.position(d.range.start)])).toEqual([
      ['YAML_SYNTAX', { line: 2, column: 5 }],
    ]);
  });
});

describe('parseYaml: prototype keys', () => {
  it.each(['__proto__', 'constructor', 'prototype'])(
    'drops `%s` with a warning, at any depth',
    (key) => {
      const src = `${key}:\n  polluted: true\nb:\n  ${key}: {polluted: true}\nc: {${key}: 1}\nd: ok\n`;
      const r = parseYaml(src);
      expect(r.value).toEqual({ b: {}, c: {}, d: 'ok' });
      expect(Object.getPrototypeOf(r.value)).toBe(Object.prototype);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(
        r.diagnostics.map((d) => [d.severity, d.code, src.slice(d.range.start, d.range.end)])
      ).toEqual([
        ['warning', 'YAML_UNSAFE_KEY', key],
        ['warning', 'YAML_UNSAFE_KEY', key],
        ['warning', 'YAML_UNSAFE_KEY', key],
      ]);
    }
  );
});

describe('parseYaml: depth cap', () => {
  const blockNest = (n: number) =>
    Array.from({ length: n }, (_, i) => `${' '.repeat(i)}k${i}:`).join('\n') + ' 1\n';

  it(`accepts ${MAX_YAML_DEPTH} levels of block or flow nesting`, () => {
    expect(parseYaml(blockNest(MAX_YAML_DEPTH)).diagnostics).toEqual([]);
    expect(parseYaml('['.repeat(MAX_YAML_DEPTH) + ']'.repeat(MAX_YAML_DEPTH)).diagnostics).toEqual(
      []
    );
  });

  it.each([
    ['block mappings', blockNest(MAX_YAML_DEPTH + 1)],
    ['flow collections', '['.repeat(MAX_YAML_DEPTH + 1) + ']'.repeat(MAX_YAML_DEPTH + 1)],
    ['mixed, very deep', 'a: ' + '['.repeat(20000)],
    ['block sequences on one line', '- '.repeat(20000) + 'x'],
  ])('refuses deeper %s with a diagnostic instead of overflowing the stack', (_name, src) => {
    const r = parseYaml(src);
    expect(r.value).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['YAML_TOO_DEEP']);
  });
});

/**
 * Found by the #17 fuzz differential against mermaid 12 (front matter and shape data): js-yaml
 * results captured as literals, errors by their js-yaml reason and 1-based line:column.
 */
describe('js-yaml parity found by fuzzing (#17)', () => {
  it.each<[string, unknown]>([
    // A plain scalar continues on any line indented more than its parent, not only lines as
    // indented as its first one.
    [
      'description:\n  first line\n less indented\nconfig: 1\n',
      { description: 'first line less indented', config: 1 },
    ],
    ['top\n less\n', 'top less'],
    // A plain key may hold `:` (not followed by a blank) and `#` (not after a blank).
    [
      'co%0ajavascript:alert(1)nfig:\n  layout: dagre\n',
      { 'co%0ajavascript:alert(1)nfig': { layout: 'dagre' } },
    ],
    ['a:b: c\n', { 'a:b': 'c' }],
    ['a#b: c\n', { 'a#b': 'c' }],
    [':a: 1\n', { ':a': 1 }],
    ['?a: 1\n', { '?a': 1 }],
    ['k:\n:a,:b  c#1;x:y: 0\n', { k: null, ':a,:b  c#1;x:y': 0 }],
    ['k: a:b\n', { k: 'a:b' }],
    ['k: a :b\n', { k: 'a :b' }],
    // Quoted text may hold anything but C0 controls; comments are not checked.
    ['{ label: "x\ud800y" }', { label: 'x\ud800y' }],
    ["k: 'a\u007fb\uffff'\n", { k: 'a\u007fb\uffff' }],
    ['k: x # \u0001\n', { k: 'x' }],
    // A comment line ends a multi-line plain value only if more text follows it.
    ['k: a\n  # c\nnext: 1\n', { k: 'a', next: 1 }],
    ['k:\n  a\n  # c\n', { k: 'a' }],
    // Indicators inside a plain value, or starting a continuation line, are text.
    ['k: x]\n', { k: 'x]' }],
    ['k: a\n  ]b\n', { k: 'a ]b' }],
    ['k: -x\n', { k: '-x' }],
    ['k: ?x\n', { k: '?x' }],
    ['k: :x\n', { k: ':x' }],
    ['k: a\n  - b\n', { k: 'a - b' }],
    ['k: a\n ---\n', { k: 'a ---' }],
    ['k: a\n  \tb\n', { k: 'a b' }],
    // `-` and `?` start a plain value in a flow collection unless a blank or indicator follows.
    ['k: a\n  -\n', { k: 'a -' }],
    ['{-: 1}', { '-': 1 }],
    ['[-x, ?x]', ['-x', '?x']],
    ['{a: -x}', { a: '-x' }],
  ])('reads %j as js-yaml does', (src, expected) => {
    const r = parseYaml(src);
    expect(r.diagnostics).toEqual([]);
    expect(r.value).toEqual(expected);
  });

  it.each<[string, string, string]>([
    ['a:\n  b: 1\n c: 2\n', 'bad indentation of a mapping entry', '3:2'],
    ['k: x: y\n', 'bad indentation of a mapping entry', '1:5'],
    ['k: text (x):\n  more\n', 'bad indentation of a mapping entry', '1:12'],
    ['k: ends with colon:\n', 'bad indentation of a mapping entry', '1:19'],
    ['k:\n  - a: b: c\n', 'bad indentation of a mapping entry', '2:9'],
    ['k:  shape: stadium, label: "x"\n', 'bad indentation of a mapping entry', '1:10'],
    ['k: x\u0001y\n', 'the stream contains non-printable characters', '1:5'],
    ['k: x\u0000y\n', 'null byte is not allowed in input', '1:5'],
    ['k: x\uffffy\n', 'the stream contains non-printable characters', '1:5'],
    ['k: \ud800\n', 'the stream contains non-printable characters', '1:4'],
    ['{ label: x\u0001 }', 'the stream contains non-printable characters', '1:11'],
    ['{ label: "x\u0001y" }', 'expected valid JSON character', '1:12'],
    ['k: |\n  a\u007fb\n', 'the stream contains non-printable characters', '2:4'],
    ['k: a\n  b\uffff\n', 'the stream contains non-printable characters', '2:4'],
    // A comment ends a multi-line plain value.
    ['k: a\n  # c\n  b\n', 'bad indentation of a mapping entry', '3:3'],
    ['k: a # c\n  b\n', 'bad indentation of a mapping entry', '2:3'],
    ['k: a\n\n  # c\n  b\n', 'bad indentation of a mapping entry', '4:3'],
    // A mapping indicator on a continuation line, whatever starts the line.
    // (a `key:` line is reported from its start, where js-yaml points at the `:`)
    ['k: a\n  b: \n', 'bad indentation of a mapping entry', '2:3'],
    ['k: a\n  b:\n', 'bad indentation of a mapping entry', '2:3'],
    ['k: a\n  "x": y\n', 'bad indentation of a mapping entry', '2:3'],
    ['k: a\n  **b** when:\n', 'bad indentation of a mapping entry', '2:13'],
    // Characters that cannot start a plain value in a block.
    ['k: ]x\n', 'bad indentation of a mapping entry', '1:4'],
    ['k: }x\n', 'bad indentation of a mapping entry', '1:4'],
    ['k: ,x\n', 'bad indentation of a mapping entry', '1:4'],
    ['k: %x\n', 'bad indentation of a mapping entry', '1:4'],
    ['k:\n  ]x\n', 'bad indentation of a mapping entry', '2:3'],
    ['k: ? x\n', 'bad indentation of a mapping entry', '1:4'],
    ['k: - x\n', 'bad indentation of a mapping entry', '1:4'],
    // A lone `-` or `?` value is an indicator, not text (#208).
    ['k: -\n', 'bad indentation of a mapping entry', '1:4'],
    ['k: ?\n', 'bad indentation of a mapping entry', '1:4'],
    ['k: - # c\n', 'bad indentation of a mapping entry', '1:4'],
    ['k: -\n  more\n', 'bad indentation of a mapping entry', '1:4'],
    ['k:\n  j: ?\n', 'bad indentation of a mapping entry', '2:6'],
    ['[-]', 'missed comma between flow collection entries', '1:2'],
    ['[a, - x]', 'missed comma between flow collection entries', '1:5'],
    ['{a: -}', 'missed comma between flow collection entries', '1:5'],
    ['{a: ?}', 'missed comma between flow collection entries', '1:5'],
    ['k: [\n  -\n]\n', 'missed comma between flow collection entries', '2:3'],
    ['k: |x\n', 'a line break is expected', '1:4'],
    ['k: >x\n', 'a line break is expected', '1:4'],
    ['k: a\n\tb\n', 'tab characters must not be used in indentation', '2:1'],
    // An indented `---` is text, not a document marker.
    ['config:\n  a:\n    b: 1\n ---\n', 'bad indentation of a mapping entry', '4:2'],
  ])('rejects %j: %s', (src, reason, at) => {
    const r = parseYaml(src);
    expect(r.value).toBeNull();
    const d = r.diagnostics[0]!;
    expect(d.message).toBe(`Invalid YAML: ${reason}.`);
    const pos = new LineIndex(src).position(d.range.start);
    // js-yaml reports where its scan stopped; v13 points at the offending character.
    expect(`${pos.line + 1}:${pos.column + 1}`).toBe(at);
  });
});
