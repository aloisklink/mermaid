/**
 * Preprocess through its stage API (the public `mermaid` API does not exist yet). Cases
 * ported from v12's `diagram-api/frontmatter.spec.ts` keep v12's expected values; `body` is
 * what v12 returned as `text` (v13 does not consume blank lines after the closing fence, which
 * only changes nothing for the diagram but keeps line numbers exact).
 */
import { describe, expect, it } from 'vitest';
import { LineIndex } from '../parser-kit/index.js';
import { preprocess } from './index.js';

const body = (src: string) => src.slice(preprocess(src).bodyStart);
const meta = (src: string) => {
  const fm = preprocess(src).frontMatter;
  return { title: fm?.title, config: fm?.config };
};
const at = (src: string, offset: number) => new LineIndex(src).position(offset);

describe('preprocess: front matter', () => {
  it('reads title and config and starts the body after the closing fence', () => {
    const src = '---\ntitle: Hello\nconfig:\n  theme: dark\n---\nflowchart TD\n  A-->B\n';
    const r = preprocess(src);
    expect(src.slice(r.bodyStart)).toBe('flowchart TD\n  A-->B\n');
    expect(r.frontMatter?.title).toBe('Hello');
    expect(r.frontMatter?.config).toEqual({ theme: 'dark' });
    expect(r.frontMatter?.range).toEqual({ start: 0, end: src.indexOf('flowchart') });
    expect(src.slice(r.frontMatter?.yamlRange.start, r.frontMatter?.yamlRange.end)).toBe(
      'title: Hello\nconfig:\n  theme: dark'
    );
    expect(r.diagnostics).toEqual([]);
  });

  it('leaves a source without front matter alone', () => {
    expect(preprocess('diagram')).toEqual({ bodyStart: 0, directives: [], diagnostics: [] });
  });

  it('does not read front matter that is not at the start', () => {
    const src = 'diagram\n---\ntitle: foo\n---\n';
    expect(preprocess(src)).toEqual({ bodyStart: 0, directives: [], diagnostics: [] });
  });

  it.each([
    ['empty', '---\n\n---\ndiagram'],
    ['a number', '---\n1\n---\ndiagram'],
    ['null', '---\nnull\n---\ndiagram'],
  ])('ignores %s front matter (v12)', (_name, src) => {
    expect(body(src)).toBe('diagram');
    expect(meta(src)).toEqual({});
  });

  it('warns about a front matter that is not a mapping, and ignores it (v12 ignores it silently)', () => {
    const r = preprocess('---\n- 1\n- 2\n---\ndiagram');
    expect(r.frontMatter?.data).toBeNull();
    expect(r.diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'FRONT_MATTER_NOT_A_MAPPING'],
    ]);
  });

  it('closes at the first fence line; `---` inside a value does not close', () => {
    expect(meta('---\ntitle: foo---bar\n---\ndiagram\n---\ntest')).toEqual({ title: 'foo---bar' });
    expect(body('---\ntitle: foo---bar\n---\ndiagram\n---\ntest')).toBe('diagram\n---\ntest');
    const src = '---\ntitle: |\n   multi-line string\n   ---\n---\ndiagram';
    expect(meta(src)).toEqual({ title: 'multi-line string\n---\n' });
    expect(body(src)).toBe('diagram');
  });

  it('keeps title as v12 does: truthy values only, as strings', () => {
    expect(meta('---\ntitle: true\n---\ndiagram').title).toBe('true');
    expect(meta('---\ntitle: 42\n---\ndiagram').title).toBe('42');
    expect(meta('---\ntitle: 0\n---\ndiagram').title).toBeUndefined();
  });

  it('returns only title and config, and the whole document as data', () => {
    const r = preprocess('---\ninvalid: true\ntitle: foo\ntest: bar\n---\ndiagram');
    expect(meta('---\ninvalid: true\ntitle: foo\ntest: bar\n---\ndiagram')).toEqual({
      title: 'foo',
    });
    expect(r.frontMatter?.data).toEqual({ invalid: true, title: 'foo', test: 'bar' });
  });

  it('reads config values with their JSON-schema types', () => {
    const src =
      '---\ntitle: hello\nconfig:\n  graph:\n    string: hello\n    number: 14\n    boolean: false\n    array: [1, 2, 3]\n---\ndiagram';
    expect(meta(src)).toEqual({
      title: 'hello',
      config: { graph: { string: 'hello', number: 14, boolean: false, array: [1, 2, 3] } },
    });
  });

  it('moves the legacy displayMode to gantt.displayMode (v12)', () => {
    expect(meta('---\ndisplayMode: compact\n---\ngantt').config).toEqual({
      gantt: { displayMode: 'compact' },
    });
    expect(
      meta('---\ndisplayMode: compact\nconfig:\n  gantt:\n    barGap: 4\n---\ngantt').config
    ).toEqual({
      gantt: { barGap: 4, displayMode: 'compact' },
    });
  });

  it('warns and ignores a config that is not a mapping', () => {
    const r = preprocess('---\nconfig: dark\n---\ndiagram');
    expect(r.frontMatter?.config).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['FRONT_MATTER_CONFIG']);
  });

  it.each([
    ['spaces', '   ---\n   title: foo\n   ---\n   diagram', '   diagram'],
    ['a tab', '\t---\n\ttitle: foo\n\t---\n\tdiagram', '\tdiagram'],
  ])('reads a fence indented with %s, closed at the same indent (#7613)', (_name, src, rest) => {
    expect(meta(src)).toEqual({ title: 'foo' });
    expect(body(src)).toBe(rest);
  });

  it('dedents indented front matter with nested config (#7613)', () => {
    const src =
      '   ---\n   config:\n     sankey:\n       showValues: true\n   ---\n   sankey\n   a,b,8';
    expect(meta(src).config).toEqual({ sankey: { showValues: true } });
    expect(body(src)).toBe('   sankey\n   a,b,8');
  });

  it('does not close on a fence with a different indent', () => {
    const r = preprocess('---\ntitle: foo\n   ---\n   diagram');
    expect(r.frontMatter).toBeUndefined();
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNCLOSED_FRONT_MATTER']);
  });

  it.each([
    ['CRLF', '---\r\ntitle: CRLF\r\n---\r\ngraph TD\r\n'],
    ['CR', '---\rtitle: CRLF\r---\rgraph TD\r'],
  ])('handles %s line breaks without normalising the text', (_name, src) => {
    const r = preprocess(src);
    expect(r.frontMatter?.title).toBe('CRLF');
    expect(src.slice(r.bodyStart)).toMatch(/^graph TD\r/);
  });

  it('allows trailing blanks on the fences and keeps blank lines after the closing fence', () => {
    const src = '---   \ntitle: t\n---  \t\n\n\ngraph TD\n';
    expect(meta(src).title).toBe('t');
    expect(body(src)).toBe('\n\ngraph TD\n');
  });

  it('does not take `----` or text after the dashes as a fence', () => {
    expect(preprocess('----\nfour dashes\n----\n').frontMatter).toBeUndefined();
    expect(preprocess('--- x\ntitle: a\n---\n').frontMatter).toBeUndefined();
  });
});

describe('preprocess: front matter diagnostics are at original positions', () => {
  it('reports an unclosed fence at the end, with the opener as related', () => {
    const src = '---\ntitle: foo\ngraph TD\n  A-->B\n';
    const r = preprocess(src);
    expect(r.bodyStart).toBe(src.length);
    expect(r.frontMatter).toBeUndefined();
    expect(r.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'UNCLOSED_FRONT_MATTER',
        message: 'The front matter is never closed. Add a line with `---` after it.',
        range: { start: src.length, end: src.length },
        related: [{ message: 'The front matter starts here.', range: { start: 0, end: 3 } }],
      },
    ]);
  });

  it('points the unclosed-fence opener past leading blank lines and indent', () => {
    const src = '\n\n  ---\n  title: x\n';
    const [d] = preprocess(src).diagnostics;
    expect(d?.message).toBe(
      'The front matter is never closed. Add a line with the same indent and `---` after it.'
    );
    expect(at(src, d?.related?.[0]?.range.start ?? -1)).toEqual({ line: 2, column: 2 });
  });

  it('reports a YAML error at its own line and column', () => {
    const src = '%% leading line\n\n---\ntitle: ok\nconfig:\n  theme: [dark\n---\nflowchart TD\n';
    // The first line is not blank, so this is not front matter at all.
    expect(preprocess(src).frontMatter).toBeUndefined();

    const fm =
      '\r\n  ---\r\n  title: ok\r\n  config:\r\n    theme: [dark\r\n  ---\r\nflowchart TD\r\n';
    const r = preprocess(fm);
    expect(r.diagnostics.map((d) => [d.code, at(fm, d.range.start)])).toEqual([
      ['YAML_SYNTAX', { line: 4, column: 11 }],
    ]);
    expect(fm.slice(r.bodyStart)).toBe('flowchart TD\r\n');
  });

  it('reports a dropped prototype key at its position', () => {
    const src = '---\nconfig:\n  __proto__:\n    polluted: true\n---\ngraph TD\n';
    const r = preprocess(src);
    expect(r.frontMatter?.config).toEqual({});
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.diagnostics.map((d) => [d.code, at(src, d.range.start)])).toEqual([
      ['YAML_UNSAFE_KEY', { line: 2, column: 2 }],
    ]);
  });
});
