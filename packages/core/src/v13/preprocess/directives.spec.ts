/**
 * `%%{…}%%` directives through preprocess. v12 reference: `utils.ts` `detectInit`,
 * `detectDirective`, `directiveRegex`; it swaps every `'` for `"` and then `JSON.parse`s.
 */
import { describe, expect, it } from 'vitest';
import { LineIndex } from '../parser-kit/index.js';
import { preprocess } from './index.js';

const dirs = (src: string) =>
  preprocess(src).directives.map(({ kind, name, args }) => ({ kind, name, args }));

describe('preprocess: directives', () => {
  it('reads an init directive and leaves it in place', () => {
    const src =
      '%%{init: {"theme": "dark", "flowchart": {"curve": "linear"}}}%%\ngraph TD\n  A-->B\n';
    const r = preprocess(src);
    expect(r.bodyStart).toBe(0);
    expect(r.directives).toEqual([
      {
        kind: 'init',
        name: 'init',
        range: { start: 0, end: src.indexOf('\n') },
        argsRange: { start: 9, end: src.indexOf('}%%') },
        args: { theme: 'dark', flowchart: { curve: 'linear' } },
      },
    ]);
    expect(r.diagnostics).toEqual([]);
  });

  it.each([
    [
      "single quotes, as v12's quote swap allows",
      "%%{init: {'theme':'forest'}}%%",
      { theme: 'forest' },
    ],
    ['initialize', '%%{initialize: {"theme": "base"}}%%', { theme: 'base' }],
    ['no colon', '%%{init {"theme": "base"}}%%', { theme: 'base' }],
    [
      'spaces everywhere',
      '%%{  init  :  { "a" : [1, 2.5e1, -0.5, true, false, null] }  }%%',
      { a: [1, 25, -0.5, true, false, null] },
    ],
    ['escapes', '%%{init: {"s": "a\\"b\\\\c\\u00e9\\n"}}%%', { s: 'a"b\\cé\n' }],
  ])('reads %s', (_name, src, args) => {
    expect(dirs(src)).toEqual([
      { kind: 'init', name: src.includes('initialize') ? 'initialize' : 'init', args },
    ]);
  });

  it('reads a directive that spans several lines', () => {
    const src = 'graph TD\n%%{\n  init: {\n    "theme": "dark"\n  }\n}%%\nA-->B\n';
    const [d] = preprocess(src).directives;
    expect(d?.args).toEqual({ theme: 'dark' });
    expect(src.slice(d?.range.start, d?.range.end)).toBe(
      '%%{\n  init: {\n    "theme": "dark"\n  }\n}%%'
    );
  });

  it('reads wrap and other directives, and bare-word arguments as strings (v12)', () => {
    expect(dirs('%%{wrap}%%\n%%{init: dark}%%\n%%{config: {"a": 1}}%%')).toEqual([
      { kind: 'wrap', name: 'wrap', args: undefined },
      { kind: 'init', name: 'init', args: 'dark' },
      { kind: 'other', name: 'config', args: { a: 1 } },
    ]);
  });

  // v12 directiveRegex needs a word right after `%%{` (blanks allowed); without one the text
  // stays in the diagram, where most v12 grammars reject it (#208).
  it.each([
    ['empty', '%%{}%%'],
    ['blank', '%%{ \n }%%'],
    ['JSON only', '%%{"theme": "dark"}%%'],
    ['a colon first', '%%{: {"theme": "dark"}}%%'],
    ['a comment line after the opener', '%%{\n%% c\ninit: {"theme": "dark"}}%%'],
    ['unclosed', '%%{ "a"\ngraph TD'],
    // An unclosed directive ends at its line, so a name on the next line is outside it.
    ['unclosed, a name on the next line', '%%{\ninit: dark\ngraph TD'],
  ])('reads no directive from an opener without a name: %s', (_name, src) => {
    const r = preprocess(src);
    expect(r.directives).toEqual([]);
    expect(r.diagnostics).toEqual([]);
  });

  it('reads a later directive after an opener without a name, and a name on the next line', () => {
    expect(dirs('%%{ %%{wrap}%%\n%%{\n  init: dark}%%')).toEqual([
      { kind: 'wrap', name: 'wrap', args: undefined },
      { kind: 'init', name: 'init', args: 'dark' },
    ]);
  });

  it('finds directives anywhere in the body, in source order, but not in front matter', () => {
    const src =
      '---\ntitle: "%%{init: {}}%%"\n---\ngraph TD\n  A["x"] %%{init: {"a": 1}}%% --> B\n%%{wrap}%%';
    expect(dirs(src)).toEqual([
      { kind: 'init', name: 'init', args: { a: 1 } },
      { kind: 'wrap', name: 'wrap', args: undefined },
    ]);
  });

  it('keeps names case-sensitive, as v12 matches /init/ without the i flag', () => {
    expect(dirs('%%{INIT: {"a": 1}}%%')).toEqual([{ kind: 'other', name: 'INIT', args: { a: 1 } }]);
  });
});

describe('preprocess: directive diagnostics are at original positions', () => {
  const lines = (src: string) => new LineIndex(src);

  it('reports an unclosed directive at its opener; the directive runs to the end of that line', () => {
    const src = 'graph TD\n  %%{init: {"theme": "dark"}\n  A-->B\n';
    const r = preprocess(src);
    expect(r.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'UNCLOSED_DIRECTIVE',
        message: 'This directive is never closed. Add `}%%` after it.',
        range: { start: 11, end: 14 },
      },
    ]);
    expect(
      r.directives.map((d) => [d.kind, src.slice(d.range.start, d.range.end), d.args])
    ).toEqual([['init', '%%{init: {"theme": "dark"}', undefined]]);
  });

  it('warns about invalid JSON at the offending character and drops only that directive', () => {
    const src = '%%{init: {"theme": "dark",}}%%\r\n%%{init: {"look": "neo"}}%%\r\ngraph TD\r\n';
    const r = preprocess(src);
    expect(r.directives.map((d) => d.args)).toEqual([undefined, { look: 'neo' }]);
    expect(
      r.diagnostics.map((d) => [d.severity, d.code, d.message, lines(src).position(d.range.start)])
    ).toEqual([
      [
        'warning',
        'INVALID_DIRECTIVE',
        'The `init` directive is not valid JSON: expected a string key, got `}`.',
        { line: 0, column: 26 },
      ],
    ]);
  });

  it.each([
    ['an unclosed string', '%%{init: {"a": "x}}%%', 'the string is never closed', 15],
    ['a missing comma', '%%{init: {"a": 1 "b": 2}}%%', 'expected `,` or `}`, got `"`', 17],
    ['an unquoted key', '%%{init: {theme: "dark"}}%%', 'expected a string key, got `t`', 10],
    ['trailing text', '%%{init: {"a": 1} x}%%', 'unexpected text after the value', 18],
    [
      'a raw line break in a string',
      '%%{init: {"a": "x\ny"}}%%',
      'line breaks in strings must be written as `\\n`',
      17,
    ],
    ['a bad number', '%%{init: {"a": 01}}%%', 'expected `,` or `}`, got `1`', 16],
  ])('warns about %s', (_name, src, message, column) => {
    const r = preprocess(src);
    expect(r.directives[0]?.args).toBeUndefined();
    expect(r.diagnostics.map((d) => [d.code, d.message, d.range.start])).toEqual([
      ['INVALID_DIRECTIVE', `The \`init\` directive is not valid JSON: ${message}.`, column],
    ]);
  });

  it.each(['__proto__', 'constructor', 'prototype'])('drops `%s` keys with a warning', (key) => {
    const src = `%%{init: {"${key}": {"polluted": true}, "flowchart": {'${key}': 1}, "theme": "dark"}}%%`;
    const r = preprocess(src);
    expect(r.directives[0]?.args).toEqual({ flowchart: {}, theme: 'dark' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.diagnostics.map((d) => [d.code, src.slice(d.range.start, d.range.end)])).toEqual([
      ['DIRECTIVE_UNSAFE_KEY', `"${key}"`],
      ['DIRECTIVE_UNSAFE_KEY', `'${key}'`],
    ]);
  });

  it('caps nesting at 64 levels', () => {
    const ok = `%%{init: ${'['.repeat(64)}${']'.repeat(64)}}%%`;
    expect(preprocess(ok).diagnostics).toEqual([]);
    const deep = `%%{init: ${'['.repeat(65)}${']'.repeat(65)}}%%`;
    expect(preprocess(deep).diagnostics.map((d) => [d.code, d.range.start])).toEqual([
      ['DIRECTIVE_TOO_DEEP', 9 + 64],
    ]);
  });
});
