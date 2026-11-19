import { beforeAll, describe, expect, it } from 'vitest';
import type { MermaidConfig } from '../config.type.js';
import mermaid from '../mermaid.js';
import { DEFAULT_LIMITS, type Limits } from '../v13/limits/index.js';
import type { SecurityLevel } from '../v13/svg/url.js';
import type { AstNode } from '../v13/parser-kit/ast.js';
import type { HookContext } from '../v13/pipeline/extensions.js';
import type { DiagramDefinitionV13 } from './types.js';

let parsedWith: Limits | undefined;
let claimed: readonly string[] | undefined;
let renderedWith: SecurityLevel | undefined;

interface Model {
  readonly labels: string[];
}

/** One box per line after `boxesV13`; a `!` is a syntax error. Ignores directives and comments. */
const boxes: DiagramDefinitionV13<Model, { width: number }> = {
  id: 'boxesV13',
  detector: (text) => /^\s*boxesV13/.test(text),
  layoutKind: 'custom',
  parse(text, { preprocessed, claims, limits }) {
    parsedWith = limits;
    claimed = claims;
    const lines = text.slice(preprocessed.bodyStart).split('\n').slice(1);
    const start = text.indexOf('!', preprocessed.bodyStart);
    const bad = start >= 0;
    return {
      model: { labels: lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('%%')) },
      ast: { id: 'root', type: 'root', range: { start: 0, end: text.length } },
      diagnostics: !bad
        ? []
        : [
            {
              severity: 'error',
              code: 'BAD_BOX',
              message: 'A box cannot start with !',
              range: { start, end: start + 1 },
            },
          ],
      symbols: [],
      statements: [],
    };
  },
  layout: (model) => ({ width: 100 * model.labels.length }),
  render(model, layout, ctx, w) {
    renderedWith = ctx.securityLevel;
    const fill = ctx.theme.color('mainBkg');
    w.open('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      class: 'mermaid mermaid-boxesV13',
      viewBox: [0, 0, layout.width, 50],
    });
    model.labels.forEach((label, i) => {
      w.leaf('rect', { id: `${ctx.idPrefix}-box-${i}`, x: i * 100, width: 90, height: 40, fill });
      w.open('text', { x: i * 100 + 45, y: 25 });
      w.text(label);
      w.close();
    });
    w.close();
  },
};

beforeAll(async () => {
  await mermaid.registerExternalDiagrams([
    {
      id: boxes.id,
      detector: (text) => boxes.detector(text),
      loader: () => Promise.resolve({ id: boxes.id, diagram: boxes, version: 13 as const }),
    },
  ]);
});

describe('DiagramDefinitionV13', () => {
  it('renders into the <svg> that v12 created, keeping its styles', async () => {
    const { svg, diagramType } = await mermaid.render('v13-test', 'boxesV13\nfirst\nsecond');
    expect(diagramType).toBe('boxesV13');
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    expect(root.id).toBe('v13-test');
    expect(root.getAttribute('class')).toBe('mermaid mermaid-boxesV13');
    expect(root.getAttribute('viewBox')).toBe('0 0 200 50');
    expect(root.querySelector('style')?.textContent).toContain('#v13-test');
    expect([...root.querySelectorAll('text')].map((t) => t.textContent)).toEqual([
      'first',
      'second',
    ]);
    expect(root.querySelector('#v13-test-box-1')).not.toBeNull();
  });

  it("paints with v12's theme variables", async () => {
    const { svg } = await mermaid.render(
      'v13-theme',
      '%%{init: {"theme": "base", "themeVariables": {"mainBkg": "#123456"}}}%%\nboxesV13\nx'
    );
    expect(svg).toContain('fill="#123456"');
  });

  it("draws with v12's security level", async () => {
    const levelOf = async (securityLevel: MermaidConfig['securityLevel']) => {
      mermaid.initialize({ securityLevel });
      renderedWith = undefined;
      await mermaid.render('v13-level', 'boxesV13\nx');
      return renderedWith;
    };
    try {
      for (const level of ['strict', 'stricter', 'loose', 'antiscript'] as const) {
        expect(await levelOf(level)).toBe(level);
      }
    } finally {
      mermaid.initialize({ securityLevel: 'strict' });
    }
  });

  it("keeps v13's edge limit: v12's `maxEdges` is for flowcharts", async () => {
    await mermaid.parse('boxesV13\nx');
    expect(parsedWith?.maxEdges).toBe(DEFAULT_LIMITS.maxEdges);
  });

  it('throws diagnostics as errors from parse', async () => {
    await expect(mermaid.parse('boxesV13\nok\n!bad')).rejects.toThrow('A box cannot start with !');
  });

  it('parses the source as written, so positions count front matter and comments', async () => {
    const text = '---\ntitle: t\n---\nboxesV13\n%% a comment\n#quot; !bad';
    await expect(mermaid.parse(text)).rejects.toThrow(
      'Error at line 6, column 8: A box cannot start with !'
    );
  });
});

// Extensions stay registered for the rest of this file, so these tests run in order.
describe('v13 extensions', () => {
  it('without one, offers no bindFunctions', async () => {
    const { bindFunctions } = await mermaid.render('v13-plain', 'boxesV13\nx');
    expect(bindFunctions).toBeUndefined();
    expect(claimed).toEqual([]);
  });

  it('runs postParse while drawing, and afterMount from bindFunctions with the same state', async () => {
    const seen: unknown[] = [];
    mermaid.registerPlugins([
      {
        type: 'extension',
        extension: {
          id: 'spy',
          claims: ['menus'],
          postParse(ast, ctx) {
            ctx.state.root = ast.id;
            seen.push(['postParse', ctx.diagram, ctx.securityLevel, ctx.idPrefix]);
            return ast;
          },
          afterMount(el, result, state) {
            seen.push(['afterMount', el.id, result.svg.includes('v13-ext-box-0'), state.root]);
          },
        },
      },
    ]);
    const { bindFunctions } = await mermaid.render('v13-ext', 'boxesV13\nx');
    expect(claimed).toEqual(['menus']);
    expect(seen).toEqual([['postParse', 'boxesV13', 'strict', 'v13-ext']]);
    const el = document.createElement('div');
    el.id = 'host';
    bindFunctions!(el);
    expect(seen.at(-1)).toEqual(['afterMount', 'host', true, 'root']);
  });

  it("keeps each render's state, and replaces an extension registered again with its id", async () => {
    const mounted: unknown[] = [];
    const counter = (name: string) => ({
      type: 'extension' as const,
      extension: {
        id: 'counter',
        postParse(ast: AstNode, ctx: HookContext) {
          ctx.state.render = ctx.idPrefix;
          return ast;
        },
        afterMount(_el: Element, _result: unknown, state: Record<string, unknown>) {
          mounted.push([name, state.render]);
        },
      },
    });
    mermaid.registerPlugins([counter('first')]);
    const a = await mermaid.render('v13-a', 'boxesV13\nx');
    const b = await mermaid.render('v13-b', 'boxesV13\nx');
    // Registered after both renders: neither runs it.
    mermaid.registerPlugins([counter('second')]);
    a.bindFunctions!(document.createElement('div'));
    b.bindFunctions!(document.createElement('div'));
    expect(mounted).toEqual([
      ['first', 'v13-a'],
      ['first', 'v13-b'],
    ]);
    mounted.length = 0;
    (await mermaid.render('v13-c', 'boxesV13\nx')).bindFunctions!(document.createElement('div'));
    expect(mounted).toEqual([['second', 'v13-c']]);
  });
});
