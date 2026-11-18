import { beforeAll, describe, expect, it } from 'vitest';
import mermaid from '../mermaid.js';
import { DEFAULT_LIMITS, type Limits } from '../v13/limits/index.js';
import type { DiagramDefinitionV13 } from './types.js';

let parsedWith: Limits | undefined;

interface Model {
  readonly labels: string[];
}

/** One box per line after `boxesV13`; a `!` is a syntax error. Ignores directives and comments. */
const boxes: DiagramDefinitionV13<Model, { width: number }> = {
  id: 'boxesV13',
  detector: (text) => /^\s*boxesV13/.test(text),
  layoutKind: 'custom',
  parse(text, { preprocessed, limits }) {
    parsedWith = limits;
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
