/**
 * The first pass (v12 `calculateLoopBounds`): the x geometry of every message
 * (`buildMessageModel`) and note (`buildNoteModel`) with the activations open at that point, and
 * the reach of each fragment, which its titles wrap to. As in v12, central connections do not
 * move later messages in this pass.
 */
import type { MeasuredLabel } from '@mermaid-js/core/v13/text/index.js';
import type {
  SequenceFragment,
  SequenceMessage,
  SequenceNote,
  SequenceStatement,
} from '../model.js';
import { BIDIRECTIONAL, NO_HEAD_GAP, START_GAP, centerOf, type Column, type Env } from './env.js';

/** A message's x geometry. */
export interface MessageX {
  startx: number;
  stopx: number;
  readonly width: number;
  readonly fromBounds: number;
  readonly toBounds: number;
  readonly label: MeasuredLabel;
}

export interface NoteX {
  readonly startx: number;
  readonly width: number;
  readonly label: MeasuredLabel;
}

/** A fragment's horizontal reach. */
export interface Reach {
  from: number;
  to: number;
  width: number;
}

export interface Geometry {
  readonly messages: ReadonlyMap<SequenceMessage, MessageX>;
  readonly notes: ReadonlyMap<SequenceNote, NoteX>;
  readonly reach: ReadonlyMap<SequenceFragment, Reach>;
}

interface Bar {
  readonly actor: string;
  readonly startx: number;
  readonly stopx: number;
}

/** The x of a new activation bar on `c` with `depth` bars already open on it. */
export const barX = (env: Env, c: Column, depth: number): number =>
  centerOf(env, c) + env.m.half((depth - 1) * env.m.activationWidth);

class XPass {
  readonly messages = new Map<SequenceMessage, MessageX>();
  readonly notes = new Map<SequenceNote, NoteX>();
  readonly reach = new Map<SequenceFragment, Reach>();
  private readonly open: Bar[] = [];
  private readonly stack: Reach[] = [];

  constructor(private readonly env: Env) {}

  visit(list: readonly SequenceStatement[]): void {
    for (const s of list) {
      if (s.kind === 'fragment') {
        const r: Reach = { from: Infinity, to: -Infinity, width: 0 };
        this.reach.set(s, r);
        this.stack.push(r);
        for (const section of s.sections) this.visit(section.statements);
        this.stack.pop();
      } else if (s.kind === 'rect') this.visit(s.statements);
      else if (s.kind === 'activation') {
        if (s.active) this.activate(s.participant);
        else this.deactivate(s.participant);
      } else if (s.kind === 'note') this.note(s);
      else if (s.kind === 'message') this.message(s);
    }
  }

  private activate(actor: string): void {
    const c = this.env.columns.get(actor);
    if (!c) return;
    const depth = this.open.filter((a) => a.actor === actor).length;
    const x = barX(this.env, c, depth);
    this.open.push({ actor, startx: x, stopx: x + this.env.m.activationWidth });
  }

  private deactivate(actor: string): void {
    const i = this.open.map((a) => a.actor).lastIndexOf(actor);
    if (i >= 0) this.open.splice(i, 1);
  }

  /** The x span of a lifeline and the bars open on it. */
  private barBounds(c: Column): [number, number] {
    const center = centerOf(this.env, c);
    let left = center - this.env.m.lifelineHalf;
    let right = center + this.env.m.lifelineHalf;
    for (const a of this.open) {
      if (a.actor !== c.p.id) continue;
      left = Math.min(left, a.startx);
      right = Math.max(right, a.stopx);
    }
    return [left, right];
  }

  private message(s: SequenceMessage): void {
    const { env } = this;
    const from = env.columns.get(s.from);
    const to = env.columns.get(s.to);
    if (!from || !to) return;
    const g = this.messageX(s, from, to);
    this.messages.set(s, g);
    const { m } = env;
    for (const r of this.stack) {
      if (g.startx === g.stopx) {
        r.from = Math.min(from.x - m.half(g.width), from.x - m.half(from.width), r.from);
        r.to = Math.max(to.x + m.half(g.width), to.x + m.half(from.width), r.to);
        r.width = Math.max(r.width, Math.abs(r.to - r.from)) - m.labelBoxWidth;
      } else {
        r.from = Math.min(g.startx, r.from);
        r.to = Math.max(g.stopx, r.to);
        r.width = Math.max(r.width, g.width) - m.labelBoxWidth;
      }
    }
    if (s.activation === 'activate') this.activate(s.to);
    else if (s.activation === 'deactivate') this.deactivate(s.from);
  }

  private messageX(s: SequenceMessage, from: Column, to: Column): MessageX {
    const { m } = this.env;
    const [fromLeft, fromRight] = this.barBounds(from);
    const [toLeft, toRight] = this.barBounds(to);
    const right = fromLeft <= toLeft;
    let startx = right ? fromRight : fromLeft;
    let stopx = right ? toLeft : toRight;
    const toward = (v: number): number => (right ? -v : v);
    // v12 neo: every arrow but `->` stops short of its target, a bidirectional one starts in.
    if (s.arrow !== 'solid_open') stopx += toward(m.messageEndGap);
    if (BIDIRECTIONAL.has(s.arrow)) startx -= toward(m.messageEndGap);
    if (s.central === 'from' || s.central === 'both') {
      startx += m.centralOffset;
      if (BIDIRECTIONAL.has(s.arrow) && !right) startx -= m.centralBidiOffset;
    }
    if (s.from === s.to) stopx = startx;
    else {
      const toBar = Math.abs(toLeft - toRight) > 2 * m.lifelineHalf;
      const activates = s.activation === 'activate' || s.central === 'to' || s.central === 'both';
      if (activates && !toBar) stopx += toward(m.half(m.activationWidth) - m.lifelineHalf);
      if (!NO_HEAD_GAP.has(s.arrow)) stopx += toward(m.arrowGap);
      if (START_GAP.has(s.arrow)) startx -= toward(m.arrowGap);
    }
    const span = Math.abs(startx - stopx);
    const wrap = (s.wrap ?? this.env.autoWrap) && s.text !== '';
    // In cells a wrapped label stays inside the span, a space clear of each lifeline: written
    // over a lifeline it would erase it. A self message's label sits right of its lifeline.
    const inside = m.cells && s.from !== s.to;
    let max = Infinity;
    if (wrap)
      max = inside
        ? Math.max(span - 2 * m.wrapPadding, 1)
        : Math.max(span + 2 * m.wrapPadding, m.wrapWidth);
    const label = this.env.measure(this.env.messageText(s), this.env.fonts.message, max);
    const all = [fromLeft, fromRight, toLeft, toRight];
    const own = wrap ? 0 : label.width + 2 * m.wrapPadding;
    return {
      startx,
      stopx,
      width: Math.max(own, span + 2 * m.wrapPadding, m.width),
      fromBounds: Math.min(...all),
      toBounds: Math.max(...all),
      label,
    };
  }

  private note(s: SequenceNote): void {
    const from = this.env.columns.get(s.participants[0]);
    const to = this.env.columns.get(s.participants[1] ?? s.participants[0]);
    if (!from || !to) return;
    const g = this.noteX(s, from, to);
    this.notes.set(s, g);
    for (const r of this.stack) {
      r.from = Math.min(r.from, g.startx);
      r.to = Math.max(r.to, g.startx + g.width);
      r.width = Math.max(r.width, Math.abs(r.from - r.to)) - this.env.m.labelBoxWidth;
    }
  }

  private noteX(s: SequenceNote, from: Column, to: Column): NoteX {
    const { env } = this;
    const { m } = env;
    const wrap = (s.wrap ?? env.autoWrap) && s.text !== '';
    const font = env.fonts.note;
    let text = env.measure(s.text, font, wrap ? m.wrapWidth : Infinity);
    const pad = 2 * m.noteMargin.x;
    const halves = m.half(from.width) + m.half(to.width);
    let width: number;
    let startx: number;
    if (s.placement === 'right') {
      width = wrap ? Math.max(m.wrapWidth, text.width) : Math.max(halves, text.width + pad);
      startx = from.x + m.half(from.width + m.actorMargin);
    } else if (s.placement === 'left') {
      width = wrap ? Math.max(m.wrapWidth, text.width + pad) : Math.max(halves, text.width + pad);
      startx = from.x - width + m.half(from.width - m.actorMargin);
    } else if (from === to) {
      const wide = Math.max(wrap ? m.wrapWidth : m.width, from.width);
      text = env.measure(s.text, font, wrap ? wide : Infinity);
      width = wrap ? wide : Math.max(wide, text.width + pad);
      startx = from.x + m.half(from.width - width);
    } else {
      const a = centerOf(env, from);
      const z = centerOf(env, to);
      width = Math.abs(a - z) + m.actorMargin;
      startx = Math.min(a, z) - m.half(m.actorMargin);
      // In cells the text would run over the sides: the note grows to it, about its middle.
      if (m.cells && text.width + pad > width) {
        startx -= m.half(text.width + pad - width);
        width = text.width + pad;
      }
    }
    if (wrap) text = env.measure(s.text, font, width - 2 * m.wrapPadding);
    return { startx, width, label: text };
  }
}

/** Runs the first pass over the model's statements. */
export function geometryOf(statements: readonly SequenceStatement[], env: Env): Geometry {
  const pass = new XPass(env);
  pass.visit(statements);
  return pass;
}
