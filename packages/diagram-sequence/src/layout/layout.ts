/**
 * The sequence custom layout (spec #125 T3, `layoutKind: 'custom'`): `SequenceModel` in,
 * `SequenceLayout` out, without the graph engine. It follows v12's `sequenceRenderer.ts` draw
 * pass with the drawing taken out: every label is measured first, then the columns are placed,
 * then one pass computes the x geometry of messages, notes and fragments and a second moves
 * down the rows. Every length comes from the metrics table (D108).
 *
 * v12 bugs fixed on the way, each small: a participant box grows with a multi-line label; an
 * empty frame spans the columns; a frame reaches down past its last section title and holds its
 * tab, which is as wide as its keyword; the row after a created stick figure starts below the
 * figure; a `deactivate` with nothing open is ignored; a lifeline without a bottom box ends
 * where the bottom boxes would start.
 *
 * In cells (text output, #150) more differs from px than the metrics: a self message's label
 * starts right of its lifeline instead of centred across it (the column gap holds all of it);
 * fragment titles are not wrapped to the fragment's reach (the frame grows to hold them);
 * frames keep `frameMarginX` more room; a message label carries its sequence number (`1. `) and
 * is measured with it; `rightAngles` is not read (text loops are square anyway); a note over
 * two participants fits its text; message and frame labels move clear of box borders; and a
 * box whose members' self messages or notes overran it is laid out again, wider.
 */
import type { ParticipantKind, SequenceBox, SequenceModel } from '../model.js';
import { Bounds } from './bounds.js';
import {
  actorMargins,
  boxSizes,
  shownBoxes,
  measureColumns,
  placeColumns,
  type BoxGeom,
  type BoxGrowth,
  type BoxSizes,
} from './columns.js';
import {
  centerOf,
  envOf,
  placed,
  type Column,
  type Env,
  type SequenceLayoutContext,
} from './env.js';
import { geometryOf } from './geometry.js';
import { lifelineOffset, Rows } from './rows.js';
import type { BoxLayout, ParticipantLayout, PlacedLabel, Rect, SequenceLayout } from './types.js';

/** Lays out a sequence diagram in the context's units. */
export function layoutSequence(model: SequenceModel, ctx: SequenceLayoutContext): SequenceLayout {
  let first = layoutOnce(model, ctx);
  if (first.units !== 'cell') return first;
  // In cells a lifeline is a line of cells that text must not cut: a message label wider than
  // the room between its lifelines widens the gap before its right-hand end, and the diagram
  // is laid out again (two rounds at most, as one widening can move a label placed off a border).
  const gaps = new Map<string, number>();
  for (let round = 0; round < LABEL_ROUNDS; round++) {
    const more = labelRoom(first);
    if (more.size === 0) break;
    for (const [id, d] of more) gaps.set(id, (gaps.get(id) ?? 0) + d);
    first = layoutOnce(model, ctx, undefined, gaps);
  }
  if (first.boxes.length === 0) return first;
  // In cells a box border is a line of cells that text must not cut: a box whose own self
  // messages or notes overran it is laid out again, that much wider.
  const grow = boxGrowth(model, first);
  return grow.size === 0 ? first : layoutOnce(model, ctx, grow, gaps);
}

/** How many times the label room is checked and the columns placed again (cells only). */
const LABEL_ROUNDS = 2;

/**
 * The cells to add after a column so that each message label between two participants fits
 * between their lifelines with a space on each side: the gap just left of the message's
 * right-hand end takes the shortfall (cells only).
 */
function labelRoom(layout: SequenceLayout): Map<string, number> {
  const out = new Map<string, number>();
  const order = layout.participants.map((p) => p.id);
  const at = new Map(layout.participants.map((p) => [p.id, p.lifeline.x]));
  for (const msg of layout.messages) {
    if (!msg.label || msg.from === msg.to) continue;
    const a = at.get(msg.from);
    const b = at.get(msg.to);
    if (a === undefined || b === undefined) continue;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const first = msg.label.x;
    const last = msg.label.x + msg.label.width - 1;
    if (first > lo && last < hi) continue;
    const right = a < b ? msg.to : msg.from;
    const before = order[order.indexOf(right) - 1];
    // The cells strictly between the lifelines hold the label, a space on each side and, as a
    // centred label sits a cell off the middle of an arrow that stops short, one more each side.
    const short = msg.label.width + 2 * 2 - (hi - lo - 1);
    if (before !== undefined && short > 0) out.set(before, Math.max(out.get(before) ?? 0, short));
  }
  return out;
}

/** How far each box's members' self messages and notes reach past its sides, and a space. */
function boxGrowth(model: SequenceModel, layout: SequenceLayout): Map<SequenceBox, BoxGrowth> {
  const out = new Map<SequenceBox, BoxGrowth>();
  for (const box of layout.boxes) {
    const members = new Set(box.participants);
    const right = box.x + box.width - 1;
    let lo = box.x;
    let hi = right;
    for (const msg of layout.messages) {
      if (!msg.self || !members.has(msg.from)) continue;
      const label = msg.label ? msg.label.x + msg.label.width - 1 : 0;
      hi = Math.max(hi, msg.self.right + 2, label + 2);
    }
    for (const n of layout.notes) {
      if (!n.participants.every((id) => members.has(id))) continue;
      lo = Math.min(lo, n.x - 2);
      hi = Math.max(hi, n.x + n.width + 1);
    }
    const owner = model.boxes.find((b) => b.ast === box.ast);
    if (owner && (lo < box.x || hi > right))
      out.set(owner, { left: box.x - lo, right: hi - right });
  }
  return out;
}

function layoutOnce(
  model: SequenceModel,
  ctx: SequenceLayoutContext,
  grow?: ReadonlyMap<SequenceBox, BoxGrowth>,
  gaps?: ReadonlyMap<string, number>
): SequenceLayout {
  const base = envOf(ctx, model);
  const env: Env = { ...base, columns: measureColumns(model, base) };
  const { m } = env;
  actorMargins(model, env);
  for (const [id, d] of gaps ?? []) {
    const c = env.columns.get(id);
    if (c) c.margin += d;
  }
  const sizes = boxSizes(model, env);

  // Frames keep `boxMargin` around what they hold, and in cells a little more (metrics.ts).
  const b = new Bounds({ x: m.boxMargin.x + m.frameMarginX, y: m.boxMargin.y });
  const shown = shownBoxes(model, env);
  if (shown.length > 0) {
    b.bump(m.boxMargin.y);
    if (shown.some((box) => box.label !== '')) b.bump(sizes.labelHeight);
  }
  const boxes = placeColumns(model, env, sizes, b, grow);
  const rowHeight = [...env.columns.values()][0]?.height ?? m.height;
  b.bump(rowHeight);

  // The columns of the box borders, which labels keep clear of in cells.
  const pad = 2 * m.boxMargin.x;
  const borders = m.cells ? boxes.flatMap((g) => [g.x - pad, g.x + g.width + pad - 1]) : [];
  const rows = new Rows(env, geometryOf(model.statements, env), b, borders);
  rows.statements(model.statements);

  // The bottom row: mirrored boxes, or where they would be; below the tail of any activation.
  const footer = Math.max(b.y + 2 * m.boxMargin.y, ...rows.activations.map((a) => a.y + a.height));
  if (env.mirror) {
    b.bump(footer - b.y);
    b.bump(rowHeight + m.boxMargin.y);
  }
  const participants = participantLayouts(env, footer);
  const boxLayouts = boxLayoutsOf(env, boxes, sizes, b);
  if (shown.length > 0) b.bump(m.boxMargin.y);

  const layout = {
    units: ctx.units.id,
    participants,
    boxes: boxLayouts,
    messages: rows.messages,
    activations: rows.activations,
    notes: rows.notes,
    fragments: rows.fragments,
    rects: rows.rects,
  };
  const title = titleOf(env, model.title, b);
  const withTitle = title ? { ...layout, title: title.label } : layout;
  return { ...withTitle, bounds: enclose(viewBox(env, b, title?.band ?? 0), withTitle) };
}

function participantLayouts(env: Env, footer: number): ParticipantLayout[] {
  const { m } = env;
  const out: ParticipantLayout[] = [];
  for (const c of env.columns.values()) {
    if (!c.visible) continue;
    const destroyed = c.stopy !== undefined;
    const stopy = c.stopy ?? footer;
    let y2 = footer;
    if (env.mirror) y2 = stopy;
    else if (destroyed) y2 = stopy + m.half(c.height);
    out.push({
      id: c.p.id,
      ast: c.p.ast,
      kind: c.p.kind,
      label: c.label,
      x: c.x,
      width: c.width,
      height: c.height,
      ...labels(env, c),
      top: c.top,
      ...(env.mirror ? { bottom: stopy } : {}),
      lifeline: { x: centerOf(env, c), y1: c.top + lifelineOffset(env, c), y2 },
      created: c.p.createdBy !== undefined,
      destroyed,
    });
  }
  return out;
}

/**
 * Kinds v12's band model stands on the glyph band; the rest fill the row as boxes. The one
 * list: the renderer draws on the band of whichever participant has one.
 */
const GLYPHS: ReadonlySet<ParticipantKind> = new Set<ParticipantKind>([
  'actor',
  'boundary',
  'control',
  'entity',
  'database',
]);

/**
 * From the top of a participant's box to the centre of its label (v12 `svgDraw.js` rows), and
 * the glyph band under the band model (v12 `actorBands.ts` `headerBands`, `footerBands`).
 */
function labels(
  env: Env,
  c: Column
): Pick<ParticipantLayout, 'labelY' | 'bottomLabelY' | 'band' | 'stackInset'> {
  const { m } = env;
  const neo = m.glyphBand > 0;
  // v12 draws a `collections` label in its front rect, `stackOffset` down; under the band model
  // the rect is that much shorter.
  if (c.p.kind === 'collections') {
    const inset = neo ? m.stackOffset : 0;
    return {
      labelY: m.stackOffset + m.half(c.height - inset),
      ...(neo ? { stackInset: inset } : {}),
    };
  }
  if (!neo) {
    const row = c.p.kind === 'actor' && m.figureLabelHeight > 0 ? m.figureLabelHeight : c.height;
    return { labelY: (m.symbolLabelTop[c.p.kind] ?? 0) + m.half(row) };
  }
  if (!GLYPHS.has(c.p.kind)) return { labelY: m.half(c.height) };
  const text = c.label.height;
  const band = {
    height: m.glyphBand,
    top: c.height - m.labelLifelineGap - text - m.glyphLabelGap,
    bottom: m.labelLifelineGap + m.glyphBand,
  };
  return {
    labelY: c.height - m.labelLifelineGap - m.half(text),
    bottomLabelY: band.bottom + m.glyphLabelGap + m.half(text),
    band,
  };
}

/** v12 draws a box from its first member's margin to its last, down to the last row. */
function boxLayoutsOf(env: Env, boxes: BoxGeom[], sizes: BoxSizes, b: Bounds): BoxLayout[] {
  const { m } = env;
  return boxes.map(({ box, x, width }) => {
    const height = b.y;
    b.insert(x, 0, x + width, height);
    const pad = 2 * m.boxMargin.x;
    const y = -m.half(m.boxMargin.y);
    const text = sizes.labels.get(box);
    const labelY = m.boxTextMargin.y + m.half(sizes.labelHeight);
    return {
      ast: box.ast,
      ...(box.color !== undefined ? { color: box.color } : {}),
      participants: box.participants,
      x: x - pad,
      y,
      width: width + 2 * pad,
      height: height + m.boxMargin.y - y,
      ...(text && text.lines.length > 0
        ? { label: placed(text, x + m.half(width - text.width), labelY - m.half(text.height)) }
        : {}),
    };
  });
}

/** The diagram title, centred in a band above the drawing. */
function titleOf(
  env: Env,
  title: string | undefined,
  b: Bounds
): { label: PlacedLabel; band: number } | undefined {
  if (title === undefined || title === '') return undefined;
  const { m } = env;
  const text = env.measure(title, env.fonts.title, Infinity);
  const sx = b.data.startx ?? 0;
  const ex = b.data.stopx ?? 0;
  const top = (b.data.starty ?? 0) - m.diagramMarginY - m.titleBand;
  const label = placed(
    text,
    sx + m.half(ex - sx - text.width),
    top + m.half(m.titleBand - text.height)
  );
  return { label, band: m.titleBand };
}

/** v12's viewBox. */
function viewBox(env: Env, b: Bounds, band: number): Rect {
  const { m } = env;
  const sx = b.data.startx ?? 0;
  const ex = b.data.stopx ?? 0;
  const sy = b.data.starty ?? 0;
  const ey = b.data.stopy ?? 0;
  let height = ey - sy + 2 * m.diagramMarginY + band;
  if (env.mirror) height += m.bottomMarginAdj - m.boxMargin.y;
  // v12 neo leaves 30 px more below a drawing with participants.
  if (env.order.length > 0) height += m.footerPadding;
  return {
    x: sx - m.diagramMarginX,
    y: sy - m.diagramMarginY - band,
    width: ex - sx + 2 * m.diagramMarginX,
    height,
  };
}

/** `box` grown to hold every rectangle of the layout. */
function enclose(box: Rect, l: Omit<SequenceLayout, 'bounds'>): Rect {
  let x1 = box.x;
  let y1 = box.y;
  let x2 = box.x + box.width;
  let y2 = box.y + box.height;
  const add = (r: Rect | undefined): void => {
    if (!r) return;
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  };
  for (const p of l.participants) {
    add({ x: p.x, y: p.top, width: p.width, height: p.lifeline.y1 - p.top });
    // A symbol's label can hang below its box (a multi-line stick figure label).
    const label = (top: number, at = p.labelY): Rect => ({
      x: p.x,
      y: top + at - p.label.height / 2,
      width: p.width,
      height: p.label.height,
    });
    add(label(p.top));
    if (p.bottom !== undefined) {
      add({ x: p.x, y: p.bottom, width: p.width, height: p.height });
      add(label(p.bottom, p.bottomLabelY));
    }
    add({ x: p.lifeline.x, y: p.lifeline.y1, width: 0, height: p.lifeline.y2 - p.lifeline.y1 });
  }
  for (const msg of l.messages) {
    add(msg.label);
    const lo = Math.min(msg.startX, msg.stopX);
    const hi = Math.max(msg.startX, msg.stopX, msg.self?.right ?? msg.stopX);
    add({ x: lo, y: msg.y, width: hi - lo, height: (msg.self?.bottom ?? msg.y) - msg.y });
  }
  for (const r of [...l.boxes, ...l.notes, ...l.fragments, ...l.rects, ...l.activations]) add(r);
  for (const f of l.fragments) add(f.title);
  add(l.title);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
