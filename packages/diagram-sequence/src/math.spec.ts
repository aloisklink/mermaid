import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import mermaid from '@mermaid-js/core';
import sequence from '@mermaid-js/diagram-sequence';

const loader = vi.fn(() =>
  Promise.resolve({ renderToString: (tex: string) => `<math><mi>${tex}</mi></math>` })
);

beforeAll(async () => {
  vi.stubGlobal('MathMLElement', class {});
  mermaid.registerPlugins([{ type: 'math', loader }]);
  await mermaid.registerExternalDiagrams([sequence]);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

it('loads no math plugin for a diagram without `$$`', async () => {
  await mermaid.render('plain', 'sequenceDiagram\nA->>B: hi');
  expect(loader).not.toHaveBeenCalled();
});

it('draws `$$…$$` in labels with the registered math renderer', async () => {
  const { svg } = await mermaid.render('math', 'sequenceDiagram\nA->>B: area $$x^2$$');
  expect(svg).toMatch(/<foreignObject[^>]*>.*<mi>x\^2<\/mi>/);
  expect(svg).not.toContain('$$');
});
