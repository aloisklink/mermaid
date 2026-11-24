// The unit profile (DESIGN §6.3, D77, ADR-13). Layout depends on the injected measurer and an
// injected UnitProfile, never on the backend: every length a graph builder or the layout engine
// uses comes from the profile. The px profile holds today's numbers, so SVG output does not
// change; the cell profile lays out in character cells for the ASCII backend (M2).

import type { LayoutSpacing } from './types.js';

/**
 * The layout engine's length constants. The px values are the `layered` engine's constants;
 * a graph builder passes its profile's set through `LayoutGraph.metrics`.
 */
export interface LayoutMetrics {
  /** Room between two edge ends on one side of a node. */
  readonly portPitch: number;
  /** The least room between two edge ends that keeps their arrowheads apart. */
  readonly minPitch: number;
  /** Room between edge ends spread along one side of a compound (group) node. */
  readonly portSep: number;
  /** Room kept clear between a rank and the nearest track. */
  readonly trackMargin: number;
  /** Room between two tracks when a gap has to grow to hold them. */
  readonly trackPitch: number;
  /** The most room between two tracks when the gap has room to spare. */
  readonly trackSpread: number;
  /** How far the levels of a gap keep from its ranks. */
  readonly levelMargin: number;
  /** Room between two levels. */
  readonly levelPitch: number;
  /** Room a plain curve is taken to keep straight at each end of its gap. */
  readonly levelLead: number;
  /** Closest two curves may pass when one runs far across. */
  readonly levelClear: number;
  /** Closest two curves may pass otherwise. */
  readonly levelTouch: number;
  /** Furthest a node moves to bring one more of its edges into line. */
  readonly snap: number;
  /** Furthest a bend with no node in line moves to bring an edge into line. */
  readonly bendSnap: number;
  /** Room a leaning edge end keeps from the ends of its side's span. */
  readonly leanClear: number;
  /** Crossings within this distance of a shared node are not counted. */
  readonly fan: number;
  /** How far a self-loop reaches out from its node. */
  readonly loop: number;
  /** Room between a self-loop and its label. */
  readonly loopGap: number;
  /** Room between a compound node's side and the label of its self-loop. */
  readonly loopLabel: number;
  /** The part of a side that edge ends keep clear of at each corner when the node sets no span. */
  readonly corner: number;
  /** A drawing that runs across is turned to run down only when the width budget is under this. */
  readonly turnBreakpoint: number;
  /** Room between a node's side and an edge-end label, along the edge (D102). */
  readonly endLabelAlong: number;
  /** Room between an edge's line and an edge-end label beside it (D102). */
  readonly endLabelAcross: number;
}

/** The lengths a diagram's graph builder reads. */
export interface BuilderMetrics {
  /** Room between a node's label and its border, per side. */
  readonly nodePad: { readonly x: number; readonly y: number };
  /** Room between a group's border and its content. */
  readonly groupPad: number;
  /** Top padding of a titled group; the title sits in it. */
  readonly titlePad: number;
  /** Room added around an edge label for the patch it sits on (both sides together). */
  readonly labelPatch: { readonly x: number; readonly y: number };
  /** Room the arrowhead takes at an edge's head (`LayoutGraph.headRoom`). */
  readonly headRoom: number;
  /** Default node label wrap width, used when config sets none. */
  readonly wrapWidth: number;
  /** Edge label wrap width. */
  readonly edgeWrap: number;
  /** Default spacing, used when config sets none. */
  readonly spacing: Readonly<LayoutSpacing>;
  /** The least spacing a config value converts to (`fromPx`). */
  readonly minSpacing: Readonly<LayoutSpacing>;
  /** Default margin around the whole drawing, used when config sets none. */
  readonly diagramPadding: number;
}

export interface UnitProfile {
  /** Part of the determinism key (R-ARCH-6). */
  readonly id: 'px' | 'cell';
  /** px per unit along each axis; converts px config values (px: 1 × 1, cell: 8 × 16). */
  readonly pxPerUnit: { readonly x: number; readonly y: number };
  readonly builder: BuilderMetrics;
  /** Passed to the engine through `LayoutGraph.metrics`. */
  readonly engine: LayoutMetrics;
  /** Grid quantum (`LayoutGraph.grid`): 1 for cells, none for px. */
  readonly grid?: number;
}

/** Cell padding presets (`ascii.padding`). */
export type CellPadding = 'compact' | 'roomy';

const freeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') Object.freeze(v);
  return Object.freeze(o);
};

/** Today's `layered` constants (`layered.ts`, `compound.ts`, `index.ts`). */
const PX_ENGINE: LayoutMetrics = freeze({
  portPitch: 16,
  minPitch: 8,
  portSep: 20,
  trackMargin: 18,
  trackPitch: 10,
  trackSpread: 14,
  levelMargin: 28,
  levelPitch: 12,
  levelLead: 12,
  levelClear: 8,
  levelTouch: 4,
  snap: 12,
  bendSnap: 24,
  leanClear: 40,
  fan: 24,
  loop: 26,
  loopGap: 6,
  loopLabel: 28,
  corner: 12,
  turnBreakpoint: 640,
  endLabelAlong: 4,
  endLabelAcross: 6,
});

/**
 * The px profile: today's numbers. `nodePad` is the default theme's node padding; with this
 * profile the flowchart reads the theme's own per-shape padding (`nodePaddingX`, …, D152).
 * `headRoom` is theme-independent, so the layout does not move with the arrowhead (D154).
 */
export const pxProfile: UnitProfile = freeze({
  id: 'px',
  pxPerUnit: { x: 1, y: 1 },
  builder: freeze({
    nodePad: { x: 16, y: 12 },
    groupPad: 20,
    titlePad: 16,
    labelPatch: { x: 12, y: 4 },
    headRoom: 7,
    wrapWidth: 200,
    edgeWrap: 200,
    spacing: { node: 50, rank: 50, edge: 20 },
    minSpacing: { node: 0, rank: 0, edge: 0 },
    diagramPadding: 8,
  }),
  engine: PX_ENGINE,
});

// The px constants scaled to cells by hand (about px / 8, ties up; research/ascii-snapping.md).
// Port pitch 2 leaves a free cell between edge ends (D140).
const CELL_ENGINE: LayoutMetrics = freeze({
  portPitch: 2,
  minPitch: 1,
  portSep: 2,
  trackMargin: 2,
  trackPitch: 1,
  trackSpread: 2,
  levelMargin: 3,
  levelPitch: 1,
  levelLead: 1,
  levelClear: 1,
  levelTouch: 0.5,
  snap: 2,
  bendSnap: 3,
  leanClear: 5,
  fan: 3,
  loop: 3,
  loopGap: 1,
  loopLabel: 3,
  corner: 1,
  turnBreakpoint: 80,
  // On the grid an end label starts in the row (or column) just off the side, with one blank
  // cell between it and the line.
  endLabelAlong: 0,
  endLabelAcross: 1,
});

const CELL_COMPACT: BuilderMetrics = freeze({
  // A text-form box is label + 2·x + 2 wide and lines + 2·y + 2 high: label + 4 × lines + 2.
  nodePad: { x: 1, y: 0 },
  groupPad: 1,
  // The title sits on the group's top border.
  titlePad: 0,
  labelPatch: { x: 2, y: 0 },
  headRoom: 1,
  wrapWidth: 25,
  edgeWrap: 25,
  spacing: { node: 2, rank: 4, edge: 1 },
  minSpacing: { node: 2, rank: 3, edge: 1 },
  diagramPadding: 0,
});

// mermaid-ascii-like: box padding 1 each way, gaps of 5.
const CELL_ROOMY: BuilderMetrics = freeze({
  ...CELL_COMPACT,
  nodePad: { x: 1, y: 1 },
  spacing: { node: 5, rank: 5, edge: 1 },
});

const CELL_PROFILES: Readonly<Record<CellPadding, UnitProfile>> = {
  compact: freeze({
    id: 'cell',
    pxPerUnit: { x: 8, y: 16 },
    builder: CELL_COMPACT,
    engine: CELL_ENGINE,
    grid: 1,
  }),
  roomy: freeze({
    id: 'cell',
    pxPerUnit: { x: 8, y: 16 },
    builder: CELL_ROOMY,
    engine: CELL_ENGINE,
    grid: 1,
  }),
};

/** The cell profile for the ASCII backend; `compact` unless `ascii.padding` says `roomy`. */
export function cellProfile(padding: CellPadding = 'compact'): UnitProfile {
  return CELL_PROFILES[padding];
}

/**
 * A px config value (`nodeSpacing`, `wrappingWidth`, …) in the profile's units along `axis`,
 * rounded to whole units unless the profile is px, and at least `min`.
 */
export function fromPx(profile: UnitProfile, px: number, axis: 'x' | 'y', min = 0): number {
  const scale = profile.pxPerUnit[axis];
  const v = scale === 1 ? px : Math.round(px / scale);
  return Math.max(min, v);
}
