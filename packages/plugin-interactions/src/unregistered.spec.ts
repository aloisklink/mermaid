/**
 * Rendering without the plugin, then with it: v13's "without the plugin" cases from
 * `menus.spec.ts` and `sequence-menus.spec.ts`. Registering a plugin cannot be undone, so they
 * share this file and run in order.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import mermaid from '@mermaid-js/core';
import sequence from '@mermaid-js/diagram-sequence';
import plugins from './index.js';
import { render } from './testing/render.js';

const SEQ = [
  'sequenceDiagram',
  '  participant A as Alice',
  '  links A: {"Dashboard": "https://example.com/dash"}',
  '  links B: not json',
  '  A->>B: hi',
  '',
].join('\n');

beforeAll(async () => {
  await mermaid.registerExternalDiagrams([sequence]);
});

describe('without the plugin', () => {
  it('drops menus: no menu, no warning of its own, no bindFunctions, the same svg', async () => {
    const plain = await render('d', SEQ);
    // The rejected `links B` is the parser's warning.
    expect(plain.warnings.map((w) => w.code)).toEqual(['SEQUENCE_MENU_DATA']);
    expect(plain.bindFunctions).toBeUndefined();
    expect(plain.svg).not.toContain('actorPopupMenu');

    mermaid.registerPlugins(plugins);
    const withPlugin = await render('d', SEQ);
    expect(withPlugin.warnings.map((w) => w.code)).toEqual(['SEQUENCE_MENU_DATA']);
    expect(withPlugin.bindFunctions).toBeTypeOf('function');
    expect(withPlugin.svg).toBe(plain.svg);
  });
});
