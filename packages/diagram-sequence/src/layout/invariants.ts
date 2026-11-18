/**
 * Layout invariants for `SequenceLayout` (spec #125 T3), the custom layout's counterpart of the
 * graph engine's `validateLayout`. Each is a property of the output that the layout code does
 * not build by construction: no NaN; every message and note of the model laid out; messages
 * inside their participants' span and columns; frames holding their members (lines, labels,
 * notes, nested frames), their tab, title and section labels; notes clear of participant
 * boxes; activation bars on their lifeline or touching the bar they stack on. Each violation is
 * one readable line. Comparisons allow a float tolerance.
 *
 * Not checked: that `bounds` holds everything, because the layout grows it to do so.
 */
import type { SequenceModel, SequenceStatement } from '../model.js';
import type {
  ActivationLayout,
  MessageLayout,
  ParticipantLayout,
  Rect,
  SequenceLayout,
} from './types.js';
import {
  EPS,
  nonFinite as numbers,
  rectsOverlap as overlaps,
  within,
} from '@mermaid-js/core/v13/shared/testing/layout-invariants.js';

type Participants = ReadonlyMap<string, ParticipantLayout>;

/** Top of the top box to the end of the participant: the bottom box or the lifeline's end. */
function span(p: ParticipantLayout): [number, number] {
  return [p.top, p.bottom !== undefined ? p.bottom + p.height : p.lifeline.y2];
}

function boxesOf(p: ParticipantLayout): Rect[] {
  const r = [{ x: p.x, y: p.top, width: p.width, height: p.height }];
  if (p.bottom !== undefined) r.push({ x: p.x, y: p.bottom, width: p.width, height: p.height });
  return r;
}

const inside = (r: Rect, x: number, y: number): boolean =>
  within(x, r.x, r.x + r.width) && within(y, r.y, r.y + r.height);
const contains = (outer: Rect, inner: Rect): boolean =>
  inside(outer, inner.x, inner.y) && inside(outer, inner.x + inner.width, inner.y + inner.height);

/** The rectangles a message takes: its line (and self loop), and its label. */
function messageRects(msg: MessageLayout): Rect[] {
  const x1 = Math.min(msg.startX, msg.stopX);
  const x2 = Math.max(msg.startX, msg.stopX, msg.self?.right ?? -Infinity);
  const line = { x: x1, y: msg.y, width: x2 - x1, height: (msg.self?.bottom ?? msg.y) - msg.y };
  return msg.label ? [line, msg.label] : [line];
}

function innerOf(s: SequenceStatement): readonly SequenceStatement[] | undefined {
  if (s.kind === 'fragment') return s.sections.flatMap((section) => section.statements);
  if (s.kind === 'rect') return s.statements;
  return undefined;
}

/** The AST ids of the messages, notes and frames inside `list`, at any depth. */
function members(list: readonly SequenceStatement[], out: string[] = []): string[] {
  for (const s of list) {
    if (s.kind === 'message' || s.kind === 'note') out.push(s.ast);
    const inner = innerOf(s);
    if (inner) {
      out.push(s.ast);
      members(inner, out);
    }
  }
  return out;
}

/** Each frame (fragment or rect) of the model with its members. */
function frames(list: readonly SequenceStatement[], out: [string, string[]][] = []) {
  for (const s of list) {
    const inner = innerOf(s);
    if (!inner) continue;
    out.push([s.ast, members(inner)]);
    frames(inner, out);
  }
  return out;
}

function columnsApart(layout: SequenceLayout, out: string[]): void {
  const sorted = [...layout.participants].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1] as ParticipantLayout;
    const b = sorted[i] as ParticipantLayout;
    if (a.x + a.width > b.x + EPS) out.push(`participant ${a.id} overlaps ${b.id}`);
  }
  for (const p of layout.participants)
    if (p.lifeline.y2 < p.lifeline.y1 - EPS) out.push(`lifeline of ${p.id} runs upward`);
}

/** Every message and note of the model is laid out. */
function allLaidOut(model: SequenceModel, rectsOf: ReadonlyMap<string, Rect[]>, out: string[]) {
  for (const id of members(model.statements))
    if (!rectsOf.has(id)) out.push(`${id} is not laid out`);
}

function messagesInSpan(layout: SequenceLayout, parts: Participants, out: string[]): void {
  const bars = (id: string): ActivationLayout[] =>
    layout.activations.filter((a) => a.participant === id);
  for (const msg of layout.messages) {
    const f = parts.get(msg.from);
    const t = parts.get(msg.to);
    if (!f || !t) {
      out.push(`message ${msg.ast} names a participant that is not laid out`);
      continue;
    }
    for (const p of [f, t]) {
      const [y1, y2] = span(p);
      if (!within(msg.y, y1, y2)) out.push(`message ${msg.ast} at y ${msg.y} is outside ${p.id}`);
    }
    // The ends stay within the two columns, or on a bar wider than its column.
    const rects: Pick<Rect, 'x' | 'width'>[] = [f, t, ...bars(f.id), ...bars(t.id)];
    const lo = Math.min(...rects.map((r) => r.x));
    const hi = Math.max(...rects.map((r) => r.x + r.width));
    for (const x of [msg.startX, msg.stopX])
      if (!within(x, lo, hi)) out.push(`message ${msg.ast} end x ${x} is outside its columns`);
  }
}

function framesHold(
  model: SequenceModel,
  layout: SequenceLayout,
  rectsOf: ReadonlyMap<string, Rect[]>,
  out: string[]
): void {
  for (const [ast, inner] of frames(model.statements)) {
    const frame = rectsOf.get(ast)?.[0];
    if (!frame) continue;
    for (const id of inner)
      for (const r of rectsOf.get(id) ?? [])
        if (!contains(frame, r)) out.push(`frame ${ast} does not contain ${id}`);
  }
  for (const f of layout.fragments) {
    if (!contains(f, f.tab)) out.push(`frame ${f.ast} does not contain its tab`);
    if (f.title && !contains(f, f.title)) out.push(`frame ${f.ast} does not contain its title`);
    for (const s of f.sections) {
      if (!within(s.y, f.y, f.y + f.height))
        out.push(`frame ${f.ast} section at ${s.y} is outside`);
      if (s.label && !contains(f, s.label))
        out.push(`frame ${f.ast} does not contain a section label`);
    }
  }
}

function notesClear(layout: SequenceLayout, out: string[]): void {
  for (const n of layout.notes)
    for (const p of layout.participants)
      for (const r of boxesOf(p))
        if (overlaps(n, r)) out.push(`note ${n.ast} overlaps the box of ${p.id}`);
}

/**
 * A first bar covers its lifeline; a stacked bar starts inside the bar below it (depth one
 * less, open at the time) and right of its left edge. All stay within the participant's span.
 */
function activationsOnLifeline(layout: SequenceLayout, parts: Participants, out: string[]): void {
  for (const a of layout.activations) {
    const p = parts.get(a.participant);
    if (!p) {
      out.push(`activation of ${a.participant} has no participant`);
      continue;
    }
    const [y1, y2] = span(p);
    if (!within(a.y, y1, y2) || !within(a.y + a.height, y1, y2))
      out.push(`activation of ${p.id} runs past its lifeline`);
    if (a.depth === 0) {
      if (!within(p.lifeline.x, a.x, a.x + a.width))
        out.push(`activation of ${p.id} at x ${a.x} is off its lifeline`);
      continue;
    }
    // A bar below that was never closed is not drawn; then only its side of the lifeline counts.
    const under = layout.activations.filter(
      (b) =>
        b.participant === a.participant &&
        b.depth === a.depth - 1 &&
        within(a.y, b.y, b.y + b.height)
    );
    const onBar = under.some((b) => a.x > b.x + EPS && within(a.x, b.x, b.x + b.width));
    if (under.length > 0 ? !onBar : a.x + a.width < p.lifeline.x - EPS)
      out.push(`activation of ${p.id} at depth ${a.depth} is not on the bar below it`);
  }
}

/**
 * Participant rows: a lifeline starts at or below the bottom of its row; under the band model
 * (#194) the glyph band lies inside the row, and the label lies under the band and inside the
 * row, at the top and at the bottom.
 */
function rowsHold(layout: SequenceLayout, out: string[]): void {
  for (const p of layout.participants) {
    if (p.lifeline.y1 < p.top + p.height - EPS)
      out.push(`the lifeline of ${p.id} starts inside its row`);
    const band = p.band;
    if (!band) continue;
    const half = p.label.height / 2;
    const check = (where: string, edge: number, labelY: number): void => {
      if (band.height <= 0 || edge - band.height < -EPS || edge > p.height + EPS)
        out.push(`the ${where} glyph band of ${p.id} leaves its row`);
      if (labelY - half < edge - EPS) out.push(`the ${where} label of ${p.id} overlaps its symbol`);
      if (labelY - half < -EPS || labelY + half > p.height + EPS)
        out.push(`the ${where} label of ${p.id} leaves its row`);
    };
    check('top', band.top, p.labelY);
    if (p.bottom !== undefined) check('bottom', band.bottom, p.bottomLabelY ?? p.labelY);
  }
}

/** Every invariant `layout` breaks; empty when it holds them all. */
export function sequenceLayoutViolations(model: SequenceModel, layout: SequenceLayout): string[] {
  const out: string[] = [];
  numbers(layout, 'layout', out);
  const parts = new Map(layout.participants.map((p) => [p.id, p]));
  const rectsOf = new Map<string, Rect[]>();
  for (const msg of layout.messages) rectsOf.set(msg.ast, messageRects(msg));
  for (const r of [...layout.notes, ...layout.fragments, ...layout.rects]) rectsOf.set(r.ast, [r]);
  columnsApart(layout, out);
  allLaidOut(model, rectsOf, out);
  messagesInSpan(layout, parts, out);
  framesHold(model, layout, rectsOf, out);
  notesClear(layout, out);
  activationsOnLifeline(layout, parts, out);
  rowsHold(layout, out);
  return out;
}
