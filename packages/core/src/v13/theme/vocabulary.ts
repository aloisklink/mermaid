/**
 * Core's theme variable inventory (DESIGN §8.3, O-1): the shared vocabulary, with each
 * variable's private alias, its kind and who reads it. A row is here when core reads it, two or
 * more diagram types read it, or it is a shared input (D332) or a v12 compatibility row (D337).
 * Names are v12's where v12 has one, so the public CSS variable is `--mermaid-<name>`
 * (R-THEME-2). A variable one diagram type reads is that package's own, in its
 * `src/theme/vocabulary.ts` and its plugin's `theme` table (D331, DESIGN §12.1), and core never
 * names it. A variable no ported diagram reads is accepted and ignored (R-CONF-5).
 */

/**
 * How a variable's value is checked and written. A `padding` is a px length or a multiple of
 * the diagram's own `padding` config (`padding`, `2 * padding`), resolved at render time
 * because the classic themes follow `flowchart.padding` (D152). A `flag` is `true` or `false`,
 * read literally at render time like geometry, so it has no CSS variable (D182). An `opacity` is
 * a number from 0 to 1, read with `Theme.number` like geometry, so it has no CSS variable either
 * (D221). A `palette` is a diagram table's list of colours, set as palettes are (an array or a
 * comma-separated string) and read with `Theme.palette` as literal colours, so it has no CSS
 * variable either; its rule names the shared palette it reads (`PALETTE_VARIABLES`, D545).
 */
export type ThemeVarKind =
  | 'color'
  | 'length'
  | 'font'
  | 'weight'
  | 'filter'
  | 'padding'
  | 'flag'
  | 'opacity'
  | 'palette';

/** What the theme reads at render time: a variable's alias and kind. */
export type ThemeVarEntry = Pick<ThemeVarDef, 'alias' | 'kind'>;

export interface ThemeVarDef {
  /** The short private alias written on the root, without the leading `--_`. */
  readonly alias: string;
  readonly kind: ThemeVarKind;
  /**
   * The diagram types (or `core`) that read it; empty for a v12 variable no ported diagram
   * reads yet. `tools/gen-config/src/theme-used-by.spec.ts` checks the diagram types against
   * their sources.
   */
  readonly usedBy: readonly string[];
}

/**
 * The base variables (R-THEME-5): a theme that sets only these renders fully, because every
 * other colour is derived from them.
 */
export const BASE_VARIABLES = [
  'primaryColor',
  'secondaryColor',
  'tertiaryColor',
  'background',
  'primaryTextColor',
  'lineColor',
  'fontFamily',
  'fontSize',
] as const;

export type BaseVariable = (typeof BASE_VARIABLES)[number];

/**
 * Arrowhead geometry (D152): sizes and gaps of the point, circle and cross arrowheads, read
 * as numbers at render time (`Theme.number`), so overriding their CSS variables has no effect.
 * Redux themes carry v12 `look: neo` values, classic themes v12 classic values.
 */
export const ARROWHEAD_VARIABLES = [
  'arrowheadGap',
  'arrowheadLength',
  'arrowheadWidth',
  'circleArrowheadSize',
  'circleArrowheadGap',
  'crossArrowheadSize',
  'crossArrowheadGap',
  'crossArrowheadStrokeWidth',
] as const;

export type ArrowheadVariable = (typeof ARROWHEAD_VARIABLES)[number];

/**
 * Name lists joined into one. Called `@__PURE__` with no spread, so a bundle drops a list that
 * nothing reads at run time (only types and tools read `TOKEN_VARIABLES`; core's size budget,
 * R-PERF-8). An array spread would keep it, as bundlers cannot prove it has no side effects.
 */
const joined = <L extends readonly (readonly string[])[]>(
  ...lists: L
): readonly L[number][number][] => lists.flat();

/** Shape tokens (R-THEME-11): sizes every diagram type reads instead of hard-coding them. */
export const TOKEN_VARIABLES = /* @__PURE__ */ joined(
  [
    'strokeWidth',
    'clusterStrokeWidth',
    'radius',
    'fontWeight',
    'spacing1',
    'spacing2',
    'spacing3',
  ] as const,
  ARROWHEAD_VARIABLES,
  [
    // Node padding (D151, D152): v12 neo values in the redux family, v12 classic in the others.
    // Flowchart's shapes, shared with mindmap, block, C4 and agentflow (#552).
    'nodePaddingX',
    'nodePaddingY',
    'stadiumPaddingX',
    'stadiumPaddingY',
    'hexagonPaddingX',
    'hexagonPaddingY',
    'hexagonSlant',
    'doubleCircleGap',
    'doubleCirclePadding',
    'circlePadding',
    'circleMinDiameter',
    // Shapes with their own v12 padding (#89), totals added to the label box.
    'subroutinePaddingX',
    'subroutinePaddingY',
    'cylinderPaddingX',
    'cylinderPaddingY',
    'leanPaddingX',
    'leanPaddingY',
    'oddPaddingX',
    'oddPaddingY',
    // The neo gradient (D182): outlines that `Theme.outline()` paints take the gradient.
    'useGradient',
  ] as const
);

export type TokenVariable = (typeof TOKEN_VARIABLES)[number];

/**
 * Palettes (D151, D152, D258, D267): lists of colours a theme carries as data. `themeVariables`
 * replaces a whole list (an array of colours, or a comma-separated string), and v12's numbered
 * names (`cScale0`–`cScale11`, `cScaleInv<n>`, `cScaleLabel<n>`, `git0`–`git7`, `gitInv<n>`,
 * `gitBranchLabel<n>`) replace one entry of the palette they name. Palettes are read as literal
 * colours, not CSS variables.
 */
export const PALETTE_VARIABLES = [
  'borderColorArray',
  'bkgColorArray',
  'cScale',
  'cScaleInv',
  'cScaleLabel',
  // Shared inputs that name no diagram (D332, D381): a theme's series colours and tints,
  // which charts and slotted diagrams read by slot (`seriesColorArray3`; the layout is
  // `series` in specs/palettes.ts; an entry a theme leaves out is `BASE_SERIES`, derived from
  // the base colours), and a ten-colour chart palette (v12's `plotColorPalette` colours; a
  // theme that leaves it out reads `BASE_PLOT`, D381, D545).
  'seriesColorArray',
  'plotColorArray',
  'git',
  'gitInv',
  'gitBranchLabel',
] as const;

/**
 * A rule's read of one palette entry: any palette's name and a slot number with no leading zero
 * (`bkgColorArray2`, `seriesColorArray19`, D332). Group 1 is the palette, group 2 the slot.
 */
export const PALETTE_SLOT = new RegExp(`^(${PALETTE_VARIABLES.join('|')})(0|[1-9]\\d?)$`);

/** The palettes with v12's numbered names, `<name>0` up to `PALETTE_LIMITS[name] - 1`. */
export const NUMBERED_PALETTES = [
  'cScale',
  'cScaleInv',
  'cScaleLabel',
  'git',
  'gitInv',
  'gitBranchLabel',
] as const;

export type PaletteVariable = (typeof PALETTE_VARIABLES)[number];
export type NumberedPalette = (typeof NUMBERED_PALETTES)[number];

/**
 * How many numbered names `cScale`, `cScaleInv` and `cScaleLabel` have (v12 `THEME_COLOR_LIMIT`,
 * D258).
 */
export const PALETTE_LIMIT = 12;

/** How many numbered names the git palettes have (v12 `git0`–`git7`, D267). */
export const GIT_PALETTE_LIMIT = 8;

/** How many numbered names each of `NUMBERED_PALETTES` has. */
export const PALETTE_LIMITS: Readonly<Record<NumberedPalette, number>> = {
  cScale: PALETTE_LIMIT,
  cScaleInv: PALETTE_LIMIT,
  cScaleLabel: PALETTE_LIMIT,
  git: GIT_PALETTE_LIMIT,
  gitInv: GIT_PALETTE_LIMIT,
  gitBranchLabel: GIT_PALETTE_LIMIT,
};

// Pure, so a bundle that never reads `THEME_VARIABLES` drops it with its `usedBy` lists: the
// runtime reads the generated alias and kind table (`generated/variables.ts`) instead.
/* @__NO_SIDE_EFFECTS__ */
const def = (alias: string, kind: ThemeVarKind, usedBy: readonly string[]): ThemeVarDef => ({
  alias,
  kind,
  usedBy,
});

/**
 * Who reads both base text variables (`fontFamily`, `fontSize`): a new type that reads both
 * appends here. A type that reads only `fontFamily` (pie, packet, cynefin, info, sankey, treemap,
 * wardley, xychart, venn) is listed on that row.
 */
const TEXT_USERS = [
  'core',
  'flowchart',
  'sequence',
  'class',
  'state',
  'er',
  'journey',
  'timeline',
  'quadrant',
  'mindmap',
  'gitgraph',
  'gantt',
  'kanban',
  'radar',
];

/**
 * The core inventory. Order is the order of the generated table. Tools and specs read it (with
 * `usedBy`); the theme reads `THEME_VARIABLE_TABLE`, which `pnpm gen:theme` writes from it.
 * Built in a pure call: spreads once made the object literal look side-effecting, so the CDN
 * core kept the whole table with its `usedBy` lists (R-PERF-8).
 */
export const THEME_VARIABLES: Readonly<Record<string, ThemeVarDef>> = /* @__PURE__ */ (() => ({
  // base
  primaryColor: def('p', 'color', ['core', 'quadrant', 'gitgraph', 'gantt', 'venn']),
  secondaryColor: def('s', 'color', ['core']),
  tertiaryColor: def('t', 'color', ['core', 'gantt']),
  background: def('bg', 'color', [
    'core',
    'state',
    'packet',
    'kanban',
    'wardley',
    'xychart',
    'venn',
  ]),
  primaryTextColor: def('pt', 'color', [
    'core',
    'class',
    'quadrant',
    'packet',
    'cynefin',
    'wardley',
    'xychart',
  ]),
  lineColor: def('l', 'color', [
    'flowchart',
    'class',
    'state',
    'er',
    'gitgraph',
    'radar',
    'cynefin',
    'wardley',
  ]),
  // Pie, packet, cynefin, info, sankey, treemap, wardley, xychart and venn draw in the font family
  // but size their text by their own variables or constants (sankey: 14 px; wardley: its config;
  // xychart: its `xyChart` config).
  fontFamily: def('ff', 'font', [
    ...TEXT_USERS,
    'pie',
    'packet',
    'cynefin',
    'info',
    'sankey',
    'treemap',
    'wardley',
    'xychart',
    'venn',
  ]),
  fontSize: def('fs', 'length', TEXT_USERS),
  // derived
  primaryBorderColor: def('pb', 'color', ['core', 'quadrant', 'gantt']),
  secondaryBorderColor: def('sb', 'color', ['core']),
  tertiaryBorderColor: def('tb', 'color', ['core']),
  secondaryTextColor: def('st', 'color', ['core']),
  tertiaryTextColor: def('tt', 'color', ['core', 'venn']),
  textColor: def('tx', 'color', [
    'core',
    'flowchart',
    'sequence',
    'class',
    'state',
    'er',
    'journey',
    'timeline',
    'quadrant',
    'gitgraph',
    'gantt',
    'kanban',
    'cynefin',
    'info',
    'radar',
    'sankey',
    'venn',
  ]),
  mainBkg: def('mb', 'color', [
    'flowchart',
    'sequence',
    'class',
    'state',
    'er',
    'timeline',
    'mindmap',
    'gitgraph',
    'sankey',
    'wardley',
  ]),
  nodeBorder: def('nb', 'color', [
    'flowchart',
    'sequence',
    'class',
    'state',
    'er',
    'timeline',
    'mindmap',
    'gitgraph',
    'kanban',
  ]),
  // Shared: three diagram types and core's `Theme.ink()` read it (D334).
  nodeTextColor: def('nt', 'color', ['core', 'flowchart', 'state', 'er']),
  clusterBkg: def('cb', 'color', ['flowchart', 'class', 'er']),
  clusterBorder: def('cs', 'color', ['flowchart', 'class', 'er']),
  titleColor: def('tc', 'color', ['flowchart', 'class', 'state', 'er', 'gantt', 'treemap', 'venn']),
  edgeLabelBackground: def('el', 'color', ['flowchart', 'state']),
  arrowheadColor: def('ah', 'color', ['flowchart', 'state']),
  defaultLinkColor: def('dl', 'color', []),
  border1: def('b1', 'color', []),
  border2: def('b2', 'color', []),
  noteBkgColor: def('nk', 'color', ['core', 'sequence', 'class', 'state']),
  noteTextColor: def('nx', 'color', ['core', 'sequence', 'class', 'state']),
  noteBorderColor: def('no', 'color', ['core', 'sequence', 'class', 'state']),
  errorBkgColor: def('eb', 'color', ['core']),
  errorTextColor: def('et', 'color', ['core']),

  // tokens
  strokeWidth: def('sw', 'length', [
    'core',
    'flowchart',
    'sequence',
    'class',
    'state',
    'er',
    'timeline',
    'mindmap',
    'gitgraph',
  ]),
  clusterStrokeWidth: def('cw', 'length', ['flowchart', 'class', 'er']),
  radius: def('r', 'length', ['core', 'flowchart', 'state', 'mindmap']),
  fontWeight: def('fw', 'weight', ['core', 'timeline', 'gitgraph']),
  spacing1: def('g1', 'length', ['core']),
  spacing2: def('g2', 'length', ['core']),
  spacing3: def('g3', 'length', ['core']),
  // arrowhead geometry (numbers only)
  arrowheadGap: def('ag', 'length', ['flowchart', 'state']),
  arrowheadLength: def('al', 'length', ['flowchart', 'state']),
  arrowheadWidth: def('aw', 'length', ['flowchart', 'state']),
  circleArrowheadSize: def('ocs', 'length', ['flowchart']),
  circleArrowheadGap: def('ocg', 'length', ['flowchart']),
  crossArrowheadSize: def('xs', 'length', ['flowchart']),
  crossArrowheadGap: def('xg', 'length', ['flowchart']),
  crossArrowheadStrokeWidth: def('xw', 'length', ['flowchart']),
  // Node padding, read as numbers at render time (D152), so their aliases are never written.
  nodePaddingX: def('npx', 'padding', ['flowchart', 'mindmap']),
  nodePaddingY: def('npy', 'padding', ['flowchart', 'mindmap']),
  stadiumPaddingX: def('spx', 'padding', ['flowchart']),
  stadiumPaddingY: def('spy', 'padding', ['flowchart']),
  hexagonPaddingX: def('hpx', 'padding', ['flowchart', 'mindmap']),
  hexagonPaddingY: def('hpy', 'padding', ['flowchart', 'mindmap']),
  hexagonSlant: def('hs', 'length', ['flowchart', 'mindmap']),
  doubleCircleGap: def('dcg', 'length', ['flowchart']),
  doubleCirclePadding: def('dcp', 'padding', ['flowchart']),
  circlePadding: def('cp', 'padding', ['flowchart', 'mindmap']),
  circleMinDiameter: def('cmd', 'length', ['flowchart']),
  subroutinePaddingX: def('srx', 'padding', ['flowchart']),
  subroutinePaddingY: def('sry', 'padding', ['flowchart']),
  cylinderPaddingX: def('cyx', 'padding', ['flowchart']),
  cylinderPaddingY: def('cyy', 'padding', ['flowchart']),
  leanPaddingX: def('lnx', 'padding', ['flowchart']),
  leanPaddingY: def('lny', 'padding', ['flowchart']),
  oddPaddingX: def('odx', 'padding', ['flowchart']),
  oddPaddingY: def('ody', 'padding', ['flowchart']),
  // effects: a CSS `filter` (`none` or `drop-shadow(…)`, checked by `checkFilter`). A theme
  // that sets no value has no shadow.
  dropShadow: def('ds', 'filter', [
    'flowchart',
    'sequence',
    'class',
    'state',
    'er',
    'timeline',
    'mindmap',
    'gitgraph',
  ]),
  // Shared inputs that name no diagram (D332), read with `inline()`: the ink of a diagram's own
  // titles and legends on the page, and the ink of labels on the series colours.
  headingTextColor: def('hdt', 'color', ['pie']),
  seriesTextColor: def('sxt', 'color', ['pie']),
  // A shared input (D334): v12's `scaleLabelColor`, the label ink of `cScaleLabel`, which read
  // a sequence variable before.
  scaleLabelColor: def('slc', 'color', ['core', 'sequence']),
  // Shared inputs that name no diagram (D332), which themes of one family write differently and
  // a diagram reads with `inline()`: a quiet fill for a highlighted span and its outline, the
  // ink of links and their labels, text on a `lineColor` fill (as `secondaryTextColor` is text
  // on `secondaryColor`), a softer outline than `nodeBorder` for boxes that frame rather than
  // hold content, and the outline of a frame's label tab. v13 names; v12 has none.
  mutedBkg: def('mbk', 'color', ['sequence']),
  mutedBorder: def('mbd', 'color', ['sequence']),
  linkInkColor: def('lki', 'color', ['sequence']),
  lineTextColor: def('ltx', 'color', ['sequence']),
  softBorder: def('sfb', 'color', ['core']),
  frameBorder: def('frb', 'color', ['sequence']),
  // v12's participant fill and border (sequence), which usecase's role colours fall back to where
  // a theme carries no palette (D474): a row a second type reads is core's (D331).
  actorBkg: def('ab', 'color', ['sequence', 'usecase']),
  actorBorder: def('ar', 'color', ['sequence', 'usecase']),
  // Shared inputs that name no diagram (D332), which themes of one family write differently and
  // a diagram reads with `inline()`: a badge, a small label box on the secondary colour set
  // beside an item (gitGraph's commit ids; any id or count badge), and its text; a callout, a
  // bordered label on the primary colour pinned to an item (gitGraph's tags; flags or markers
  // elsewhere), its text and its border. v13 names; v12 has none.
  badgeBkg: def('bgk', 'color', ['gitgraph']),
  badgeTextColor: def('bgt', 'color', ['gitgraph']),
  calloutBkg: def('clk', 'color', ['gitgraph']),
  calloutTextColor: def('clt', 'color', ['gitgraph']),
  calloutBorder: def('clb', 'color', ['gitgraph']),
  // Shared inputs that name no diagram (D332), which themes of one family write differently and
  // a diagram reads with `inline()`: the fills of a table's odd and even rows, the fill behind a
  // label on a link drawn on a plain surface rather than the edge label chip, and the body of a
  // region nested in another of its kind. v13 names; v12 has none.
  rowBkg: def('rbk', 'color', ['er']),
  rowAltBkg: def('rab', 'color', ['er']),
  linkLabelBkg: def('llb', 'color', ['er']),
  nestedBkg: def('nbk', 'color', ['state']),
  // The neo gradient (D182). `useGradient` is read literally, so its alias is never written;
  // the stops are written on the gradient as `var(--mermaid-<name>,<computed value>)`.
  useGradient: def('ug', 'flag', ['core']),
  gradientStart: def('gs', 'color', ['core']),
  gradientStop: def('ge', 'color', ['core']),
}))();
