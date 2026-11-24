/**
 * A small fake DOM for the plugin specs: tests run in Node with no DOM shim (R-ARCH-1). It
 * holds what the plugin touches: attributes, children, siblings, listeners, `style` and
 * `getBoundingClientRect`. Elements are drawn where their `rect` says (zero by default); an
 * absolutely positioned element sits at its static position (`staticAt`) moved by its margins,
 * as a browser places it when `left`/`top` are not set.
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class FakeEl {
  readonly attrs = new Map<string, string>();
  readonly children: FakeEl[] = [];
  readonly style: Record<string, string> = {};
  readonly listeners = new Map<string, Set<() => void>>();
  parentElement: FakeEl | null = null;
  textContent = '';
  rect: Rect = { left: 0, top: 0, width: 0, height: 0 };
  /** Where an absolutely positioned element with no margins is drawn. */
  staticAt = { left: 0, top: 500 };
  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDoc
  ) {}
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value));
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  appendChild(child: FakeEl): FakeEl {
    return this.insertBefore(child, null);
  }
  insertBefore(child: FakeEl, ref: FakeEl | null): FakeEl {
    child.remove();
    child.parentElement = this;
    const at = ref === null ? -1 : this.children.indexOf(ref);
    if (at < 0) this.children.push(child);
    else this.children.splice(at, 0, child);
    return child;
  }
  remove(): void {
    const p = this.parentElement;
    if (p) p.children.splice(p.children.indexOf(this), 1);
    this.parentElement = null;
  }
  get nextElementSibling(): FakeEl | null {
    const p = this.parentElement;
    return p ? (p.children[p.children.indexOf(this) + 1] ?? null) : null;
  }
  addEventListener(type: string, fn: () => void): void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    this.listeners.get(type)?.delete(fn);
  }
  /** Replaces the children with `html` parsed, as the DOM adapter's `mount()` sets it. */
  set innerHTML(html: string) {
    for (const c of [...this.children]) c.remove();
    parseInto(this, html);
  }
  /** The number of click listeners. */
  get clicks(): number {
    return this.listeners.get('click')?.size ?? 0;
  }
  click(): void {
    for (const fn of this.listeners.get('click') ?? []) fn();
  }
  getBoundingClientRect(): Rect & { right: number; bottom: number } {
    const abs = this.style.position === 'absolute';
    const left = abs
      ? this.staticAt.left + (parseFloat(this.style.marginLeft ?? '') || 0)
      : this.rect.left;
    const top = abs
      ? this.staticAt.top + (parseFloat(this.style.marginTop ?? '') || 0)
      : this.rect.top;
    const { width, height } = this.rect;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  /** Every descendant, depth first. */
  all(): FakeEl[] {
    return this.children.flatMap((c) => [c, ...c.all()]);
  }
  querySelectorAll(selector: string): FakeEl[] {
    if (selector === '[data-id]') return this.all().filter((e) => e.attrs.has('data-id'));
    if (selector === 'svg') return this.all().filter((e) => e.tagName === 'svg');
    throw new Error(`fake DOM: unsupported selector ${selector}`);
  }
}

/** A fake `ResizeObserver`: `trigger()` runs every live callback. */
export class FakeResizeObserver {
  static live = new Set<FakeResizeObserver>();
  constructor(private readonly fn: () => void) {}
  observe(): void {
    FakeResizeObserver.live.add(this);
  }
  disconnect(): void {
    FakeResizeObserver.live.delete(this);
  }
  static trigger(): void {
    for (const o of FakeResizeObserver.live) o.fn();
  }
}

export class FakeDoc {
  readonly byId = new Map<string, FakeEl>();
  readonly defaultView = { ResizeObserver: FakeResizeObserver };
  createElement(tag: string): FakeEl {
    return new FakeEl(tag, this);
  }
  getElementById(id: string): FakeEl | null {
    return this.byId.get(id) ?? null;
  }
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
};

/** Parses `svg` into fake elements appended to `parent`, as `parent.innerHTML += svg` would. */
export function parseInto(parent: FakeEl, svg: string): FakeEl {
  let at = parent;
  for (const [, close, tag, rest, selfClose] of svg.matchAll(
    /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g
  )) {
    if (close) {
      at = at.parentElement ?? parent;
      continue;
    }
    const el = at.appendChild(parent.ownerDocument.createElement(tag!));
    for (const [, k, v] of rest!.matchAll(/([^\s=]+)="([^"]*)"/g))
      el.setAttribute(
        k!,
        v!.replace(/&(?:amp|lt|gt|quot);/g, (e) => ENTITIES[e]!)
      );
    if (!selfClose) at = el;
  }
  return parent;
}

/** A container `div` with `svg` mounted in it, and lookups for the specs. */
export interface Mounted extends Lookups {
  readonly el: Element;
  readonly root: FakeEl;
  readonly doc: FakeDoc;
}

export function mounted(svg: string, doc = new FakeDoc()): Mounted {
  const root = parseInto(doc.createElement('div'), svg);
  return { el: root as unknown as Element, root, doc, ...lookups(root) };
}

export interface Lookups {
  /** Every menu element under the root. */
  menus(): FakeEl[];
  /** A menu's links as `[label, href]`. */
  links(menu: FakeEl): (string | null)[][];
  /** The `g[data-id=id]` groups, in document order. */
  groups(id: string): FakeEl[];
}

export function lookups(root: FakeEl): Lookups {
  const menus = () => root.all().filter((c) => c.getAttribute('data-menu-for') !== null);
  const links = (menu: FakeEl) =>
    menu
      .all()
      .filter((e) => e.tagName === 'a')
      .map((a) => [a.textContent, a.getAttribute('href')]);
  const groups = (id: string) =>
    root.all().filter((e) => e.tagName === 'g' && e.getAttribute('data-id') === id);
  return { menus, links, groups };
}
