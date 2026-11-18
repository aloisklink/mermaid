/**
 * The YAML reader's editor mode (`parseYaml(src, { tree: true })`, R-LANG-5, D96): a node tree
 * with a range for every key and value, and reading that goes on after an error.
 * Expected ranges are written as the source text they cover.
 */
import { describe, expect, it } from 'vitest';
import { parseYaml } from './index.js';
import type { YamlNode } from './index.js';

/** `path → source text` for every key (`path#key`) and value (`path`) in the tree. */
function spans(src: string, node: YamlNode | undefined, path = '$'): Record<string, string> {
  const out: Record<string, string> = {};
  if (!node) return out;
  out[path] = src.slice(node.range.start, node.range.end);
  if (node.kind === 'map') {
    for (const pair of node.pairs) {
      const p = `${path}.${pair.key}`;
      out[`${p}#key`] = src.slice(pair.keyRange.start, pair.keyRange.end);
      Object.assign(out, spans(src, pair.value, p));
    }
  } else if (node.kind === 'seq') {
    node.items.forEach((item, i) => Object.assign(out, spans(src, item, `${path}[${i}]`)));
  }
  return out;
}

describe('parseYaml tree mode: ranges', () => {
  it('gives every key and value of nested block maps a range', () => {
    const src = 'title: Hello\nconfig:\n  theme: dark\n  flowchart:\n    curve: linear\n';
    const r = parseYaml(src, { tree: true });
    expect(r.diagnostics).toEqual([]);
    expect(spans(src, r.root ?? undefined)).toEqual({
      $: 'title: Hello\nconfig:\n  theme: dark\n  flowchart:\n    curve: linear',
      '$.title#key': 'title',
      '$.title': 'Hello',
      '$.config#key': 'config',
      '$.config': 'theme: dark\n  flowchart:\n    curve: linear',
      '$.config.theme#key': 'theme',
      '$.config.theme': 'dark',
      '$.config.flowchart#key': 'flowchart',
      '$.config.flowchart': 'curve: linear',
      '$.config.flowchart.curve#key': 'curve',
      '$.config.flowchart.curve': 'linear',
    });
  });

  it('gives block sequence items a range, including `- key: value` items', () => {
    const src = 'list:\n  - a\n  - b: 1\n    c: 2\n  -\nnext: x\n';
    const r = parseYaml(src, { tree: true });
    expect(r.diagnostics).toEqual([]);
    expect(spans(src, r.root ?? undefined)).toMatchObject({
      '$.list': '- a\n  - b: 1\n    c: 2\n  -',
      '$.list[0]': 'a',
      '$.list[1]': 'b: 1\n    c: 2',
      '$.list[1].b#key': 'b',
      '$.list[1].b': '1',
      '$.list[1].c': '2',
      '$.list[2]': '',
      '$.next': 'x',
    });
    const list = r.root?.kind === 'map' ? r.root.pairs[0]?.value : undefined;
    expect(list?.kind === 'seq' && list.items[2]?.range.start).toBe(src.indexOf('-\nnext') + 1);
  });

  it('gives flow collections, their keys and their items a range', () => {
    const src = 'a: { b: 1, "c d" : [x, \'y\'], e }\nf: [ {g: h},\n  2 ]\n';
    const r = parseYaml(src, { tree: true });
    expect(r.diagnostics).toEqual([]);
    expect(spans(src, r.root ?? undefined)).toEqual({
      $: src.trimEnd(),
      '$.a#key': 'a',
      '$.a': '{ b: 1, "c d" : [x, \'y\'], e }',
      '$.a.b#key': 'b',
      '$.a.b': '1',
      '$.a.c d#key': '"c d"',
      '$.a.c d': "[x, 'y']",
      '$.a.c d[0]': 'x',
      '$.a.c d[1]': "'y'",
      '$.a.e#key': 'e',
      '$.a.e': '',
      '$.f#key': 'f',
      '$.f': '[ {g: h},\n  2 ]',
      '$.f[0]': '{g: h}',
      '$.f[0].g#key': 'g',
      '$.f[0].g': 'h',
      '$.f[1]': '2',
    });
  });

  it('gives quoted and block scalars a range over their source text, and their style', () => {
    const src =
      "a: 'it''s'\nb: \"two\n  lines\"\nc: |\n  x\n\n  y\n\nd: >-\n  folded\ne: plain # note\n";
    const r = parseYaml(src, { tree: true });
    expect(r.diagnostics).toEqual([]);
    expect(spans(src, r.root ?? undefined)).toMatchObject({
      '$.a': "'it''s'",
      '$.b': '"two\n  lines"',
      '$.c': '|\n  x\n\n  y',
      '$.d': '>-\n  folded',
      '$.e': 'plain',
    });
    const root = r.root?.kind === 'map' ? r.root : undefined;
    expect(
      root?.pairs.map((p) => p.value?.kind === 'scalar' && [p.value.style, p.value.value])
    ).toEqual([
      ['single', "it's"],
      ['double', 'two lines'],
      ['literal', 'x\n\ny\n'],
      ['folded', 'folded'],
      ['plain', 'plain'],
    ]);
  });

  it('reads the same value as the default mode', () => {
    const src = 'title: T\nconfig:\n  theme: dark\n  list: [1, {a: b}]\n';
    const r = parseYaml(src, { tree: true });
    expect(r.value).toEqual(parseYaml(src).value);
  });
});

/** `line:column` (1-based) and code of every diagnostic. */
function where(src: string, r: { diagnostics: { code: string; range: { start: number } }[] }) {
  return r.diagnostics.map((d) => {
    const before = src.slice(0, d.range.start);
    const line = before.split('\n').length;
    return `${line}:${d.range.start - before.lastIndexOf('\n')} ${d.code}`;
  });
}

describe('parseYaml tree mode: recovery', () => {
  it('reports N bad lines as N errors and keeps every good key', () => {
    const src = [
      'title: ok',
      'bad: *alias',
      'config:',
      '  theme: dark',
      '  nope',
      '  look: handDrawn',
      '  flowchart: { curve: [linear }',
      '  layout: elk',
      'a: x: y',
      'displayMode: compact',
      '',
    ].join('\n');
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual([
      '2:6 YAML_SYNTAX',
      '5:3 YAML_SYNTAX',
      '7:31 YAML_SYNTAX',
      '9:5 YAML_SYNTAX',
    ]);
    expect(r.diagnostics.every((d) => d.severity === 'error')).toBe(true);
    expect(r.value).toEqual({
      title: 'ok',
      config: { theme: 'dark', look: 'handDrawn', layout: 'elk' },
      displayMode: 'compact',
    });
    const s = spans(src, r.root ?? undefined);
    expect(s).toMatchObject({
      '$.title': 'ok',
      '$.bad#key': 'bad',
      '$.config.theme': 'dark',
      '$.config.look': 'handDrawn',
      '$.config.flowchart#key': 'flowchart',
      '$.config.layout': 'elk',
      '$.a#key': 'a',
      '$.displayMode': 'compact',
    });
    // A key whose value failed is kept, without a value.
    expect(s['$.bad']).toBeUndefined();
  });

  it('reads on after an unclosed flow collection or quote', () => {
    const src = 'a: {b: 1,\nc: "open\nd: 2\ne: [1, 2\n';
    const r = parseYaml(src, { tree: true });
    // The unclosed `{` runs on into line 2, where the quote is never closed: one error there.
    expect(where(src, r)).toEqual(['2:4 YAML_SYNTAX', '4:4 YAML_SYNTAX']);
    expect(r.value).toEqual({ d: 2 });
  });

  it('reports at most one error per line', () => {
    const src = 'a: @x\0 *y\nb: 1\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['1:6 YAML_SYNTAX']);
    expect(r.value).toEqual({ b: 1 });
  });

  it('recovers inside block sequences', () => {
    const src = 'list:\n  - a\n  - "x\n  - c\n  - {d\nnext: 1\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['3:5 YAML_SYNTAX', '5:5 YAML_SYNTAX']);
    expect(r.value).toEqual({ list: ['a', 'c'], next: 1 });
  });

  it('reports a duplicate key once and keeps the first value', () => {
    const src = 'a: 1\na: 2\nb: 3\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['2:1 YAML_SYNTAX']);
    expect(r.value).toEqual({ a: 1, b: 3 });
  });

  it('keeps the prototype-key protection and the depth cap', () => {
    const src = '__proto__:\n  polluted: true\nb: {constructor: 1, c: 2}\n';
    const r = parseYaml(src, { tree: true });
    expect(r.value).toEqual({ b: { c: 2 } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['YAML_UNSAFE_KEY', 'YAML_UNSAFE_KEY']);
    expect(Object.keys(spans(src, r.root ?? undefined))).not.toContain('$.__proto__#key');

    const deep = 'a: ' + '['.repeat(20000) + '\nb: 1\n';
    const d = parseYaml(deep, { tree: true });
    expect(d.diagnostics.map((x) => x.code)).toEqual(['YAML_TOO_DEEP']);
    expect(d.value).toEqual({ b: 1 });
  });
});

describe('parseYaml tree mode: keys that cannot be read', () => {
  it('drops an entry whose key fails, and reads on', () => {
    const src = 'a\u0001b: 1\nb: 2\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['1:2 YAML_SYNTAX']);
    expect(spans(src, r.root ?? undefined)).toEqual({
      $: 'a\u0001b: 1\nb: 2',
      '$.b#key': 'b',
      '$.b': '2',
    });
  });
});

describe('parseYaml tree mode: sequence and root recovery', () => {
  it('recovers from a tab-indented sequence item', () => {
    const src = 'l:\n  - a\n\t- b\n  - c\nz: 1\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['3:1 YAML_SYNTAX']);
    expect(r.value).toEqual({ l: ['a', 'c'], z: 1 });
    expect(spans(src, r.root ?? undefined)).toMatchObject({
      '$.l[0]': 'a',
      '$.l[1]': 'c',
      '$.z': '1',
    });
  });

  it('reads on after a root sequence that ends early', () => {
    const src = '- a\nb: 1\nc: *x\nd: 2\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['2:1 YAML_SYNTAX', '3:4 YAML_SYNTAX']);
    expect(r.value).toEqual({ b: 1, d: 2 });
    expect(spans(src, r.root ?? undefined)).toEqual({
      $: 'b: 1\nc: *x\nd: 2',
      '$.b#key': 'b',
      '$.b': '1',
      '$.c#key': 'c',
      '$.d#key': 'd',
      '$.d': '2',
    });
  });

  it('reads on after an indented root mapping that ends early', () => {
    const src = '  a: 1\nb: 2\nc: 3\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['2:1 YAML_SYNTAX']);
    expect(r.value).toEqual({ a: 1, b: 2, c: 3 });
    expect(spans(src, r.root ?? undefined)).toMatchObject({
      $: 'a: 1\nb: 2\nc: 3',
      '$.a': '1',
      '$.b': '2',
      '$.c': '3',
    });
  });

  it('gives a mapping whose keys are all dropped the span of its lines', () => {
    const src = 'constructor: 1\nconstructor: 2\n';
    const r = parseYaml(src, { tree: true });
    expect(r.value).toEqual({});
    expect(spans(src, r.root ?? undefined)).toEqual({ $: 'constructor: 1\nconstructor: 2' });
  });
});

/** Each pair of a map node as `[key text, has a value]`. */
function pairsOf(src: string, node: YamlNode | null | undefined): [string, boolean][] {
  if (node?.kind !== 'map') return [];
  return node.pairs.map((p) => [src.slice(p.keyRange.start, p.keyRange.end), !!p.value]);
}

describe('parseYaml tree mode: root flow documents (#169)', () => {
  it('reads on after a duplicate key in a root flow mapping', () => {
    const src = '{a: 1, a: 2, b: 3}';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['1:8 YAML_SYNTAX']);
    expect(r.value).toEqual({ a: 1, b: 3 });
    expect(spans(src, r.root ?? undefined)).toEqual({
      $: src,
      '$.a#key': 'a',
      '$.a': '1',
      '$.b#key': 'b',
      '$.b': '3',
    });
    // The duplicate is kept as a key without a value, as in a block mapping.
    expect(pairsOf(src, r.root)).toEqual([
      ['a', true],
      ['a', false],
      ['b', true],
    ]);
    // The default mode is unchanged: the first error stops the read.
    expect(parseYaml(src)).toMatchObject({ value: null, diagnostics: [{ code: 'YAML_SYNTAX' }] });
  });

  it('reports one error per bad line of a multi-line root flow mapping, nested ones too', () => {
    const src = [
      '{',
      '  title: T,',
      '  bad: *x,',
      '  config: { theme: dark, look: @y, layout: elk },',
      '  list: [1, &a, 3],',
      '  displayMode: compact',
      '}',
    ].join('\n');
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['3:8 YAML_SYNTAX', '4:32 YAML_SYNTAX', '5:13 YAML_SYNTAX']);
    expect(r.value).toEqual({
      title: 'T',
      config: { theme: 'dark', layout: 'elk' },
      list: [1, 3],
      displayMode: 'compact',
    });
    expect(spans(src, r.root ?? undefined)).toMatchObject({
      $: src,
      '$.bad#key': 'bad',
      '$.config': '{ theme: dark, look: @y, layout: elk }',
      '$.config.look#key': 'look',
      '$.config.layout': 'elk',
      '$.list': '[1, &a, 3]',
      '$.list[1]': '3',
      '$.displayMode': 'compact',
    });
    expect(pairsOf(src, r.root)).toEqual([
      ['title', true],
      ['bad', false],
      ['config', true],
      ['list', true],
      ['displayMode', true],
    ]);
  });

  it('ends an unclosed root flow collection at the end of the text, with one error', () => {
    const src = '{ title: T,\n  config: { theme: dark }\n';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['1:1 YAML_SYNTAX']);
    expect(r.value).toEqual({ title: 'T', config: { theme: 'dark' } });
    expect(spans(src, r.root ?? undefined)).toMatchObject({
      $: '{ title: T,\n  config: { theme: dark }',
      '$.title': 'T',
      '$.config.theme': 'dark',
    });
    const typing = '{ title: T, config: { th';
    const t = parseYaml(typing, { tree: true });
    // Both `{` are unclosed; the line's one error goes to the inner one, closed first.
    expect(where(typing, t)).toEqual(['1:21 YAML_SYNTAX']);
    expect(spans(typing, t.root ?? undefined)).toEqual({
      $: typing,
      '$.title#key': 'title',
      '$.title': 'T',
      '$.config#key': 'config',
      '$.config': '{ th',
      '$.config.th#key': 'th',
      '$.config.th': '',
    });
  });

  it('ends a nested collection at an outer closing bracket, and reads on', () => {
    const src = '{a: [1, 2}, b: 3}';
    const r = parseYaml(src, { tree: true });
    expect(where(src, r)).toEqual(['1:10 YAML_SYNTAX']);
    expect(spans(src, r.root ?? undefined)).toMatchObject({ '$.a': '[1, 2', '$.a[1]': '2' });
  });

  it('recovers in a root flow sequence and after an unclosed quote', () => {
    const seq = '[1, *x,\n 3]';
    expect(parseYaml(seq, { tree: true }).value).toEqual([1, 3]);
    const quote = '{a: "x, b: 1}';
    const r = parseYaml(quote, { tree: true });
    expect(where(quote, r)).toEqual(['1:5 YAML_SYNTAX']);
    expect(r.value).toEqual({ b: 1 });
    expect(pairsOf(quote, r.root)).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it("reads a single-quoted value's `''` as one quote when it recovers", () => {
    // Closed: the doubled quote keeps the `,` inside the value.
    const closed = "{a: 'it''s, x', b: *x, c: 1}";
    const c = parseYaml(closed, { tree: true });
    expect(where(closed, c)).toEqual(['1:20 YAML_SYNTAX']);
    expect(c.value).toEqual({ a: "it's, x", c: 1 });
    // Never closed: the `'` is a plain character and the rest is read on from after it. Read
    // as two quoted runs (`'x"y'` and `', c" ...`), the `"` would open a quote at the `,`.
    const open = `{a: 'x"y'', c" , b: 1}`;
    const r = parseYaml(open, { tree: true });
    expect(where(open, r)).toEqual(['1:5 YAML_SYNTAX']);
    expect(r.value).toEqual({ b: 1 });
    expect(pairsOf(open, r.root)).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('keeps the prototype-key protection in a recovering root flow mapping', () => {
    const src = '{__proto__: {polluted: true}, a: *x, constructor: 1, b: 2}';
    const r = parseYaml(src, { tree: true });
    expect(r.value).toEqual({ b: 2 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(pairsOf(src, r.root)).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });
});
