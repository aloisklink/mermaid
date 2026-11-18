/**
 * Columns: participant labels measured, the gap after each column grown to hold the widest
 * message or note next to it, boxes sized for their labels, and the columns placed left to
 * right (v12 `calculateActorMargins`, `getMaxMessageWidthPerActor`, `addActorRenderingData`).
 */
import type { MeasuredLabel } from '@mermaid-js/core/v13/text/index.js';
import type { SequenceBox, SequenceModel, SequenceNote, SequenceStatement } from '../model.js';
import type { Bounds } from './bounds.js';
import { nextOf, prevOf, walk, type Column, type Env } from './env.js';
import type { SequenceMetrics } from './metrics.js';

/** v12 `actorStackHeight`: glyph band, gap, label, gap. */
export const bandStack = (m: SequenceMetrics, text: number): number =>
  m.glyphBand + m.glyphLabelGap + text + m.labelLifelineGap;

/** Measures every participant; every box gets the height of the tallest. */
export function measureColumns(
  model: SequenceModel,
  env: Omit<Env, 'columns'>
): Map<string, Column> {
  const { m, fonts } = env;
  const columns = new Map<string, Column>();
  let rowHeight = m.height;
  for (const p of model.participants) {
    const wrap = p.wrap ?? env.autoWrap;
    const label = env.measure(
      p.label,
      fonts.actor,
      wrap ? m.wrapWidth - 2 * m.wrapPadding : Infinity
    );
    // v12 keeps a wrapped label at `width`; a word longer than that widens the box here.
    const width = Math.max(m.width, label.width + 2 * m.wrapPadding);
    // v12 neo: as tall as the glyph-gap-label-gap stack (`actorStackHeight`), every kind.
    const stack = m.glyphBand > 0 ? bandStack(m, label.height) : 0;
    const height = Math.max(m.height, label.height + 2 * m.actorPadY, stack);
    rowHeight = Math.max(rowHeight, height);
    columns.set(p.id, {
      p,
      label,
      width,
      height,
      margin: m.actorMargin,
      x: 0,
      top: 0,
      visible: true,
    });
  }
  for (const c of columns.values()) c.height = rowHeight;
  if (env.seq.hideUnusedParticipants === true) {
    const used = usedParticipants(model.statements);
    for (const c of columns.values()) c.visible = used.has(c.p.id);
  }
  return columns;
}

function usedParticipants(statements: readonly SequenceStatement[]): Set<string> {
  const used = new Set<string>();
  for (const s of walk(statements)) {
    if (s.kind === 'message') used.add(s.from).add(s.to);
    else if (s.kind === 'note') for (const id of s.participants) used.add(id);
    else if (s.kind === 'activation') used.add(s.participant);
  }
  return used;
}

/**
 * The room a self message's label needs right of its column: half of it in px, where the
 * label is centred on the lifeline; all of it in cells, where it starts right of the lifeline
 * (rows.ts) so as not to cut it.
 */
const selfRoom = (m: Env['m'], w: number): number => (m.cells ? w : m.half(w));

type Gap = [string | undefined, number];

/**
 * In cells a note over two neighbours fits its text between their lifelines and an
 * actorMargin past each (geometry.ts grows one over more columns about its middle).
 */
function cellNoteGaps(env: Env, a: string, b: string, w: number): Gap[] {
  const [left, right] = (env.index.get(a) ?? 0) <= (env.index.get(b) ?? 0) ? [a, b] : [b, a];
  return nextOf(env, left) === right ? [[left, w - 2 * env.m.actorMargin]] : [];
}

/** The gaps a note widens, `w` being its text and padding. */
function noteGaps(env: Env, note: SequenceNote, w: number): Gap[] {
  const { m } = env;
  const from = note.participants[0];
  const to = note.participants[1] ?? from;
  const prev = prevOf(env, to);
  const next = nextOf(env, to);
  if (note.placement === 'right') return next === undefined ? [] : [[from, w]];
  if (note.placement === 'left') return prev === undefined ? [] : [[prev, w]];
  if (m.cells && from !== to) return cellNoteGaps(env, from, to, w);
  return next === undefined
    ? [[prev, m.half(w)]]
    : [
        [prev, m.half(w)],
        [from, m.half(w)],
      ];
}

/** The ids whose gap a message or note widens, and by how much. */
function gapsWidened(env: Env, s: SequenceStatement): Gap[] {
  if (s.kind !== 'message' && s.kind !== 'note') return [];
  const from = s.kind === 'message' ? s.from : s.participants[0];
  const to = s.kind === 'message' ? s.to : (s.participants[1] ?? from);
  if (!env.columns.has(from) || !env.columns.has(to)) return [];
  const { m } = env;
  const wrap = s.wrap ?? env.autoWrap;
  const font = s.kind === 'note' ? env.fonts.note : env.fonts.message;
  const max = wrap ? m.wrapWidth - 2 * m.wrapPadding : Infinity;
  const text = s.kind === 'message' ? env.messageText(s) : s.text;
  const w = env.measure(text, font, max).width + 2 * m.wrapPadding;
  if (s.kind === 'note') return noteGaps(env, s, w);
  if (from === nextOf(env, to)) return [[to, w]];
  if (from === prevOf(env, to)) return [[from, w]];
  return from === to ? [[from, selfRoom(m, w)]] : [];
}

/** Grows the gap after each column to hold the widest message or note next to it. */
export function actorMargins(model: SequenceModel, env: Env): void {
  const widths = new Map<string, number>();
  for (const s of walk(model.statements))
    for (const [id, w] of gapsWidened(env, s))
      if (id !== undefined) widths.set(id, Math.max(widths.get(id) ?? 0, w));
  const { m } = env;
  for (const [id, w] of widths) {
    const c = env.columns.get(id);
    if (!c) continue;
    const next = env.columns.get(nextOf(env, id) ?? '');
    const need = w + m.actorMargin - m.half(c.width) - (next ? m.half(next.width) : 0);
    c.margin = Math.max(need, m.actorMargin);
  }
}

export interface BoxSizes {
  readonly labels: ReadonlyMap<SequenceBox, MeasuredLabel>;
  /** Room between a box's side and its outer members. */
  readonly margins: ReadonlyMap<SequenceBox, number>;
  /** The tallest box label: room above the participants. */
  readonly labelHeight: number;
}

/** Boxes with a visible member: the others are not drawn and take no room. */
export function shownBoxes(model: SequenceModel, env: Env): SequenceBox[] {
  return model.boxes.filter((box) =>
    box.participants.some((id) => env.columns.get(id)?.visible === true)
  );
}

/** Room on each side of a box so that its label fits. */
export function boxSizes(model: SequenceModel, env: Env): BoxSizes {
  const { m } = env;
  const labels = new Map<SequenceBox, MeasuredLabel>();
  const margins = new Map<SequenceBox, number>();
  let labelHeight = 0;
  for (const box of shownBoxes(model, env)) {
    let total = 0;
    for (const id of box.participants) {
      const c = env.columns.get(id);
      if (c) total += c.width + c.margin;
    }
    total += m.boxLabelMargins * m.boxMargin.x - 2 * m.boxTextMargin.x;
    const wrap = box.wrap ?? env.autoWrap;
    const max = wrap ? total - 2 * m.wrapPadding : Infinity;
    const text = env.measure(box.label, env.fonts.message, max);
    labels.set(box, text);
    labelHeight = Math.max(labelHeight, text.height);
    // In cells the title sits on the border: room for a border run and a space either side.
    const min = Math.max(total, text.width + 2 * m.wrapPadding + m.frameLabelSlack);
    margins.set(box, m.boxTextMargin.x + Math.max(0, m.half(min - total)));
  }
  return { labels, margins, labelHeight };
}

export interface BoxGeom {
  readonly box: SequenceBox;
  readonly x: number;
  width: number;
}

/** Room a box takes beyond its margins on each side: what a first layout in cells overran. */
export interface BoxGrowth {
  readonly left: number;
  readonly right: number;
}

/**
 * Places the visible columns left to right, boxes around their members, at the current row.
 * `grow` widens boxes on one side (cells only; layout.ts).
 */
export function placeColumns(
  model: SequenceModel,
  env: Env,
  sizes: BoxSizes,
  b: Bounds,
  grow: ReadonlyMap<SequenceBox, BoxGrowth> = new Map()
): BoxGeom[] {
  const { m } = env;
  const out: BoxGeom[] = [];
  const geom = new Map<number, BoxGeom>();
  const margin = (g: BoxGeom): number => sizes.margins.get(g.box) ?? 0;
  const leftOf = (g: BoxGeom): number => margin(g) + (grow.get(g.box)?.left ?? 0);
  const rightOf = (g: BoxGeom): number => margin(g) + (grow.get(g.box)?.right ?? 0);
  let prevWidth = 0;
  let prevMargin = 0;
  let prevBox: BoxGeom | undefined;
  for (const c of env.columns.values()) {
    if (!c.visible) continue;
    const index = c.p.box;
    const box = index === undefined ? undefined : model.boxes[index];
    let g = index === undefined ? undefined : geom.get(index);
    if (prevBox && prevBox !== g) prevMargin += m.boxMargin.x + rightOf(prevBox);
    if (box && index !== undefined && !g) {
      g = { box, x: prevWidth + prevMargin, width: 0 };
      geom.set(index, g);
      out.push(g);
      prevMargin += leftOf(g);
    } else if (g && g !== prevBox) prevMargin += leftOf(g);
    if (c.p.createdBy !== undefined) prevMargin += m.half(c.width);
    c.x = prevWidth + prevMargin;
    c.top = b.y;
    b.insert(c.x, 0, c.x + c.width, c.height);
    prevWidth += c.width + prevMargin;
    if (g) g.width = prevWidth + rightOf(g) - g.x;
    prevMargin = c.margin;
    prevBox = g;
  }
  return out;
}

/** The x span of the visible columns. */
export function columnSpan(env: Env): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of env.columns.values()) {
    if (!c.visible) continue;
    lo = Math.min(lo, c.x);
    hi = Math.max(hi, c.x + c.width);
  }
  return lo === Infinity ? [0, env.m.labelBoxWidth] : [lo, hi];
}
