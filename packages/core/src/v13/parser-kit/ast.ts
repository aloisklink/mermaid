/**
 * AST base types and semantic AST ids (DESIGN §4.2, R-PARSE-8, D53, D69).
 *
 * An `AstId` is built from the user's own names, never from offsets, so it survives edits
 * elsewhere in the text, including edits to the element's own label:
 *
 * | element                       | id          |
 * | ----------------------------- | ----------- |
 * | node `A`                      | `n:A`       |
 * | the 2nd mention of node `A`   | `n:A@2`     |
 * | edge `A --> B`                | `e:A>B`     |
 * | the 2nd parallel `A`→`B` edge | `e:A>B#2`   |
 * | subgraph `one`                | `s:one`     |
 * | 3rd unnamed `st` statement    | `st:3`      |
 *
 * `%`, `>`, `@` and `#` inside names are percent-encoded (`%25`, `%3E`, `%40`, `%23`).
 * Renderers write the id as `data-ast`.
 */
import { AT, GT, HASH, PERCENT } from './char-codes.js';
import type { Range } from './positions.js';

/** Semantic AST id, e.g. `n:A`, `e:A>B#2`, `st:3`. */
export type AstId = string;

/**
 * Base of every AST node. Diagrams export one interface per node kind that extends this
 * with a literal `type` and their own fields (e.g. `FlowNodeStmt`, `FlowEdge`).
 */
export interface AstNode<T extends string = string> {
  id: AstId;
  type: T;
  /** Source span in the original text. */
  range: Range;
  children?: AstNode[];
}

/**
 * A `click … callback` / `call` statement as an AST node carries it (R-SVG-5, DESIGN §12.3):
 * the AST node of the statement has a `callback` field of this shape. Diagram-agnostic, so
 * an extension (the interactions plugin) can find callbacks in any diagram's AST.
 */
export interface AstCallback {
  /** Ids of the elements the callback is bound to (the rendered `data-id`), as written. */
  targets: string[];
  /** The function name as written (`fn`, `app.handlers.fn`). */
  name: string;
  /** The text between the parentheses of `call fn(…)`, as written. */
  args?: string;
}

/**
 * An element menu as an AST node carries it (R-PLUG-9, D105): the AST node of a menu statement
 * (sequence `link`, `links`, `properties`, `details`) has a `menu` field of this shape. The
 * `menu` field name is reserved for this on every AST node, as `callback` is for `AstCallback`;
 * a value of another shape is skipped.
 * Diagram-agnostic, so the interactions plugin can find menus in any diagram's AST. Statements
 * for the same `target` add up in source order, later labels and keys replacing earlier ones.
 * The svg never draws a menu. The interactions plugin claims `menus`; without it a diagram
 * drops them (spec #125: silently).
 */
export interface AstMenu {
  /** Id of the element the menu belongs to (the rendered `data-id`), as written. */
  target: string;
  /**
   * Menu entries, label to URL, in v12's order (object key order). URLs are checked as link URLs
   * (`checkUrl`); a refused one becomes `about:blank`, as v12's `sanitizeUrl` made it.
   */
  links?: Readonly<Record<string, unknown>>;
  /** Element properties; the plugin reads `class` (extra classes for the menu panel). */
  properties?: Readonly<Record<string, unknown>>;
  /**
   * Id of a page element whose text is JSON `{ "links": {…}, "properties": {…} }`, read when
   * the svg is mounted (v12 `details`).
   */
  details?: string;
}

function esc(name: string): string {
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c === PERCENT || c === GT || c === AT || c === HASH) {
      return name.replace(/[%>@#]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
    }
  }
  return name;
}

function bump<K>(seen: Map<K, number>, key: K): number {
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  return n;
}

/** `n:<name>`: the id of a node's first mention, which is also its vertex's id. */
export function nodeId(name: string): AstId {
  return `n:${esc(name)}`;
}

/**
 * Hands out the ids of one parse. Create one per parse; ids depend on call order. Mentions are
 * counted by the names as written, per kind: escaping is one-to-one, so this counts the same
 * as counting the ids without building them first.
 */
export class AstIds {
  private readonly nodes = new Map<string, number>();
  private readonly edges = new Map<string, Map<string, number>>();
  private readonly subgraphs = new Map<string, number>();
  private readonly statements = new Map<string, number>();

  /** `n:<name>`, then `n:<name>@2`, `@3`, … for later mentions. */
  node(name: string): AstId {
    const n = bump(this.nodes, name);
    const id = nodeId(name);
    return n === 1 ? id : `${id}@${n}`;
  }

  /** `e:<from>><to>`, then `#2`, `#3`, … for parallel edges. */
  edge(from: string, to: string): AstId {
    let ends = this.edges.get(from);
    if (!ends) this.edges.set(from, (ends = new Map<string, number>()));
    const n = bump(ends, to);
    const id = `e:${esc(from)}>${esc(to)}`;
    return n === 1 ? id : `${id}#${n}`;
  }

  /** `s:<id>`, then `@2`, … if the same subgraph id is opened again. */
  subgraph(name: string): AstId {
    const n = bump(this.subgraphs, name);
    const id = `s:${esc(name)}`;
    return n === 1 ? id : `${id}@${n}`;
  }

  /** `<kind>:<n>`: 1-based ordinal among the statements of `kind` with no user name. */
  statement(kind: string): AstId {
    return `${kind}:${bump(this.statements, kind)}`;
  }
}
