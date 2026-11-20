import { describe, expect, it } from 'vitest';
import type { DiagramParseContext } from '@mermaid-js/core/v13/index.js';
import { preprocess } from '@mermaid-js/core/v13/preprocess/index.js';
import { sequence } from './plugin.js';

const titleOf = (text: string) =>
  sequence.parse(text, { preprocessed: preprocess(text) } as unknown as DiagramParseContext).model
    .title;

describe('sequence.parse', () => {
  it('takes the front-matter title when the diagram has no `title` statement', () => {
    expect(titleOf('---\ntitle: Front\n---\nsequenceDiagram\nA->>B: hi')).toBe('Front');
  });

  it('keeps a `title` statement over the front-matter title', () => {
    expect(titleOf('---\ntitle: Front\n---\nsequenceDiagram\ntitle Own\nA->>B: hi')).toBe('Own');
  });
});
