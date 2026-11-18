/**
 * Decided divergences from v12 preprocessing (DESIGN §4.1: "found by the corpus and decided
 * case by case"). The fence suite runs v12's released `frontMatterRegex` (after v12's
 * CRLF→LF `cleanupText`) next to v13 over v12's own regex corpus plus edge inputs. Any
 * disagreement must be listed in FENCE_DIVERGENCES, and a listed one that disappears fails
 * too, so the list stays honest (R-COMPAT-4). YAML and directive divergences are pinned below.
 */
import { describe, expect, it } from 'vitest';
import { preprocess } from './index.js';

/** v12 `diagram-api/regexes.ts` `frontMatterRegex`, byte for byte (the oracle). */
const V12_FRONT_MATTER = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;

interface Outcome {
  matched: boolean;
  /** Without front matter: whether the source is rejected for a stray or unclosed `---`. */
  rejected?: boolean;
  /** The YAML text between the fences, trimmed. */
  yaml?: string;
  /** The text after the front matter, without the blank lines v12 consumes. */
  rest?: string;
}

function dropBlankLines(s: string): string {
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\n') from = i + 1;
    else if (!/\s/.test(s[i] ?? '')) break;
  }
  return s.slice(from);
}

function v12(src: string): Outcome {
  const text = src.replace(/\r\n?/g, '\n');
  const m = V12_FRONT_MATTER.exec(text);
  // v12 registers a `---` pseudo-diagram whose parse throws "Diagrams beginning with --- …".
  if (!m) return { matched: false, rejected: text.trimStart().startsWith('---') };
  return {
    matched: true,
    yaml: (m[2] ?? '').trim(),
    rest: dropBlankLines(text.slice(m[0].length)),
  };
}

function v13(src: string): Outcome {
  const r = preprocess(src);
  const text = (s: string) => s.replace(/\r\n?/g, '\n');
  const fm = r.frontMatter;
  if (!fm) {
    // A stray `---` that is not a fence is left to detection, which rejects it as v12 does.
    const stray = src.slice(r.bodyStart).trimStart().startsWith('---');
    return { matched: false, rejected: r.diagnostics.some((d) => d.severity === 'error') || stray };
  }
  const yaml = text(src.slice(fm.yamlRange.start, fm.yamlRange.end)).trim();
  return { matched: true, yaml, rest: dropBlankLines(text(src.slice(r.bodyStart))) };
}

/** v12's `regexes.spec.ts` FRONT_MATTER_CORPUS, plus edge inputs. */
const FENCE_CORPUS: string[] = [
  '---\ntitle: Hello\n---\ngraph TD\n  A-->B\n',
  '---\ntitle: Hello\n---\n',
  '---\r\ntitle: CRLF\r\n---\r\ngraph TD\n',
  '  ---\n  title: indented\n  ---\ngraph TD\n',
  '\t---\n\ttitle: tab indented\n\t---\ngraph TD\n',
  '---\ntitle: |\n  ---\n  still the body\n---\ngraph TD\n',
  '---\n\n---\n\nMORE\n---\n',
  '---\n\n\n---\ngraph TD\n',
  '---   \ntitle: trailing spaces on the fence\n---   \ngraph TD\n',
  '---\ntitle: many trailing newlines\n---\n\n\n\ngraph TD\n',
  '---\ntitle: no trailing newline after close\n---',
  '---\ntitle: unterminated\ngraph TD\n',
  '---\n',
  '---',
  '----\nfour dashes\n----\n',
  '  ---\nclose at a different indent\n---\n',
  '---\nopen at col0\n  ---\n',
  'graph TD\n---\nnot at the start\n---\n',
  '',
  '\n\n\n',
  'graph TD\n  A-->B\n',
  '---\n' + ' \n'.repeat(20),
  '---\n' + ' \n'.repeat(20) + '---\n',
  // Edge inputs added for v13.
  '\n\n---\ntitle: after blank lines\n---\ngraph TD\n',
  '  \n---\ntitle: after a blank line with spaces\n---\ngraph TD\n',
  '---\rtitle: CR only\r---\rgraph TD\r',
  '--- \ntitle: a\n--- x\n---\ngraph TD\n',
  '---\ntitle: a\n---graph TD\n',
];

interface Divergence {
  input: string;
  decision: string;
}

const FENCE_DIVERGENCES: Divergence[] = [
  {
    input: '---\n\n---\n\nMORE\n---\n',
    decision:
      "v12's greedy opening `\\s*` swallows the blank line, so the block closes at the *last* fence (#8200). v13 closes at the first fence line, as a line scanner and a reader expect. Kept.",
  },
  {
    input: '---\ntitle: no trailing newline after close\n---',
    decision:
      'v12 needs a line break after the closing fence and then fails with "Diagrams beginning with --- are not valid". v13 accepts a closing fence at the end of the text (DESIGN §4.1). Accept-only change.',
  },
  {
    input: '\n\n---\ntitle: after blank lines\n---\ngraph TD\n',
    decision:
      'v12 render() only allows horizontal whitespace before the opener and fails on leading blank lines; v12 run() trims them first. v13 takes the first non-blank line (DESIGN §4.1), so both entry points agree. Accept-only change.',
  },
  {
    input: '  \n---\ntitle: after a blank line with spaces\n---\ngraph TD\n',
    decision: 'As above: a whitespace-only first line before the opener. Accept-only change.',
  },
];

describe('front-matter fence: v12 regex vs v13 line scanner', () => {
  it('agrees on every corpus input except the decided divergences', () => {
    const differing = FENCE_CORPUS.filter(
      (src) => JSON.stringify(v12(src)) !== JSON.stringify(v13(src))
    );
    expect(differing).toEqual(FENCE_DIVERGENCES.map((d) => d.input));
  });

  it.each(FENCE_DIVERGENCES.map((d) => [d.input, d.decision]))('%j: %s', (input) => {
    // v13 accepts where v12 does not, or closes earlier; never the other way round.
    expect(v13(input).matched).toBe(true);
  });
});

describe('YAML and directive divergences (decided)', () => {
  it('rejects YAML anchors, which js-yaml accepts: not used by Mermaid config, kept out of the subset', () => {
    expect(
      preprocess('---\ntitle: &t hello\n---\ngraph TD\n').diagnostics.map((d) => d.code)
    ).toEqual(['YAML_SYNTAX']);
  });

  it('drops prototype keys that js-yaml/JSON.parse keep as own keys (DESIGN §4.1 prototype protection)', () => {
    expect(preprocess('---\nconfig:\n  constructor: 1\n---\n').frontMatter?.config).toEqual({});
    expect(preprocess('%%{init: {"constructor": 1}}%%').directives[0]?.args).toEqual({});
  });

  it('ignores a non-mapping `config` with a warning; v12 passed it on to the merge', () => {
    expect(preprocess('---\nconfig: dark\n---\n').frontMatter?.config).toBeUndefined();
  });

  it('keeps the other directives when one has invalid JSON; v12 dropped them all', () => {
    expect(
      preprocess('%%{init: {bad}}%%\n%%{init: {"theme": "dark"}}%%').directives.map((d) => d.args)
    ).toEqual([undefined, { theme: 'dark' }]);
  });

  it('ends an unclosed directive at its line with an error; v12 swallowed the rest of the text', () => {
    const r = preprocess('%%{init: {"theme": "dark"}\ngraph TD\nA-->B');
    expect(r.directives[0]?.range).toEqual({ start: 0, end: 26 });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNCLOSED_DIRECTIVE']);
  });

  it('matches directive names exactly; v12 tested /init\\b/ unanchored, so `myinit` counted', () => {
    expect(preprocess('%%{myinit: {"a": 1}}%%').directives[0]?.kind).toBe('other');
  });
});
