// The layout contract for graph diagrams (DESIGN §6.1, D70). Both sides are plain data: the
// diagram measures every box before layout, the engine never measures, and every backend
// (SVG now, ASCII later) reads the same LayoutModel (R-ARCH-3).

import type { ResolvedConfig } from '../config/resolve.js';
import type { LayoutMetrics } from './units.js';

/** Flow direction: top to bottom, bottom to top, left to right, right to left. */
export type Dir = 'TB' | 'BT' | 'LR' | 'RL';

/** A side of a box. */
export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface Point {
  x: number;
  y: number;
}

/**
 * A point on an edge route. `axis` says how the route runs into the point: `'v'` vertically,
 * `'h'` horizontally. Renderers use it to leave and reach nodes square to their sides.
 */
export interface RoutePoint extends Point {
  axis: 'v' | 'h';
}

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutNode {
  id: string;
  /** Measured size of the node's box, in the units of the measurer (px for SVG, cells for ASCII). */
  width: number;
  height: number;
  /** Id of the group this node sits in. */
  parent?: string;
  shape?: string;
  /**
   * How much of the side that edges meet may be shared out between edge ends, measured across
   * the flow. 0 keeps every end at the middle. Defaults to the side's length less 24.
   */
  span?: number;
  /**
   * Where on the box, down from its top, the line that `left` and `right` edge ends meet lies
   * (D501): an architecture service's icon centre, above its label. Defaults to the middle.
   * `compass` reads it, and `layered` for the ends it moves onto a named side (D503).
   */
  anchorY?: number;
}

export interface LayoutEdge {
  id: string;
  /** Node or group id. */
  source: string;
  /** Node or group id. */
  target: string;
  /** Least number of ranks the edge spans (`---->` gives more than 1). */
  minLen: number;
  /** Measured size of the edge label, including any room the diagram wants around it. */
  label?: Size;
  /**
   * Measured size of a small label at the source end (a class multiplicity), including any room
   * the diagram wants around it. The engine places it beside the route's first segment, off to
   * one side, outside the source box (D102).
   */
  startLabel?: Size;
  /** As `startLabel`, at the target end, also clear of `LayoutGraph.headRoom`. */
  endLabel?: Size;
  /**
   * Room a marker drawn at the source end takes (a class diamond): `length` out from the box
   * along the route, `width` across it, centred on the line. End labels keep clear of every
   * edge's markers, and in `layered` an edge's own end label stands past its marker's `length`
   * (D607); nothing else moves for them.
   */
  startMarker?: EndMarker;
  /** As `startMarker`, at the target end. */
  endMarker?: EndMarker;
  /**
   * The side each end leaves or enters by (D501, architecture's `a:R -- L:b`). In `compass`, an
   * end with none takes the side `direction` gives (D327). `layered` treats it as a hint (D503):
   * ranks and node order stay, and only the end's route moves onto the side (not on the grid).
   */
  sides?: { source?: Side; target?: Side };
  /**
   * Ends that meet the border of the group their node sits in rather than the node (D501,
   * architecture's `{group}`). Only `compass` reads it.
   */
  border?: { source?: boolean; target?: boolean };
}

/** See `LayoutEdge.startMarker`. */
export interface EndMarker {
  length: number;
  width: number;
}

export interface LayoutGroup {
  id: string;
  /** Id of the enclosing group. */
  parent?: string;
  /** Own direction. A group that an edge crosses inherits its parent's instead, as in v12. */
  direction?: Dir;
  /** Room between the group's border and its content. The title sits inside `padding.top`. */
  padding: Box;
  title?: Size;
  /**
   * The layout algorithm the author named for this group (flowchart `id@{ algorithm: … }`), as
   * written. An engine that cannot lay a group out with another algorithm ignores it.
   */
  algorithm?: string;
}

export interface LayoutSpacing {
  /** Between nodes in one rank (v12 `nodeSpacing`). */
  node: number;
  /** Between ranks (v12 `rankSpacing`). */
  rank: number;
  /** Between edges that run side by side. */
  edge: number;
}

/** How edges are routed: S-curves, right angles on tracks of their own, or straight lines. */
export type EdgeRouting = 'curved' | 'stepped' | 'straight';

export interface LayoutGraph {
  direction: Dir;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  groups: LayoutGroup[];
  spacing: LayoutSpacing;
  /** Margin around the whole drawing (v12 `diagramPadding`). Defaults to 0. */
  diagramPadding?: number;
  /** Defaults to `'curved'`. */
  routing?: EdgeRouting;
  /** Room the arrowhead takes at an edge's head; labels sit midway along the visible line. */
  headRoom?: number;
  /**
   * Opt-in width budget (R-LAYOUT-5). A drawing wider than this is laid out tighter, and an
   * LR/RL drawing is turned to TB when the budget is under 640 and that is narrower.
   */
  availableWidth?: number;
  /**
   * Spacing for an LR/RL drawing that `availableWidth` turns to TB, when it differs from
   * `spacing`: with units that are not square (character cells) node and rank spacing swap axes,
   * so they convert differently. Defaults to `spacing`.
   */
  turnedSpacing?: LayoutSpacing;
  /**
   * The engine's length constants, from the diagram's unit profile (D77). Defaults to the px
   * values, so a graph without them lays out as before.
   */
  metrics?: LayoutMetrics;
  /**
   * Grid quantum (D77, D140): node boxes, ports and tracks land on whole multiples of it, and
   * each edge end gets its own cell. Only 1 (character cells) is supported; other values throw a
   * RangeError. With it set, every edge is routed at right angles (`stepped`) whatever `routing`
   * says, and `diagramPadding` is rounded up to whole cells.
   *
   * With it set, the model is in cells: a route point `(c, r)` is the cell in column `c`, row
   * `r`; a box of width `w` centred at `x` covers columns `x − w/2 + ½` to `x + w/2 − ½`. Each
   * edge end is the cell just outside its side, off the corners, and no two ends share a cell
   * once the sides have grown (D140, the model reports grown sizes).
   */
  grid?: number;
  /**
   * Nodes the author asked to share a row or a column, in order (D501, architecture's
   * `align row|column`). Only `compass` reads it.
   */
  align?: readonly { axis: 'row' | 'column'; members: readonly string[] }[];
}

export interface LayoutModelNode {
  /** Centre of the node's box. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutModelEdge {
  points: RoutePoint[];
  /** Centre of the label, when the edge has one. */
  label?: Point;
  /** Centre of the start label, when the edge has one. */
  startLabel?: Point;
  /** Centre of the end label, when the edge has one. */
  endLabel?: Point;
  ports: { source: Side; target: Side };
}

export interface LayoutModelGroup {
  /** Centre of the group's box. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Centre of the title band. */
  title: Point;
}

export interface LayoutModel {
  width: number;
  height: number;
  nodes: Map<string, LayoutModelNode>;
  edges: Map<string, LayoutModelEdge>;
  groups: Map<string, LayoutModelGroup>;
  /** May differ from the input when `availableWidth` turned the drawing. */
  direction: Dir;
}

/** What an engine gets besides the graph. Engine-specific settings come from the `layout` config. */
export interface LayoutContext {
  readonly options?: Readonly<Record<string, unknown>>;
  /**
   * The render's resolved config (`mermaid` always passes it). A layout plugin reads its own
   * fragment's keys here (D153): `ctx.config.<its section>`, defaults already merged in.
   */
  readonly config?: ResolvedConfig;
}

export type LayoutEngine = (graph: LayoutGraph, ctx?: LayoutContext) => LayoutModel;
