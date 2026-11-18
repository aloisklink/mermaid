/**
 * The sequence layout's metrics table (D108, ADR-13 as amended): every length the layout uses,
 * with a `px` value set and a `cell` value set chosen by `units.id`. Core's `UnitProfile` has no
 * sequence section; this table is the only place in `layout/` that holds a length literal.
 *
 * The px values are v12's: the `sequence` config defaults of the v12 schema, and the constants
 * written into v12's `sequenceRenderer.ts` and `svgDraw.js`. The cell values are scaled to
 * character cells by hand (about px / 8 across, px / 16 down) for the text output (D100).
 * A px value set in `sequence` config is converted through `units.pxPerUnit` along its axis and
 * kept at least at the profile's minimum, as the flowchart builder does (`fromPx`).
 */
import type { SequenceDiagramConfig } from '@mermaid-js/core/v13/config/index.js';
import { fromPx, type UnitProfile } from '@mermaid-js/core/v13/layout/index.js';
import type { Theme } from '@mermaid-js/core/v13/theme/index.js';
import type { ParticipantKind } from '../model.js';
import { configNumber } from '@mermaid-js/core/v13/shared/config/readers.js';

export interface XY {
  readonly x: number;
  readonly y: number;
}

/** Lengths that `sequence` config can set (v12 key names). */
export interface ConfigLengths {
  /** Least gap between two participant boxes. */
  readonly actorMargin: number;
  /** Least participant box width; also the least note and message width. */
  readonly width: number;
  /** Least participant box height. */
  readonly height: number;
  /** Room around frames, boxes and notes; each nesting level of a frame adds one. */
  readonly boxMargin: XY;
  /** Room between a frame's border and its label text. */
  readonly boxTextMargin: XY;
  /** Room between a note's border and its text. */
  readonly noteMargin: XY;
  readonly activationWidth: number;
  /** Room on each side of a label in its box or message span. */
  readonly wrapPadding: number;
  /** Least width of a frame's label tab. */
  readonly labelBoxWidth: number;
  /** Least height of a frame's label tab and title. */
  readonly labelBoxHeight: number;
  readonly diagramMarginX: number;
  readonly diagramMarginY: number;
  /** Added below the mirrored participants. */
  readonly bottomMarginAdj: number;
}

/** Lengths v12 wrote into its renderer. */
export interface FixedLengths {
  /** From the top of a message row to the top of its label. */
  readonly messageLead: number;
  /** Label lines counted twice above a message line (v12 adds the first line's height again). */
  readonly messageLeadLines: number;
  /** How far above its line a message reaches in the frame bounds. */
  readonly messageRise: number;
  /** How far a curved self message reaches out from its lifeline. */
  readonly selfLoopReach: number;
  /** How far below its start a curved self message comes back. */
  readonly selfLoopDrop: number;
  /** The same with `rightAngles`. */
  readonly selfLoopSquareDrop: number;
  /** Room a self message takes below its line. */
  readonly selfLoopAdvance: number;
  /**
   * What frames and bounds hold below a self message's rows: v12 counts the advance again
   * (px 30); in cells nothing more, so a frame closes one row below the loop.
   */
  readonly selfLoopReserve: number;
  /** How far above its row a self message reaches in the frame bounds. */
  readonly selfLoopRise: number;
  /** Half a lifeline's stroke: a message starts this far from the lifeline. */
  readonly lifelineHalf: number;
  /** Room an arrowhead takes at a message's end. */
  readonly arrowGap: number;
  /** A central connection's circle moves the line start this far. */
  readonly centralOffset: number;
  /** And this much more for a leftward bidirectional message. */
  readonly centralBidiOffset: number;
  /** From the activating row to the top of the activation bar. */
  readonly activationLead: number;
  /** A shorter activation is drawn this tall instead. */
  readonly activationMin: number;
  /** A short activation starts this far above its end row … */
  readonly activationShortLead: number;
  /** … and ends this far below it. */
  readonly activationShortTail: number;
  /** How far above its end an activation reaches in the frame bounds. */
  readonly activationRise: number;
  /** Room between a creating or destroying message's end and the participant's symbol. */
  readonly createGap: number;
  /** Width of a drawn symbol (stick figure, control, entity, database); 0 draws boxes only. */
  readonly symbolWidth: number;
  /** Where the lifeline starts below the top of a drawn symbol; the box height elsewhere. */
  readonly glyphLifeline: Readonly<Partial<Record<ParticipantKind, number>>>;
  /** A database's lifeline starts this many `boxTextMargin`s below its box. */
  readonly databaseTextMargins: number;
  /** Where a drawn symbol's label row starts below the top of its box; 0 elsewhere. */
  readonly symbolLabelTop: Readonly<Partial<Record<ParticipantKind, number>>>;
  /** The stick figure's label row height (v12 `ACTOR_GLYPH_HEIGHT`); 0 takes the box height. */
  readonly figureLabelHeight: number;
  /**
   * The sequence number badge (drawn only in SVG): its radius (v12's r 6 marker on a line
   * whose CSS width is 2px), the baseline drop of its text, and the text size for numbers of
   * up to 3, up to 5 and more characters.
   */
  readonly numberRadius: number;
  readonly numberBaseline: number;
  readonly numberFontSizes: readonly [number, number, number];
  /** v12 `SEQUENCE_NUMBER_RADIUS`: how far a numbered line moves its start or end clear of it. */
  readonly numberShift: number;
  /** A numbered self message with a head at its start starts this far out. */
  readonly numberSelfShift: number;
  /** A numbered leftward bidirectional line with a central connection moves this much more. */
  readonly numberCentralShift: number;
  /** A numbered leftward line with a circle at its start (`()` before the arrow) moves this much. */
  readonly numberCentralFromShift: number;
  /** A numbered reverse arrow with a central connection ends this much further on. */
  readonly numberCentralReverseShift: number;
  /** A central connection's circle, and how far a numbered message moves it. */
  readonly centralRadius: number;
  readonly centralNumberOffset: number;
  /** Least room above and below a participant label in its box. */
  readonly actorPadY: number;
  /** Room above the drawing for the diagram title. */
  readonly titleBand: number;
  /** A box's members are widened by this many `boxMargin`s before its label is fitted (a count). */
  readonly boxLabelMargins: number;
  /**
   * Room a frame adds to its title and section labels: none in px; in cells a border and a
   * space either side, so a centred label never lands on the frame's side.
   */
  readonly frameLabelSlack: number;
  /**
   * Added to `boxMargin.x` for the room a frame keeps around what it holds: none in px; in
   * cells two columns, so a frame's side stays a space clear of the lifeline beside it.
   */
  readonly frameMarginX: number;
  /**
   * The least width text wraps to, and a wrapped note takes: none beyond `width` in px; in
   * cells v12's 150 px, so a box that fits its label does not wrap text one word per line.
   */
  readonly wrapMinWidth: number;
  /** How far a `collections` stack's back rect sits left and below its front one. */
  readonly stackOffset: number;
  /** The radius of the round symbols (control, entity, boundary) in classic geometry. */
  readonly figureRadius: number;
  /** The band model (`ThemeLengths.glyphBand`): glyph to label (v12 `GLYPH_LABEL_GAP`). */
  readonly glyphLabelGap: number;
  /** The band model: label to lifeline (v12 `LABEL_LIFELINE_GAP`). */
  readonly labelLifelineGap: number;
}

export interface MetricsTable {
  /** Used when config sets none. */
  readonly defaults: ConfigLengths;
  /** The least a config value converts to. */
  readonly min: ConfigLengths;
  readonly fixed: FixedLengths;
}

const xy = (x: number, y: number): XY => ({ x, y });

const PX: MetricsTable = {
  defaults: {
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: xy(10, 10),
    boxTextMargin: xy(5, 5),
    noteMargin: xy(10, 10),
    activationWidth: 10,
    wrapPadding: 10,
    labelBoxWidth: 50,
    labelBoxHeight: 20,
    diagramMarginX: 50,
    diagramMarginY: 10,
    bottomMarginAdj: 1,
  },
  min: {
    actorMargin: 0,
    width: 0,
    height: 0,
    boxMargin: xy(0, 0),
    boxTextMargin: xy(0, 0),
    noteMargin: xy(0, 0),
    // A bar of no width could not show what it stacks on.
    activationWidth: 1,
    wrapPadding: 0,
    labelBoxWidth: 0,
    labelBoxHeight: 0,
    diagramMarginX: 0,
    diagramMarginY: 0,
    bottomMarginAdj: 0,
  },
  fixed: {
    messageLead: 10,
    messageLeadLines: 1,
    messageRise: 10,
    selfLoopReach: 60,
    selfLoopDrop: 20,
    selfLoopSquareDrop: 25,
    selfLoopAdvance: 30,
    selfLoopReserve: 30,
    selfLoopRise: 10,
    lifelineHalf: 1,
    arrowGap: 3,
    centralOffset: 4,
    centralBidiOffset: 6,
    activationLead: 2,
    activationMin: 18,
    activationShortLead: 6,
    activationShortTail: 12,
    activationRise: 10,
    createGap: 3,
    symbolWidth: 36,
    glyphLifeline: { actor: 80, boundary: 80, control: 75, entity: 75 },
    databaseTextMargins: 2,
    // v12 `svgDraw.js` label rows: below the stack, the cylinder, the figure or the glyph.
    // A `collections` label is centred in its front rect, `stackOffset` down.
    symbolLabelTop: {
      database: 35,
      actor: 35,
      control: 34,
      entity: 36,
      boundary: 36,
    },
    figureLabelHeight: 65,
    numberRadius: 12,
    numberBaseline: 4,
    numberFontSizes: [12, 9, 7],
    numberShift: 6,
    numberSelfShift: 10,
    numberCentralShift: 5,
    numberCentralFromShift: 7.5,
    numberCentralReverseShift: 15,
    centralRadius: 5,
    centralNumberOffset: 16.5,
    actorPadY: 0,
    titleBand: 40,
    boxLabelMargins: 8,
    frameLabelSlack: 0,
    frameMarginX: 0,
    wrapMinWidth: 0,
    stackOffset: 6,
    figureRadius: 22,
    glyphLabelGap: 6,
    labelLifelineGap: 6,
  },
};

// A text-form box is its label plus a border and a space on each side: `wrapPadding` 2 across,
// `actorPadY` 1 down. Symbols are drawn as boxes in text, so they need no extra room.
const CELL: MetricsTable = {
  defaults: {
    actorMargin: 6,
    // A box fits its label (mermaid-ascii's look); v12's 150 px would be 19 cells.
    width: 5,
    height: 3,
    boxMargin: xy(1, 1),
    boxTextMargin: xy(1, 0),
    noteMargin: xy(2, 1),
    activationWidth: 2,
    wrapPadding: 2,
    labelBoxWidth: 6,
    labelBoxHeight: 1,
    diagramMarginX: 0,
    diagramMarginY: 0,
    bottomMarginAdj: 0,
  },
  min: {
    actorMargin: 2,
    width: 5,
    height: 3,
    boxMargin: xy(1, 1),
    boxTextMargin: xy(1, 0),
    noteMargin: xy(2, 1),
    activationWidth: 2,
    wrapPadding: 2,
    labelBoxWidth: 4,
    labelBoxHeight: 1,
    diagramMarginX: 0,
    diagramMarginY: 0,
    bottomMarginAdj: 0,
  },
  fixed: {
    messageLead: 1,
    messageLeadLines: 0,
    messageRise: 1,
    selfLoopReach: 3,
    selfLoopDrop: 1,
    selfLoopSquareDrop: 1,
    selfLoopAdvance: 2,
    selfLoopReserve: 0,
    selfLoopRise: 1,
    lifelineHalf: 1,
    arrowGap: 0,
    centralOffset: 1,
    centralBidiOffset: 1,
    activationLead: 0,
    activationMin: 1,
    activationShortLead: 0,
    activationShortTail: 1,
    activationRise: 1,
    createGap: 0,
    symbolWidth: 0,
    glyphLifeline: {},
    databaseTextMargins: 0,
    symbolLabelTop: {},
    figureLabelHeight: 0,
    numberRadius: 0,
    numberBaseline: 0,
    numberFontSizes: [1, 1, 1],
    numberShift: 0,
    numberSelfShift: 0,
    numberCentralShift: 0,
    numberCentralFromShift: 0,
    numberCentralReverseShift: 0,
    centralRadius: 0,
    centralNumberOffset: 0,
    actorPadY: 1,
    titleBand: 2,
    boxLabelMargins: 2,
    frameLabelSlack: 4,
    frameMarginX: 2,
    wrapMinWidth: 19,
    stackOffset: 0,
    figureRadius: 0,
    glyphLabelGap: 0,
    labelLifelineGap: 0,
  },
};

/**
 * Lengths the theme sets (D152, #194): v12 `look: neo` geometry in the redux themes, v12
 * classic in the classic themes, read from geometry theme variables, never from a theme name.
 * `glyphBand` above 0 turns on v12's band model (`actorBands.ts`): every row is as tall as its
 * tallest glyph-gap-label-gap stack (`glyphLabelGap`, `labelLifelineGap`), every lifeline starts
 * at the row's bottom, the symbols stand on the band, scaled to it, and a `collections` stack is
 * `stackOffset` shorter.
 */
export interface ThemeLengths {
  /** `actorGlyphBand`: height of the band a symbol stands in; 0 keeps v12 classic symbols. */
  readonly glyphBand: number;
  /** `messageEndGap`: a message stops this far short of its target, past the arrowhead room. */
  readonly messageEndGap: number;
  /** `labelBoxExtraHeight`: added to a fragment's label tab. */
  readonly labelBoxExtra: number;
  /** `actorFooterPadding`: added below a drawing with participants. */
  readonly footerPadding: number;
}

/** The theme variable behind each themed length. */
const THEME_VARIABLES = {
  glyphBand: 'actorGlyphBand',
  messageEndGap: 'messageEndGap',
  labelBoxExtra: 'labelBoxExtraHeight',
  footerPadding: 'actorFooterPadding',
} as const;

// v12 classic: no band, no extras. A px layout given no theme draws this, and so does every
// cell layout: text draws every symbol as a box, so it has no glyph band and no neo extras.
const CLASSIC: ThemeLengths = {
  glyphBand: 0,
  messageEndGap: 0,
  labelBoxExtra: 0,
  footerPadding: 0,
};

/** The themed lengths for a profile: px from the theme's geometry variables (D152). */
export function themeLengths(
  units: UnitProfile,
  theme: Pick<Theme, 'number'> | undefined
): ThemeLengths {
  if (units.id === 'cell' || !theme) return CLASSIC;
  const out: Record<string, number> = { ...CLASSIC };
  for (const [key, name] of Object.entries(THEME_VARIABLES)) {
    const v = theme.number(name);
    out[key] = Number.isFinite(v) && v > 0 ? Math.min(v, MAX_CONFIG) : 0;
  }
  return out as unknown as ThemeLengths;
}

/** The table for a unit profile. */
export function metricsTable(units: UnitProfile): MetricsTable {
  return units.id === 'cell' ? CELL : PX;
}

/** The sequence layout's lengths for one render, in the profile's units. */
export interface SequenceMetrics extends ConfigLengths, FixedLengths, ThemeLengths {
  readonly cells: boolean;
  /** What wrapped text fits: `width`, and at least `wrapMinWidth`. */
  readonly wrapWidth: number;
  /** Half a length; whole cells round down, so columns stay on the grid. */
  half(v: number): number;
}

// Config numbers may arrive as strings from front matter, as v12 accepted them.
const MAX_CONFIG = 1e4;

type Axis = 'x' | 'y';
const SINGLE: Readonly<Record<string, Axis>> = {
  actorMargin: 'x',
  width: 'x',
  height: 'y',
  activationWidth: 'x',
  wrapPadding: 'x',
  labelBoxWidth: 'x',
  labelBoxHeight: 'y',
  diagramMarginX: 'x',
  diagramMarginY: 'y',
  bottomMarginAdj: 'y',
};
const BOTH = ['boxMargin', 'boxTextMargin', 'noteMargin'] as const;

/**
 * Resolves the metrics for a profile, the `sequence` config section and the theme's geometry
 * variables (v12 classic without a theme).
 */
export function sequenceMetrics(
  units: UnitProfile,
  config: Readonly<SequenceDiagramConfig> | undefined,
  theme?: Pick<Theme, 'number'>
): SequenceMetrics {
  const table = metricsTable(units);
  const cfg = (config ?? {}) as Readonly<Record<string, unknown>>;
  const out: Record<string, unknown> = { ...table.fixed, ...themeLengths(units, theme) };
  const length = (key: string, axis: Axis, fallback: number, min: number): number => {
    const px = configNumber(cfg[key], 0, MAX_CONFIG, true);
    return px === undefined ? fallback : fromPx(units, px, axis, min);
  };
  for (const [key, axis] of Object.entries(SINGLE)) {
    const k = key as keyof ConfigLengths;
    out[key] = length(key, axis, table.defaults[k] as number, table.min[k] as number);
  }
  for (const key of BOTH) {
    out[key] = xy(
      length(key, 'x', table.defaults[key].x, table.min[key].x),
      length(key, 'y', table.defaults[key].y, table.min[key].y)
    );
  }
  const cells = units.id === 'cell';
  out.cells = cells;
  out.wrapWidth = Math.max(out.width as number, table.fixed.wrapMinWidth);
  out.half = cells ? (v: number) => Math.floor(v / 2) : (v: number) => v / 2;
  return out as unknown as SequenceMetrics;
}

/** CSS font weights a config weight keyword stands for. */
export const FONT_WEIGHT = { normal: 400, bold: 700 } as const;
