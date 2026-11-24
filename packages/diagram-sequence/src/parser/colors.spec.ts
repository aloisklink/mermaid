import { describe, expect, it } from 'vitest';
import { parseColor } from '@mermaid-js/core/v13/theme/index.js';
import { isNamedColor, NAMED_COLORS } from './colors.js';

describe('isNamedColor', () => {
  it('lists only names core parses, as many as core knows (139, gray spellings)', () => {
    for (const name of NAMED_COLORS) expect(parseColor(name), name).toBeDefined();
    expect(NAMED_COLORS.size).toBe(139);
  });

  it('takes grey spellings and rejects other words, as parseColor does', () => {
    for (const word of ['grey', 'darkslategrey', 'lightgrey', 'rebeccapurple', 'notacolour', 'blu'])
      expect(isNamedColor(word), word).toBe(parseColor(word) !== undefined);
  });
});
