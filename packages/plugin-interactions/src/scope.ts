/**
 * Where one render's interactions bind (R-PLUG-9): the diagram roots inside the mount
 * element, and the groups of each element in one svg. Two diagrams on a page can use the same
 * element ids (`data-id` is the name as written), so nothing here looks outside one svg.
 */

/** One svg's binding: what each feature added, undone by `teardown`. */
export interface Scope {
  readonly svg: Element;
  readonly doc: Document;
  /**
   * For each id, the innermost `g[data-id=id]` groups that `accept` takes (a sequence
   * participant's top and bottom symbol, a flowchart `g.node`). With no `accept` and no such
   * group, the outermost `[data-id=id]` elements.
   */
  anchors(ids: ReadonlySet<string>, accept?: (g: Element) => boolean): Map<string, Element[]>;
  /** Adds a listener that `teardown` removes. */
  listen(target: Element, type: string, fn: () => void): void;
  /** Runs `fn` on teardown (removing a menu, disconnecting an observer). */
  onTeardown(fn: () => void): void;
}

const isSvg = (n: Element): boolean => n.tagName.toLowerCase() === 'svg';

/**
 * The `[data-id]` elements of the diagram root `svg` itself: not those of a diagram embedded in
 * it (ADR-15), whose nested `<svg>` is its own scope with ids of its own.
 */
export function ownIds(svg: Element): Element[] {
  return [...svg.querySelectorAll('[data-id]')].filter((n) => {
    for (let p = n.parentElement; p !== null && p !== svg; p = p.parentElement)
      if (isSvg(p)) return false;
    return true;
  });
}

/** True when an ancestor of `n` below `top` is in `pool`. */
function inside(n: Element, pool: ReadonlySet<Element>, top: Element): boolean {
  for (let p = n.parentElement; p !== null && p !== top; p = p.parentElement)
    if (pool.has(p)) return true;
  return false;
}

/** The members of `nodes` that hold another member, below `top`. */
function holders(nodes: readonly Element[], top: Element): Set<Element> {
  const pool = new Set(nodes);
  const out = new Set<Element>();
  for (const n of nodes)
    for (let p = n.parentElement; p !== null && p !== top; p = p.parentElement)
      if (pool.has(p)) out.add(p);
  return out;
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
};

/** The `data-id` values of an svg string, in document order (attribute values as `esc` wrote them). */
function dataIds(svg: string): string[] {
  return [...svg.matchAll(/\sdata-id="([^"]*)"/g)].map(([, v]) =>
    v!.replace(/&(?:amp|lt|gt|quot);/g, (e) => ENTITIES[e]!)
  );
}

/**
 * The diagram roots in `el` that show `svgText`: `el` itself when it is one, else the
 * outermost `svg` elements inside it. When there are several, only those with the render's `data-id`s in
 * the same order (two identical drawings both match).
 */
export function rootsFor(el: Element, svgText: string): Element[] {
  if (isSvg(el)) return [el];
  const all = [...el.querySelectorAll('svg')];
  const pool = new Set(all);
  const roots = all.filter((s) => !inside(s, pool, el));
  if (roots.length <= 1) return roots;
  const want = dataIds(svgText).join('\n');
  return roots.filter(
    (r) =>
      [...r.querySelectorAll('[data-id]')].map((n) => n.getAttribute('data-id')).join('\n') === want
  );
}

/** A scope for `svg`, and the function that undoes everything bound through it. */
export function createScope(svg: Element): { scope: Scope; teardown: () => void } {
  const undo: (() => void)[] = [];
  const scope: Scope = {
    svg,
    doc: svg.ownerDocument,
    anchors(ids, accept) {
      const found = new Map<string, Element[]>();
      for (const node of ownIds(svg)) {
        const id = node.getAttribute('data-id') ?? '';
        if (ids.has(id)) found.set(id, [...(found.get(id) ?? []), node]);
      }
      const out = new Map<string, Element[]>();
      for (const [id, nodes] of found) {
        const groups = nodes.filter(
          (n) => n.tagName.toLowerCase() === 'g' && (accept?.(n) ?? true)
        );
        if (groups.length > 0) {
          const covered = holders(groups, svg);
          out.set(
            id,
            groups.filter((n) => !covered.has(n))
          );
        } else if (accept === undefined) {
          const pool = new Set(nodes);
          out.set(
            id,
            nodes.filter((n) => !inside(n, pool, svg))
          );
        }
      }
      return out;
    },
    listen(target, type, fn) {
      target.addEventListener(type, fn, false);
      undo.push(() => target.removeEventListener(type, fn, false));
    },
    onTeardown(fn) {
      undo.push(fn);
    },
  };
  return {
    scope,
    teardown: () =>
      undo
        .splice(0)
        .reverse()
        .forEach((fn) => fn()),
  };
}
