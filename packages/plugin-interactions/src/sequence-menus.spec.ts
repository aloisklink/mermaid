/**
 * Actor menus on the real sequence diagram (#145): `@mermaid-js/diagram-sequence` emits
 * `AstMenu` nodes for `links`, `link`, `properties` and `details`, and the plugin binds them on
 * the participant's `g.actor-top` / `g.actor-bottom` groups. Through `mermaid.render()`
 * and `bindFunctions(el)` on the fake DOM, as `menus.spec.ts` does with its test diagram.
 * `unregistered.spec.ts` covers rendering without the plugin.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import mermaid from '@mermaid-js/core';
import sequence from '@mermaid-js/diagram-sequence';
import plugins from './index.js';
import { FakeDoc, FakeResizeObserver, mounted } from './testing/fake-dom.js';
import { render as renderText } from './testing/render.js';

afterEach(() => FakeResizeObserver.live.clear());

const SEQ = [
  'sequenceDiagram',
  '  participant A as Alice',
  '  participant B as Bob',
  '  links A: {"Dashboard": "https://example.com/dash", "Wiki": "/wiki"}',
  '  link A: Repo @ https://example.com/repo',
  '  properties A: {"class": "internal"}',
  '  links B: not json',
  '  A->>B: hi',
  '',
].join('\n');

beforeAll(async () => {
  await mermaid.registerExternalDiagrams([sequence]);
  mermaid.registerPlugins(plugins);
  mermaid.initialize({ securityLevel: 'loose' });
});

const render = (text: string) => renderText('d', text);

describe('sequence actor menus (#145, #147)', () => {
  it('binds a menu per participant with entries on its top and bottom symbols', async () => {
    const result = await render(SEQ);
    // The rejected `links B` is the parser's warning; the plugin adds none.
    expect(result.warnings.map((w) => w.code)).toEqual(['SEQUENCE_MENU_DATA']);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    const [menu, ...rest] = dom.menus();
    expect(rest).toEqual([]);
    expect(menu!.getAttribute('data-menu-for')).toBe('A');
    expect(menu!.children[0]!.getAttribute('class')).toBe('actorPopupMenuPanel internal');
    expect(dom.links(menu!)).toEqual([
      ['Dashboard', 'https://example.com/dash'],
      ['Wiki', '/wiki'],
      ['Repo', 'https://example.com/repo'],
    ]);
    const clicked = dom
      .groups('A')
      .filter((g) => g.clicks > 0)
      .map((g) => g.getAttribute('class'));
    expect(clicked).toEqual(['actor-top', 'actor-bottom']);
    expect(dom.groups('B').every((g) => g.clicks === 0)).toBe(true);
  });

  it('takes a details element id as the menu source', async () => {
    const doc = new FakeDoc();
    const json = doc.createElement('script');
    json.textContent = JSON.stringify({ links: { Docs: '/docs' } });
    doc.byId.set('menu-a', json);
    const result = await render('sequenceDiagram\n  participant A\n  details A: menu-a\n');
    const dom = mounted(result.svg, doc);
    result.bindFunctions!(dom.el);
    const [menu, ...rest] = dom.menus();
    expect(rest).toEqual([]);
    expect(menu!.getAttribute('data-menu-for')).toBe('A');
    expect(dom.links(menu!)).toEqual([['Docs', '/docs']]);
  });

  it('sequence.forceMenus shows the menus and binds no click', async () => {
    const result = await render(`---\nconfig:\n  sequence:\n    forceMenus: true\n---\n${SEQ}`);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    const [menu] = dom.menus();
    expect(menu!.style.display).toBe('block');
    expect(dom.groups('A').every((g) => g.clicks === 0)).toBe(true);
  });
});
