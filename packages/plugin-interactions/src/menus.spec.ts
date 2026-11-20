/**
 * Element menus (R-PLUG-9, D105) through the public seam: `mermaid.render()` and
 * `bindFunctions(el)`, the DOM adapter's `afterMount` entry point, on a fake DOM (R-ARCH-1).
 * The test diagram (`testing/menu-diagram.ts`) is registered as `sequence` and emits `menu`
 * nodes (`AstMenu`) as sequence's parser does; it draws #143's participant groups.
 * `unregistered.spec.ts` covers rendering without the plugin.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import mermaid from '@mermaid-js/core';
import { checkUrl } from '@mermaid-js/core/v13/svg/index.js';
import { PAYLOADS } from '@mermaid-js/core/v13/svg/testing/index.js';
import type { AstMenu } from '@mermaid-js/core/v13/parser-kit/index.js';
import plugins, { interactions } from './index.js';
import {
  FakeDoc,
  FakeResizeObserver,
  lookups,
  mounted,
  parseInto,
  type FakeEl,
} from './testing/fake-dom.js';
import { menuDefinition, menuText } from './testing/menu-diagram.js';
import { render as renderText } from './testing/render.js';

afterEach(() => FakeResizeObserver.live.clear());

beforeAll(async () => {
  await mermaid.registerExternalDiagrams([menuDefinition]);
  mermaid.registerPlugins(plugins);
  mermaid.initialize({ securityLevel: 'loose' });
});

async function render(menus: readonly unknown[], front = '', participants?: string[]) {
  return renderText('d', front + menuText(menus, participants));
}

/** Lays the participant symbols out: the i-th at x 10 + 120i, top at y 20, bottom at y 400. */
function layout(root: FakeEl): void {
  const seen = new Map<string, number>();
  for (const g of root.all()) {
    const cls = g.getAttribute('class') ?? '';
    const id = g.getAttribute('data-id') ?? '';
    if (!/actor-(top|bottom)/.test(cls)) continue;
    if (!seen.has(id)) seen.set(id, seen.size);
    const left = 10 + 120 * seen.get(id)!;
    g.rect = { left, top: cls.includes('top') ? 20 : 400, width: 100, height: 40 };
  }
}

function at(menu: FakeEl): [number, number] {
  const r = menu.getBoundingClientRect();
  return [r.left, r.top];
}

const DOCS: AstMenu = { target: 'P', links: { Docs: 'https://example.com/docs', Repo: '/repo' } };

describe('element menus (R-PLUG-9, D105)', () => {
  it('binds a hidden menu next to the svg that a click on either symbol toggles', async () => {
    const result = await render([DOCS]);
    const dom = mounted(result.svg);
    layout(dom.root);
    result.bindFunctions!(dom.el);
    const [menu, ...rest] = dom.menus();
    expect(rest).toEqual([]);
    // Beside the svg, never inside it.
    expect(menu!.parentElement).toBe(dom.root);
    expect(dom.root.children.map((c) => c.tagName)).toEqual(['svg', 'div']);
    expect(menu!.getAttribute('class')).toBe('actorPopupMenu');
    expect(dom.links(menu!)).toEqual([
      ['Docs', 'https://example.com/docs'],
      ['Repo', '/repo'],
    ]);
    const a = menu!.all().find((e) => e.tagName === 'a')!;
    expect([a.getAttribute('target'), a.getAttribute('rel')]).toEqual([
      '_blank',
      'noopener noreferrer',
    ]);
    const [outer, top, bottom] = dom.groups('P');
    expect([outer!.clicks, top!.clicks, bottom!.clicks]).toEqual([0, 1, 1]);
    expect(dom.groups('Q').map((g) => g.clicks)).toEqual([0, 0, 0]);
    expect(menu!.style.display).toBe('none');
    bottom!.click();
    expect(menu!.style.display).toBe('block');
    // Below the top symbol (10, 20 + 40), whichever symbol was clicked.
    expect(at(menu!)).toEqual([10, 60]);
    top!.click();
    expect(menu!.style.display).toBe('none');
  });

  it('binds once however often bindFunctions runs with the same menus', async () => {
    const result = await render([DOCS]);
    const again = await render([DOCS]);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    result.bindFunctions!(dom.el);
    again.bindFunctions!(dom.el);
    expect(dom.menus()).toHaveLength(1);
    expect(dom.groups('P').map((g) => g.clicks)).toEqual([0, 1, 1]);
  });

  it('replaces the menus when a re-bind brings different ones (same svg)', async () => {
    const first = await render([DOCS]);
    const second = await render([{ target: 'Q', links: { New: '/new' } }]);
    expect(second.svg).toBe(first.svg);
    const dom = mounted(first.svg);
    first.bindFunctions!(dom.el);
    second.bindFunctions!(dom.el);
    expect(dom.menus().map((m) => [m.getAttribute('data-menu-for'), dom.links(m)])).toEqual([
      ['Q', [['New', '/new']]],
    ]);
    expect(dom.groups('P').map((g) => g.clicks)).toEqual([0, 0, 0]);
    expect(dom.groups('Q').map((g) => g.clicks)).toEqual([0, 1, 1]);
    // And back to no menus at all.
    const none = await render([]);
    none.bindFunctions!(dom.el);
    expect(dom.menus()).toEqual([]);
    expect(dom.groups('Q').map((g) => g.clicks)).toEqual([0, 0, 0]);
  });

  it('bindFunctions(svg) puts the menus after the svg, and a re-bind does not pile them up', async () => {
    const first = await render([DOCS]);
    const second = await render([{ target: 'P', links: { Two: '/two' } }]);
    const doc = new FakeDoc();
    const host = parseInto(doc.createElement('section'), first.svg);
    const svg = host.children[0]!;
    first.bindFunctions!(svg as unknown as Element);
    second.bindFunctions!(svg as unknown as Element);
    second.bindFunctions!(svg as unknown as Element);
    expect(svg.all().some((e) => e.getAttribute('data-menu-for') !== null)).toBe(false);
    expect(host.children.map((c) => c.tagName)).toEqual(['svg', 'div']);
    expect(lookups(host).links(host.children[1]!)).toEqual([['Two', '/two']]);
  });

  it('keeps two diagrams on one page apart, even with the same participant', async () => {
    const one = await render([{ target: 'P', links: { One: '/one' } }], '', ['P', 'Q']);
    const two = await render([{ target: 'P', links: { Two: '/two' } }], '', ['R', 'P']);
    const doc = new FakeDoc();
    const page = parseInto(parseInto(doc.createElement('div'), one.svg), two.svg);
    one.bindFunctions!(page as unknown as Element);
    two.bindFunctions!(page as unknown as Element);
    // `lookups` returns arrow functions.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { links } = lookups(page);
    expect(page.children.map((c) => [c.tagName, c.tagName === 'div' ? links(c) : null])).toEqual([
      ['svg', null],
      ['div', [['One', '/one']]],
      ['svg', null],
      ['div', [['Two', '/two']]],
    ]);
    for (const svg of page.children.filter((c) => c.tagName === 'svg'))
      expect(
        lookups(svg)
          .groups('P')
          .map((g) => g.clicks)
      ).toEqual([0, 1, 1]);
  });

  it('refuses unsafe URLs as flowchart links do, as about:blank with URL_REFUSED (v12)', async () => {
    const result = await render([
      { target: 'P', links: { Docs: '/ok', Script: 'javascript:alert(1)' } },
      { target: 'P', links: { Docs: 'javascript:alert(2)', Net: '//evil.example', N: 1 } },
      { target: 'Q', links: { Bad: 'data:text/html,<b>x</b>' } },
    ]);
    expect(result.warnings.map((w) => w.code)).toEqual(Array(5).fill('URL_REFUSED'));
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    expect(dom.menus().map((m) => [m.getAttribute('data-menu-for'), dom.links(m)])).toEqual([
      [
        'P',
        [
          ['Docs', 'about:blank'],
          ['Script', 'about:blank'],
          ['Net', 'about:blank'],
          ['N', 'about:blank'],
        ],
      ],
      ['Q', [['Bad', 'about:blank']]],
    ]);
  });

  it('orders labels as v12 enumerated them: integer-like keys first', async () => {
    const result = await render([
      { target: 'P', links: { Docs: '/d' } },
      { target: 'P', links: { 10: '/ten', 2: '/two', b: '/b' } },
    ]);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    expect(dom.links(dom.menus()[0]!).map(([l]) => l)).toEqual(['2', '10', 'Docs', 'b']);
  });

  it('draws menus only with securityLevel loose, with v13 link rules', async () => {
    const links = { Web: 'https://example.com', Rel: './page', Tel: 'tel:123' };
    // v12 allowed any scheme but javascript:, data: and vbscript:; v13 allows these only.
    const r = await render([{ target: 'P', links }]);
    const rd = mounted(r.svg);
    r.bindFunctions!(rd.el);
    expect(rd.links(rd.menus()[0]!)).toEqual([
      ['Web', 'https://example.com'],
      ['Rel', './page'],
      ['Tel', 'about:blank'],
    ]);
    try {
      for (const securityLevel of ['strict', 'stricter', 'antiscript'] as const) {
        mermaid.initialize({ securityLevel });
        const s = await render([{ target: 'P', links }]);
        const sd = mounted(s.svg);
        s.bindFunctions!(sd.el);
        expect(sd.menus()).toEqual([]);
      }
    } finally {
      mermaid.initialize({ securityLevel: 'loose' });
    }
  });

  it('leaves the svg unchanged (R-SEC-2)', async () => {
    const bare = (await render([])).svg;
    for (const payload of PAYLOADS) {
      const withPlugin = await render([
        { target: 'P', links: { [payload]: payload, ok: '/x' }, properties: { class: payload } },
      ]);
      expect(withPlugin.svg, payload).toBe(bare);
      const dom = mounted(withPlugin.svg);
      withPlugin.bindFunctions!(dom.el);
      for (const menu of dom.menus()) {
        for (const e of menu.all()) {
          // Labels are text, never markup; href values only what checkUrl allows.
          expect(e.tagName, payload).toMatch(/^(div|a)$/);
          const href = e.getAttribute('href');
          if (href !== null && href !== 'about:blank')
            expect(checkUrl(href, {}), payload).toBe(href);
          expect(e.getAttribute('class') ?? '', payload).not.toMatch(/[<>"'=()]/);
        }
      }
    }
  });

  it('sequence.forceMenus shows the menu below the top symbol, follows resizes, binds no click', async () => {
    const result = await render([DOCS], '---\nconfig:\n  sequence:\n    forceMenus: true\n---\n');
    const dom = mounted(result.svg);
    layout(dom.root);
    result.bindFunctions!(dom.el);
    const [menu] = dom.menus();
    expect(menu!.style.display).toBe('block');
    expect(at(menu!)).toEqual([10, 60]);
    expect(dom.groups('P').map((g) => g.clicks)).toEqual([0, 0, 0]);
    // The drawing scales (useMaxWidth): the observer places it again.
    dom.groups('P')[1]!.rect = { left: 30, top: 25, width: 80, height: 30 };
    FakeResizeObserver.trigger();
    expect(at(menu!)).toEqual([30, 55]);
    // A re-bind with other menus disconnects the old observer.
    (await render([])).bindFunctions!(dom.el);
    expect(FakeResizeObserver.live.size).toBe(0);
  });

  it('merges statements per target in order, with properties.class and details', async () => {
    const doc = new FakeDoc();
    const details = doc.createElement('script');
    details.textContent = JSON.stringify({
      links: { Repo: '/repo2', Wiki: '/wiki' },
      properties: { class: 'fromDetails' },
    });
    doc.byId.set('menu-json', details);
    const result = await render([
      { target: 'P', links: { Repo: '/repo', Docs: '/docs' } },
      { target: 'P', properties: { class: 'one two"><x' } },
      { target: 'P', links: { Docs: '/docs2' } },
      { target: 'P', details: 'menu-json' },
      { target: 'P', details: 'missing' },
    ]);
    const dom = mounted(result.svg, doc);
    result.bindFunctions!(dom.el);
    const [menu] = dom.menus();
    expect(dom.links(menu!)).toEqual([
      ['Repo', '/repo2'],
      ['Docs', '/docs2'],
      ['Wiki', '/wiki'],
    ]);
    expect(menu!.children[0]!.getAttribute('class')).toBe('actorPopupMenuPanel fromDetails');
  });

  it('ignores __proto__ and constructor keys from properties and details JSON', async () => {
    const doc = new FakeDoc();
    const details = doc.createElement('script');
    details.textContent =
      '{"properties":{"__proto__":{"class":"injected"}},"links":{"__proto__":"/p","x":"/x"}}';
    doc.byId.set('det', details);
    const result = await render([
      { target: 'P', details: 'det' },
      {
        target: 'P',
        properties: JSON.parse('{"__proto__":{"class":"alsoInjected"}}') as Record<string, unknown>,
      },
    ]);
    const dom = mounted(result.svg, doc);
    result.bindFunctions!(dom.el);
    const [menu] = dom.menus();
    expect(menu!.children[0]!.getAttribute('class')).toBe('actorPopupMenuPanel');
    expect(dom.links(menu!)).toEqual([['x', '/x']]);
    expect(({} as Record<string, unknown>).class).toBeUndefined();
  });

  it('skips menu nodes of the wrong shape instead of failing the render', async () => {
    const result = await render([
      null,
      3,
      'P',
      { target: 1, links: { A: '/a' } },
      { target: 'P', links: 'nope', properties: [1], details: 2 },
      { target: 'P', links: { Ok: '/ok' } },
    ]);
    const dom = mounted(result.svg);
    result.bindFunctions!(dom.el);
    expect(dom.menus().map((m) => dom.links(m))).toEqual([[['Ok', '/ok']]]);
  });

  it('claims menus', () => {
    expect(interactions.claims).toEqual(['menus']);
  });
});
