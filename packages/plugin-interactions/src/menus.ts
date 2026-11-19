/**
 * Element menus (R-PLUG-9, D105): the v12 sequence actor popup (`drawPopup`), rebuilt as DOM
 * the plugin owns. The svg never holds a menu, so core output stays inert (R-SEC-2).
 *
 * `collect` folds every `menu` field (`AstMenu`) into one part list per target, checking link
 * URLs as flowchart links are checked (`checkUrl`, with the render's `securityLevel` and
 * `linkSchemes`); a refused URL becomes `about:blank` with `URL_REFUSED`, as v12's
 * `sanitizeUrl` made it. `plan` folds them, reading `details` from the page. `bind` puts one
 * `div.actorPopupMenu` per target right after the svg (never inside it) and binds it to the
 * target's innermost `g[data-id]` groups: a click toggles it, and it opens below the first.
 * With `<diagram>.forceMenus` every menu is shown and nothing is bound (v12 `forceMenus`).
 *
 * Placement: the menu is absolutely positioned with no `left`/`top`, so it sits at its static
 * position right after the svg and moves with it when the page reflows; margins offset it to
 * below the anchor. It is placed again on every show, and a forced menu again whenever the svg
 * changes size (`ResizeObserver`), which also covers an svg mounted while hidden.
 */
import type { AstMenu } from '@mermaid-js/core/v13/parser-kit/index.js';
import { checkUrl, type UrlOptions } from '@mermaid-js/core/v13/svg/index.js';
import { defineFeature, isBag } from './feature.js';

const BLANK = 'about:blank';
/** Marks a menu element; the menus of an svg are the run of marked siblings after it. */
const MARK = 'data-mermaid-menu';

type Link = readonly [label: string, href: string];
type MenuPart =
  | { readonly links: readonly Link[] }
  | { readonly properties: Readonly<Record<string, unknown>> }
  | { readonly details: string };

interface MenuState {
  readonly specs: Map<string, MenuPart[]>;
  readonly urls: UrlOptions;
  readonly force: boolean;
}

interface Folded {
  readonly target: string;
  readonly links: readonly Link[];
  readonly classes: readonly string[];
}

/** v12 `sanitizeUrl` for one menu entry: the checked URL, or `about:blank` with a warning. */
function checkedLinks(links: Record<string, unknown>, urls: UrlOptions): Link[] {
  return Object.entries(links).map(([label, url]): Link => {
    if (typeof url === 'string') return [label, checkUrl(url, urls) ?? BLANK];
    urls.warn?.({
      code: 'URL_REFUSED',
      message: `The menu link ${JSON.stringify(label.slice(0, 100))} was removed: its URL is not a string.`,
    });
    return [label, BLANK];
  });
}

/** A null-prototype bag, so `__proto__` from JSON is an ordinary key. */
const bag = <V>(): Record<string, V> => Object.create(null) as Record<string, V>;

/** Keys that never become a label or a property. */
const RESERVED: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** v12 `insertLinks` / `insertProperties` / `addDetails`, in source order. */
function fold(target: string, parts: readonly MenuPart[], doc: Document, urls: UrlOptions): Folded {
  const links = bag<string>();
  const properties = bag<unknown>();
  const addLinks = (list: readonly Link[]) => {
    for (const [label, href] of list) if (!RESERVED.has(label)) links[label] = href;
  };
  const addProperties = (from: Readonly<Record<string, unknown>>) => {
    for (const [k, v] of Object.entries(from)) if (!RESERVED.has(k)) properties[k] = v;
  };
  for (const part of parts) {
    if ('links' in part) addLinks(part.links);
    else if ('properties' in part) addProperties(part.properties);
    else {
      let details: unknown;
      try {
        details = JSON.parse(doc.getElementById(part.details)?.textContent ?? '');
      } catch {
        continue; // v12 logged the parse error and went on
      }
      if (!isBag(details)) continue;
      if (isBag(details.properties)) addProperties(details.properties);
      if (isBag(details.links)) addLinks(checkedLinks(details.links, { ...urls, warn: undefined }));
    }
  }
  const cls = properties.class;
  const classes =
    typeof cls === 'string' ? cls.split(/\s+/).filter((c) => /^-?[A-Za-z_][\w-]*$/.test(c)) : [];
  // Object.entries enumerates integer-like keys first, as v12's `for … in` over the links did.
  return { target, links: Object.entries(links), classes };
}

function build(doc: Document, menu: Folded, width: number): HTMLElement {
  const box = doc.createElement('div');
  box.setAttribute('class', 'actorPopupMenu');
  box.setAttribute(MARK, '');
  box.setAttribute('data-menu-for', menu.target);
  Object.assign(box.style, { position: 'absolute', zIndex: '1', display: 'none' });
  const panel = box.appendChild(doc.createElement('div'));
  panel.setAttribute('class', ['actorPopupMenuPanel', ...menu.classes].join(' '));
  Object.assign(panel.style, {
    minWidth: `${Math.max(0, Math.round(width))}px`,
    padding: '4px 0',
    background: 'Canvas',
    color: 'CanvasText',
    border: '1px solid GrayText',
    boxShadow: '0px 8px 16px 0px rgba(0,0,0,0.2)',
  });
  for (const [label, href] of menu.links) {
    const a = panel.appendChild(doc.createElement('a'));
    a.setAttribute('class', 'actor');
    a.setAttribute('href', href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    Object.assign(a.style, { display: 'block', padding: '6px 10px' });
    a.textContent = label;
  }
  return box;
}

/** Offsets a shown `menu` from its static position to just below `anchor`. */
function place(menu: HTMLElement, anchor: Element): void {
  menu.style.marginLeft = '0px';
  menu.style.marginTop = '0px';
  const origin = menu.getBoundingClientRect();
  const box = anchor.getBoundingClientRect();
  menu.style.marginLeft = `${box.left - origin.left}px`;
  menu.style.marginTop = `${box.bottom - origin.top}px`;
}

/** Removes the menus right after `svg`: its own from an earlier bind, or a replaced svg's. */
function removeMenusAfter(svg: Element): void {
  let next = svg.nextElementSibling;
  while (next?.hasAttribute(MARK)) {
    const after = next.nextElementSibling;
    next.remove();
    next = after;
  }
}

export const menus = defineFeature<MenuState>({
  field: 'menu',
  claim: 'menus',
  start(ctx) {
    // `forceMenus` lives in the diagram's own config section (`sequence.forceMenus`).
    const section = (ctx.config as Record<string, { forceMenus?: unknown } | undefined>)[
      ctx.diagram
    ];
    return {
      specs: new Map(),
      urls: {
        securityLevel: ctx.securityLevel,
        linkSchemes: ctx.linkSchemes,
        warn: (w) => ctx.warn(w),
      },
      force: section?.forceMenus === true,
    };
  },
  collect(value, acc) {
    if (!isBag(value) || typeof value.target !== 'string') return;
    const menu = value as Partial<AstMenu> & { target: string };
    let parts = acc.specs.get(menu.target);
    if (!parts) acc.specs.set(menu.target, (parts = []));
    if (isBag(menu.links)) parts.push({ links: checkedLinks(menu.links, acc.urls) });
    if (isBag(menu.properties)) parts.push({ properties: menu.properties });
    if (typeof menu.details === 'string') parts.push({ details: menu.details });
  },
  plan(acc, doc) {
    const folded = [...acc.specs].map(([target, parts]) => fold(target, parts, doc, acc.urls));
    const shown = folded.filter((m) => m.links.length > 0); // v12 drew no popup without links
    return {
      key: JSON.stringify([acc.force, shown]),
      bind(scope) {
        const { svg } = scope;
        removeMenusAfter(svg);
        const parent = svg.parentElement;
        if (shown.length === 0 || parent === null) return;
        const anchors = scope.anchors(new Set(shown.map((m) => m.target)));
        let last: Element = svg;
        const forced: [HTMLElement, Element][] = [];
        for (const menu of shown) {
          const mine = anchors.get(menu.target) ?? [];
          const first = mine[0];
          if (first === undefined) continue;
          const box = build(doc, menu, first.getBoundingClientRect().width);
          parent.insertBefore(box, last.nextElementSibling);
          last = box;
          scope.onTeardown(() => box.remove());
          if (acc.force) {
            box.style.display = 'block';
            place(box, first);
            forced.push([box, first]);
            continue;
          }
          const toggle = () => {
            const show = box.style.display === 'none';
            box.style.display = show ? 'block' : 'none';
            if (show) place(box, first);
          };
          for (const a of mine) {
            const style = (a as HTMLElement).style as CSSStyleDeclaration | undefined;
            if (style) {
              style.cursor = 'pointer';
              scope.onTeardown(() => (style.cursor = ''));
            }
            scope.listen(a, 'click', toggle);
          }
        }
        const Observer = doc.defaultView?.ResizeObserver;
        if (forced.length > 0 && Observer !== undefined) {
          const observer = new Observer(() => {
            for (const [box, first] of forced) place(box, first);
          });
          observer.observe(svg);
          scope.onTeardown(() => observer.disconnect());
        }
      },
    };
  },
});
