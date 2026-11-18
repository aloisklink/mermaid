// Participant symbols, one factory per kind, drawn in the participant's box as v12
// `svgDraw.js` draws them (`drawActorType*`): in classic geometry, or standing on the glyph
// band when the layout gives one (v12 neo's band model, theme `actorGlyphBand`, #194), scaled
// to it. The box, the band and the lengths the layout also uses (stack offset, figure height,
// round radius) come from the layout and its metrics table; the rest are v12's drawing
// constants, named below.
import type { Attrs, Paint, SvgWriter } from '@mermaid-js/core/v13/svg/index.js';
import type { ParticipantKind } from '../model.js';
import type { ParticipantLayout, SequenceMetrics } from '../layout/index.js';
import type { ActorPaint, Paints, Tint } from './paint.js';
import { placePoints } from './arrows.js';

/** What one symbol is drawn from. */
export interface SymbolScene {
  readonly w: SvgWriter;
  readonly p: ParticipantLayout;
  /** Top of the box this symbol is drawn in: the header or the mirrored footer. */
  readonly y: number;
  readonly paint: ActorPaint;
  readonly tint: Tint | undefined;
  readonly shadow: Paints['shadow'];
  /** The px metrics the symbols share with the layout. */
  readonly m: Pick<SequenceMetrics, 'stackOffset' | 'figureRadius' | 'figureLabelHeight'>;
  /** The y of the glyph band's bottom edge for this box, under the band model. */
  readonly glyphBottom?: number;
}

/** v12's figure lines and circles take its `line` / `.actor-man circle` CSS width. */
const FIGURE_STROKE = 2;
/**
 * The stick figure (v12 `ACTOR_GLYPH_*`, `ACTOR_TYPE_WIDTH`), unscaled, down from its classic
 * top; its height (head top -5 to feet 60) is the metrics' `figureLabelHeight`.
 */
const STICK = {
  head: 10,
  headRadius: 15,
  neck: 25,
  hip: 45,
  arms: 33,
  feet: 60,
  halfSpan: 18,
  /** The right leg ends 2 short of the arm span. */
  rightFoot: 16,
} as const;
// Classic centres of the round symbols below the box top.
const CONTROL_CY = 32;
const ENTITY_CY = 31;
const BOUNDARY_CY = 33;
/** The boundary's bar: 2.5 radii left of the centre, to 15 px short of the circle, ticks ±10. */
const BOUNDARY_BAR_RADII = 2.5;
const BOUNDARY_GAP = 15;
const BOUNDARY_TICK = 10;
/** v12's database cylinder is the middle third of its box. */
const CYLINDER_PARTS = 3;
/** v12's cylinder: its ends' ry is rx / (2.5 + w / 50) for a body w wide. */
const CYLINDER_RY = { base: 2.5, per: 50 } as const;
// The control symbol's arrowhead (v12 `-filled-head-control` marker, on a 2px line).
const CONTROL_HEAD = {
  points: [
    [14.4, 5.6],
    [7.2, 10.4],
    [8.8, 5.6],
    [7.2, 0.8],
  ] as const,
  ref: [11, 5.8] as const,
  scale: FIGURE_STROKE,
  angle: (172.5 * Math.PI) / 180,
  /** The marker's 1.2, in its units. */
  strokeWidth: 1.2 * FIGURE_STROKE,
};

const fillOf = (s: SymbolScene): Paint => s.tint?.fill ?? s.paint.fill;
const strokeOf = (s: SymbolScene): Paint => s.tint?.stroke ?? s.paint.stroke;

/** The box kinds' outline paint. */
const boxAttrs = (s: SymbolScene): Attrs => ({
  class: 'actor',
  fill: fillOf(s),
  stroke: strokeOf(s),
  'stroke-width': s.paint.strokeWidth,
});

/** The figure kinds' group paint; lines and circles inherit it. */
const figureAttrs = (s: SymbolScene): Attrs => ({
  fill: fillOf(s),
  stroke: strokeOf(s),
  'stroke-width': FIGURE_STROKE,
  filter: s.shadow,
});

function participant(s: SymbolScene): void {
  const { p, y, w } = s;
  const r = s.paint.radius;
  w.leaf('rect', {
    ...boxAttrs(s),
    x: p.x,
    y,
    width: p.width,
    height: p.height,
    rx: r,
    ry: r,
    filter: s.shadow,
  });
}

function collections(s: SymbolScene): void {
  const { p, y, w } = s;
  w.open('g', { filter: s.shadow });
  // v12 neo draws both rects shorter, so the back one stops at the lifeline.
  const rect = { ...boxAttrs(s), width: p.width, height: p.height - (p.stackInset ?? 0) };
  const off = s.m.stackOffset;
  w.leaf('rect', { ...rect, x: p.x, y });
  w.leaf('rect', { ...rect, x: p.x - off, y: y + off });
  w.close();
}

function queue(s: SymbolScene): void {
  const { p, y, w } = s;
  const h = p.height;
  const ry = h / 2;
  const rx = ry / (CYLINDER_RY.base + h / CYLINDER_RY.per);
  const left = p.x + rx;
  const right = p.x + p.width - rx;
  const body = w
    .path()
    .moveTo(left, y)
    .arcTo(rx, ry, 0, false, false, left, y + h)
    .lineTo(right, y + h)
    .arcTo(rx, ry, 0, false, false, right, y)
    .close()
    .done();
  const cap = w
    .path()
    .moveTo(right, y)
    .arcTo(rx, ry, 0, false, false, right, y + h)
    .done();
  w.open('g', { ...boxAttrs(s), filter: s.shadow });
  w.leaf('path', { d: body });
  w.leaf('path', { d: cap });
  w.close();
}

function database(s: SymbolScene): void {
  const { p, y, w } = s;
  const third = p.width / CYLINDER_PARTS;
  const rx = third / 2;
  // v12 neo: as tall as the band, its bottom on the band's edge; classic: width / 3 from the top.
  // On a band lower than its two ends, the ends flatten to half the band each.
  const h = p.band ? p.band.height : third;
  const ry = Math.min(rx / (CYLINDER_RY.base + third / CYLINDER_RY.per), h / 2);
  const y0 = s.glyphBottom !== undefined ? s.glyphBottom - h - ry : y;
  const x0 = p.x + third;
  const x1 = x0 + third;
  const top = y0 + 2 * ry;
  const d = w
    .path()
    .moveTo(x0, top)
    .arcTo(rx, ry, 0, false, false, x1, top)
    .arcTo(rx, ry, 0, false, false, x0, top)
    .lineTo(x0, y0 + h)
    .arcTo(rx, ry, 0, false, false, x1, y0 + h)
    .lineTo(x1, top)
    .done();
  w.leaf('path', { ...boxAttrs(s), d, filter: s.shadow });
}

function actor(s: SymbolScene): void {
  const { p, y, w } = s;
  const cx = p.x + p.width / 2;
  // v12 neo scales the figure to fill the band, feet on its bottom edge.
  const bottom = s.glyphBottom;
  const k = p.band && bottom !== undefined ? p.band.height / s.m.figureLabelHeight : 1;
  const gy = (o: number): number => (bottom !== undefined ? bottom - (STICK.feet - o) * k : y + o);
  const gx = (o: number): number => cx + o * k;
  // v12 draws the stick figure without a shadow.
  w.open('g', { ...figureAttrs(s), filter: undefined });
  w.leaf('line', { x1: cx, y1: gy(STICK.neck), x2: cx, y2: gy(STICK.hip) });
  w.leaf('line', {
    x1: gx(-STICK.halfSpan),
    y1: gy(STICK.arms),
    x2: gx(STICK.halfSpan),
    y2: gy(STICK.arms),
  });
  w.leaf('line', { x1: gx(-STICK.halfSpan), y1: gy(STICK.feet), x2: cx, y2: gy(STICK.hip) });
  w.leaf('line', { x1: cx, y1: gy(STICK.hip), x2: gx(STICK.rightFoot), y2: gy(STICK.feet) });
  w.leaf('circle', { cx, cy: gy(STICK.head), r: STICK.headRadius * k });
  w.close();
}

/**
 * A round symbol's circle: on the band it fills the band, touching its bottom edge (v12 neo's
 * 22 px circle on a 44 px band), and `k` scales its other parts; else v12 classic.
 */
function round(
  s: SymbolScene,
  classicCy: number
): { cx: number; cy: number; r: number; k: number } {
  const cx = s.p.x + s.p.width / 2;
  const classic = s.m.figureRadius;
  if (!s.p.band || s.glyphBottom === undefined)
    return { cx, cy: s.y + classicCy, r: classic, k: 1 };
  const r = s.p.band.height / 2;
  return { cx, cy: s.glyphBottom - r, r, k: r / classic };
}

function control(s: SymbolScene): void {
  const { w } = s;
  const { cx, cy, r, k } = round(s, CONTROL_CY);
  w.open('g', { ...figureAttrs(s), filter: undefined });
  w.leaf('circle', { cx, cy, r, filter: s.shadow });
  const h = CONTROL_HEAD;
  w.leaf('polygon', {
    // The head shrinks with a smaller circle but never grows past v12's: it rises about 10 px
    // over the circle, which the diagram's top margin holds at v12's size.
    points: placePoints(h.points, h.ref, h.scale * Math.min(k, 1), [cx, cy - r], h.angle),
    'stroke-width': h.strokeWidth,
  });
  w.close();
}

function entity(s: SymbolScene): void {
  const { w } = s;
  const { cx, cy, r } = round(s, ENTITY_CY);
  w.open('g', figureAttrs(s));
  w.leaf('circle', { cx, cy, r });
  w.leaf('line', { x1: cx - r, y1: cy + r, x2: cx + r, y2: cy + r });
  w.close();
}

function boundary(s: SymbolScene): void {
  const { w } = s;
  const { cx, cy, r, k } = round(s, BOUNDARY_CY);
  const bar = cx - BOUNDARY_BAR_RADII * r;
  const tick = BOUNDARY_TICK * k;
  w.open('g', figureAttrs(s));
  w.leaf('line', { x1: bar, y1: cy, x2: cx - BOUNDARY_GAP * k, y2: cy });
  w.leaf('line', { x1: bar, y1: cy - tick, x2: bar, y2: cy + tick });
  w.leaf('circle', { cx, cy, r });
  w.close();
}

const SYMBOLS: Readonly<Record<ParticipantKind, (s: SymbolScene) => void>> = {
  participant,
  collections,
  queue,
  database,
  actor,
  control,
  entity,
  boundary,
};

/** Kinds drawn as a figure above their label (v12 `actor-man`), the rest as a box. */
const FIGURES: ReadonlySet<ParticipantKind> = new Set(['actor', 'control', 'entity', 'boundary']);

/**
 * One participant symbol and its label, as a group classed like v12's (`actor-top` /
 * `actor-bottom`, `actor-man` for figures). The label carries `data-id` only.
 */
export function drawSymbol(scene: SymbolScene, position: 'top' | 'bottom'): void {
  const { p, w } = scene;
  const figure = FIGURES.has(p.kind);
  const bottom = position === 'bottom';
  // The layout gives a band only to the kinds that stand on it.
  const s = p.band
    ? { ...scene, glyphBottom: scene.y + (bottom ? p.band.bottom : p.band.top) }
    : scene;
  w.open('g', {
    class: `${figure ? 'actor-man ' : ''}actor-${position}`,
    'data-id': p.id,
  });
  SYMBOLS[p.kind](s);
  const dx = p.kind === 'collections' ? -s.m.stackOffset : 0;
  const labelY = bottom ? (p.bottomLabelY ?? p.labelY) : p.labelY;
  w.label(p.label, p.x + dx + p.width / 2, s.y + labelY, {
    class: `actor ${figure ? 'actor-man' : 'actor-box'}`,
    'data-id': p.id,
    fill: s.paint.text,
  });
  w.close();
}
