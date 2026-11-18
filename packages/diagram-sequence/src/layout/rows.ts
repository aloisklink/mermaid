/**
 * The second pass (v12's `draw` loop over the messages, without the drawing): moves down the
 * statements, giving each message, note, activation, fragment and rect its rows. Frames are open
 * on the running bounds while their statements are laid out, so they grow to hold them.
 */
import type { AstId } from '@mermaid-js/core/v13/parser-kit/index.js';
import type { MeasuredLabel } from '@mermaid-js/core/v13/text/index.js';
import type {
  FragmentKind,
  ParticipantKind,
  SequenceFragment,
  SequenceMessage,
  SequenceNote,
  SequenceRect,
  SequenceStatement,
} from '../model.js';
import type { Bounds, OpenFrame } from './bounds.js';
import { columnSpan } from './columns.js';
import { REVERSE_ARROWS, alignX, centerOf, placed, type Column, type Env } from './env.js';
import { barX, type Geometry, type MessageX } from './geometry.js';
import type {
  ActivationLayout,
  FragmentLayout,
  MessageLayout,
  NoteLayout,
  Rect,
  RectLayout,
  SelfLoop,
} from './types.js';

// Participant kinds drawn as a narrow symbol: a creating message stops at the symbol.
const SYMBOL_KINDS: ReadonlySet<ParticipantKind> = new Set<ParticipantKind>([
  'actor',
  'control',
  'entity',
  'database',
]);
// The frame tab keyword of each fragment kind.
const TAB: Readonly<Record<FragmentKind, string>> = {
  loop: 'loop',
  alt: 'alt',
  opt: 'opt',
  par: 'par',
  par_over: 'par',
  critical: 'critical',
  break: 'break',
};

interface OpenBar {
  readonly actor: string;
  readonly startx: number;
  readonly stopx: number;
  y: number;
  readonly depth: number;
  readonly ast?: AstId;
  readonly message?: AstId;
  /** Start order: bars are listed in it. */
  readonly seq: number;
}

/** Where the lifeline starts below the top of a column's symbol. */
export function lifelineOffset(env: Env, c: Column): number {
  const { m } = env;
  // The band model: one datum, the bottom of the row, for every kind.
  if (m.glyphBand > 0) return c.height;
  if (c.p.kind === 'database') return c.height + m.databaseTextMargins * m.boxTextMargin.y;
  return Math.max(c.height, m.glyphLifeline[c.p.kind] ?? 0);
}

/**
 * `x`, or the nearest place to it where a `w` wide label keeps a cell clear of every border
 * column and of the `keep` columns (the message's own lifelines): inside the message's `span`
 * when one is free there, else past it, else inside the span over a border but clear of the
 * lifelines. Without borders (px, or cells with no boxes) it is `x`.
 */
function clearOf(
  borders: readonly number[],
  x: number,
  w: number,
  span: readonly [number, number],
  keep: readonly number[] = []
) {
  const off = (at: number): boolean => keep.every((c) => c < at - 1 || c > at + w);
  const clear = (at: number): boolean => off(at) && borders.every((c) => c < at - 1 || c > at + w);
  if (borders.length === 0 || clear(x)) return x;
  const reach = span[1] - span[0] + w + borders.length * w;
  const within = (at: number) => at >= span[0] && at + w <= span[1];
  for (const [inside, ok] of [
    [true, clear],
    [false, clear],
    [true, off],
  ] as const)
    for (let d = 1; d <= reach; d++)
      for (const at of [x - d, x + d]) if ((!inside || within(at)) && ok(at)) return at;
  return x;
}

export class Rows {
  readonly messages: MessageLayout[] = [];
  readonly notes: NoteLayout[] = [];
  readonly activations: ActivationLayout[] = [];
  /** The start order of each entry of `activations`. */
  private readonly barStarts: number[] = [];
  private started = 0;
  readonly fragments: FragmentLayout[] = [];
  readonly rects: RectLayout[] = [];
  private readonly open: OpenBar[] = [];
  private readonly createdBy = new Map<AstId, Column>();
  private readonly destroyedBy = new Map<AstId, Column>();

  constructor(
    private readonly env: Env,
    private readonly geometry: Geometry,
    private readonly b: Bounds,
    /** Box border columns (cells only): message labels are placed clear of them. */
    private readonly borders: readonly number[] = []
  ) {
    for (const c of env.columns.values()) {
      if (c.p.createdBy !== undefined) this.createdBy.set(c.p.createdBy, c);
      if (c.p.destroyedBy !== undefined) this.destroyedBy.set(c.p.destroyedBy, c);
    }
  }

  statements(list: readonly SequenceStatement[]): void {
    for (const s of list) {
      switch (s.kind) {
        case 'message':
          this.message(s);
          break;
        case 'note':
          this.note(s);
          break;
        case 'activation':
          if (s.active) this.activate(s.participant, s.ast);
          else this.deactivate(s.participant);
          break;
        case 'fragment':
          this.fragment(s);
          break;
        case 'rect':
          this.rect(s);
          break;
        case 'autonumber':
          // Numbers are counted before the rows (env.ts `sequenceNumbers`).
          break;
      }
    }
  }

  private activate(actor: string, ast?: AstId, message?: AstId): void {
    const c = this.env.columns.get(actor);
    if (!c) return;
    const depth = this.open.filter((a) => a.actor === actor).length;
    const x = barX(this.env, c, depth);
    this.open.push({
      actor,
      startx: x,
      stopx: x + this.env.m.activationWidth,
      y: this.b.y + this.env.m.activationLead,
      depth,
      ...(ast !== undefined ? { ast } : {}),
      ...(message !== undefined ? { message } : {}),
      seq: this.started++,
    });
  }

  private deactivate(actor: string): void {
    const { m } = this.env;
    const i = this.open.map((a) => a.actor).lastIndexOf(actor);
    if (i < 0) return;
    const [a] = this.open.splice(i, 1) as [OpenBar];
    let end = this.b.y;
    if (a.y + m.activationMin > end) {
      a.y = end - m.activationShortLead;
      end += m.activationShortTail;
    }
    // Listed in start order, though a bar is only known when it ends.
    let at = this.barStarts.length;
    while (at > 0 && (this.barStarts[at - 1] as number) > a.seq) at--;
    this.barStarts.splice(at, 0, a.seq);
    this.activations.splice(at, 0, {
      participant: a.actor,
      ...(a.ast !== undefined ? { ast: a.ast } : {}),
      ...(a.message !== undefined ? { message: a.message } : {}),
      x: a.startx,
      y: a.y,
      width: a.stopx - a.startx,
      height: end - a.y,
      depth: a.depth,
    });
    this.b.insert(a.startx, end - m.activationRise, a.stopx, end);
  }

  /**
   * v12 `boundMessage`: the rows of a message. `reserve` is the room the message needs above
   * its line (half of a box centred on it); the row moves down when the label gives less.
   * Returns the top of the row and the y of the line.
   */
  private boundMessage(g: MessageX, self: boolean, reserve: number): [number, number] {
    const { b } = this;
    const { m } = this.env;
    const textH = g.label.height;
    const first = g.label.lines.length > 0 ? g.label.lineHeight : 0;
    const gap = !self || !this.env.rightAngles ? m.boxMargin.y : 0;
    const above = m.messageLeadLines * first + textH + gap;
    if (above < reserve) b.bump(reserve - above);
    const starty = b.y;
    b.bump(m.messageLead);
    b.bump(m.messageLeadLines * (g.label.lines.length > 0 ? g.label.lineHeight : 0));
    let total = textH - m.messageLead;
    let lineY: number;
    if (self) {
      if (!this.env.rightAngles) total += m.boxMargin.y;
      lineY = b.y + total;
      total += m.selfLoopAdvance;
      const dx = Math.max(m.half(g.label.width), m.half(m.width));
      const top = b.y - m.selfLoopRise + total;
      // Room for the loop itself, which reaches further than v12 reserved with a narrow width.
      const right = Math.max(g.stopx + dx, this.selfLoop(g, lineY).right);
      b.insert(g.startx - dx, top, right, b.y + m.selfLoopReserve + total);
    } else {
      total += m.boxMargin.y;
      lineY = b.y + total;
      b.insert(g.startx, lineY - m.messageRise, g.stopx, lineY);
    }
    b.bump(total);
    b.insert(g.fromBounds, starty, g.toBounds, b.y);
    return [starty, lineY];
  }

  /** The lifeline columns of a message's two ends, which its label keeps off (cells only). */
  private lifelinesOf(s: SequenceMessage): number[] {
    if (!this.env.m.cells) return [];
    return [s.from, s.to].flatMap((id) => {
      const c = this.env.columns.get(id);
      return c ? [centerOf(this.env, c)] : [];
    });
  }

  /** The column a message creates, or destroys with a bottom box drawn at its row. */
  private boxAt(s: SequenceMessage): Column | undefined {
    const created = this.createdBy.get(s.ast);
    if (created && created.p.id === s.to) return created;
    const destroyed = this.destroyedBy.get(s.ast);
    if (this.env.mirror && destroyed && (destroyed.p.id === s.from || destroyed.p.id === s.to))
      return destroyed;
    return undefined;
  }

  /** v12 `adjustCreatedDestroyedData`: a creating or destroying message ends at the symbol. */
  private lifecycle(s: SequenceMessage, g: MessageX, starty: number, lineY: number): void {
    const { env, b } = this;
    const { m } = env;
    const from = env.columns.get(s.from) as Column;
    const to = env.columns.get(s.to) as Column;
    const stopy = b.y;
    const reach = (c: Column): number => stopy + m.half(c.height) + m.noteMargin.y;
    const halfSymbol = (c: Column): number =>
      m.symbolWidth > 0 && SYMBOL_KINDS.has(c.p.kind) ? m.half(m.symbolWidth) : m.half(c.width);
    const receiver = (c: Column, adjust: number): void => {
      if (c.x < from.x) b.insert(g.stopx - adjust, starty, g.startx, reach(c));
      else b.insert(g.startx, starty, g.stopx + adjust, reach(c));
      g.stopx += c.x < from.x ? adjust : -adjust;
    };
    const sender = (c: Column, adjust: number): void => {
      if (c.x < to.x) b.insert(g.startx - adjust, starty, g.stopx, reach(c));
      else b.insert(g.stopx, starty, g.startx + adjust, reach(c));
      g.startx += c.x < to.x ? adjust : -adjust;
    };
    const created = this.createdBy.get(s.ast);
    const destroyed = this.destroyedBy.get(s.ast);
    if (created && created.p.id === s.to) {
      receiver(created, halfSymbol(created) + m.createGap);
      created.top = lineY - m.half(created.height);
      // The next row starts below the symbol (v12: half the box, which a stick figure overhangs).
      b.bump(lifelineOffset(env, created) - m.half(created.height));
    } else if (destroyed && (destroyed.p.id === s.from || destroyed.p.id === s.to)) {
      if (env.mirror) {
        if (destroyed.p.id === s.from) sender(destroyed, halfSymbol(destroyed));
        else receiver(destroyed, halfSymbol(destroyed) + m.createGap);
      }
      destroyed.stopy = lineY - m.half(destroyed.height);
      b.bump(m.half(destroyed.height));
    }
  }

  private message(s: SequenceMessage): void {
    const g = this.geometry.messages.get(s);
    if (!g) {
      this.unknown(s.ast, [s.from, s.to]);
      return;
    }
    const { m, seq } = this.env;
    const number = this.env.numbers.get(s);
    const self = s.from === s.to;
    const box = this.boxAt(s);
    const [starty, lineY] = this.boundMessage(g, self, box ? m.half(box.height) : 0);
    this.lifecycle(s, g, starty, lineY);
    const span = [Math.min(g.startx, g.stopx), Math.max(g.startx, g.stopx)] as const;
    const label = g.label;
    const layout: MessageLayout = {
      ast: s.ast,
      from: s.from,
      to: s.to,
      arrow: s.arrow,
      y: lineY,
      startX: g.startx,
      stopX: g.stopx,
      ...(label.lines.length > 0
        ? {
            label: placed(
              label,
              // In cells a label centred on the lifeline would cut it: it starts right of it.
              self && m.cells
                ? g.startx + m.lifelineHalf
                : clearOf(
                    this.borders,
                    alignX(this.env, seq.messageAlign, span, label.width, m.wrapPadding),
                    label.width,
                    span,
                    this.lifelinesOf(s)
                  ),
              starty + m.messageLead
            ),
          }
        : {}),
      ...(self ? { self: this.selfLoop(g, lineY) } : {}),
      ...(number !== undefined ? { number: { value: number, x: this.numberX(s, g) } } : {}),
      ...(s.central ? { central: s.central } : {}),
    };
    this.messages.push(layout);
    // Frames hold the label too, which v12 left to overrun them.
    if (layout.label) {
      const l = layout.label;
      this.b.insert(l.x, l.y, l.x + l.width, l.y + l.height);
    }
    if (s.activation === 'activate') this.activate(s.to, undefined, s.ast);
    else if (s.activation === 'deactivate') this.deactivate(s.from);
    if (s.central === 'to' || s.central === 'both') this.activate(s.to, undefined, s.ast);
    if (s.central === 'from' || s.central === 'both') this.activate(s.from, undefined, s.ast);
  }

  private selfLoop(g: MessageX, lineY: number): SelfLoop {
    const { m } = this.env;
    if (this.env.rightAngles)
      return {
        right: g.startx + Math.max(m.half(m.width), m.half(g.label.width)),
        bottom: lineY + m.selfLoopSquareDrop,
      };
    return { right: g.startx + m.selfLoopReach, bottom: lineY + m.selfLoopDrop };
  }

  /** The sequence number sits at the message's tail, or at its head for a reverse arrow. */
  private numberX(s: SequenceMessage, g: MessageX): number {
    const { m } = this.env;
    const left = g.fromBounds + m.lifelineHalf;
    if (s.from === s.to) return left;
    const ltr = g.startx <= g.stopx;
    return REVERSE_ARROWS.has(s.arrow) === ltr ? g.toBounds - m.lifelineHalf : left;
  }

  /** A statement naming a participant the model does not declare is left out, with a warning. */
  private unknown(ast: AstId, ids: readonly string[]): void {
    const missing = ids.filter((id) => !this.env.columns.has(id));
    this.env.warn({
      code: 'SEQUENCE_UNKNOWN_PARTICIPANT',
      message: `Left out a statement that names an undeclared participant: ${missing.join(', ')}`,
      astIds: [ast],
    });
  }

  private note(s: SequenceNote): void {
    const g = this.geometry.notes.get(s);
    if (!g) {
      this.unknown(s.ast, s.participants);
      return;
    }
    const { b, env } = this;
    const { m } = env;
    b.bump(m.boxMargin.y);
    const y = b.y;
    const height = g.label.height + 2 * m.noteMargin.y;
    const span = [g.startx, g.startx + g.width] as const;
    const at = alignX(env, env.seq.noteAlign, span, g.label.width, m.noteMargin.x);
    const { x, width } = this.noteClearOfBorders(g.startx, g.width, at, g.label.width);
    b.bump(height);
    b.insert(g.startx, y, g.startx + width, y + height);
    this.notes.push({
      ast: s.ast,
      placement: s.placement,
      participants: s.participants,
      x: g.startx,
      y,
      width,
      height,
      label: placed(g.label, x, y + m.half(height - g.label.height)),
    });
  }

  /**
   * In cells a box side inside a note is drawn through it, so the note's text keeps a cell
   * clear of it: the label moves within the note to the nearest place clear of every such
   * side, and when there is none the note grows right to hold it past the last one.
   */
  private noteClearOfBorders(
    left: number,
    width: number,
    x: number,
    w: number
  ): { x: number; width: number } {
    const right = left + width - 1;
    const inside = this.borders.filter((c) => c > left && c < right);
    if (inside.length === 0) return { x, width };
    const pad = this.env.m.noteMargin.x;
    const clear = (at: number): boolean => inside.every((c) => c < at - 1 || c > at + w);
    for (let d = 0; d <= width; d++)
      for (const at of [x - d, x + d])
        if (at >= left + pad && at + w <= right - pad + 1 && clear(at)) return { x: at, width };
    const at = Math.max(...inside) + 2;
    return { x: at, width: Math.max(width, at + w + pad - left) };
  }

  /** Closes a frame: it reaches past its last row and holds its tab. */
  private closeFrame(frame: OpenFrame, minWidth: number, minBottom: number): Rect {
    const { b } = this;
    b.close();
    const empty = frame.startx === undefined || frame.stopx === undefined;
    const [sx, stopx] = empty
      ? columnSpan(this.env)
      : [frame.startx as number, frame.stopx as number];
    const ex = Math.max(stopx, sx + minWidth);
    const sy = frame.starty;
    const ey = Math.max(frame.stopy ?? b.y, b.y, minBottom);
    // Frames around this one hold what this one grew by.
    if (empty || ex !== frame.stopx || ey !== frame.stopy) b.insert(sx, sy, ex, ey);
    b.bump(ey - b.y);
    return { x: sx, y: sy, width: ex - sx, height: ey - sy };
  }

  /** v12 wraps a fragment's titles, in brackets, to the fragment's reach. */
  private titleOf(label: string, s: SequenceFragment): MeasuredLabel | undefined {
    const reach = this.geometry.reach.get(s);
    if (label === '' || !reach) return undefined;
    const { m } = this.env;
    // In cells the frame grows to hold its title instead: a title wrapped to a narrow reach
    // would break inside its words.
    const max = m.cells ? Infinity : Math.max(reach.width - 2 * m.wrapPadding, m.labelBoxWidth);
    // v12 skips a title that is empty once read (`loop </style>`), rather than drawing `[]`.
    const read = this.env.measure(label, this.env.fonts.message, Infinity);
    if (read.lines.every((line) => line.every((run) => run.text.trim() === ''))) return undefined;
    return this.env.measure(`[${label}]`, this.env.fonts.message, max);
  }

  private fragment(s: SequenceFragment): void {
    const { b, env } = this;
    const { m } = env;
    const depth = b.frames.length;
    const titleRoom = (t: MeasuredLabel | undefined): number =>
      t ? Math.max(t.height, m.labelBoxHeight) : 0;
    b.bump(m.boxMargin.y);
    const frame = b.open();
    const title = this.titleOf(s.sections[0]?.label ?? '', s);
    b.bump(m.boxMargin.y + m.boxTextMargin.y + titleRoom(title));
    const index = this.fragments.length;
    this.fragments.length++;
    const sections: { ast?: AstId; y: number; text?: MeasuredLabel }[] = [];
    s.sections.forEach((section, i) => {
      if (i > 0) {
        b.bump(m.boxMargin.y + m.boxTextMargin.y);
        const text = this.titleOf(section.label, s);
        sections.push({ ...(section.ast !== undefined ? { ast: section.ast } : {}), y: b.y, text });
        b.bump(m.boxMargin.y + titleRoom(text));
      }
      this.statements(section.statements);
    });
    const kind = env.measure(TAB[s.fragment], env.fonts.message, Infinity);
    const tab = {
      width: Math.max(m.labelBoxWidth, kind.width + 2 * m.boxTextMargin.x),
      height: Math.max(m.labelBoxHeight, kind.height) + m.labelBoxExtra,
    };
    // The frame is wide enough for its title right of the tab and for each section label,
    // with room for its sides in cells.
    const slack = m.frameLabelSlack;
    const labels = sections.map((sec) => (sec.text ? sec.text.width + slack : 0));
    const minWidth = Math.max(
      tab.width,
      title ? title.width + m.labelBoxWidth + slack : 0,
      ...labels
    );
    const textY = (y: number): number => y + m.boxMargin.y + m.boxTextMargin.y;
    // And tall enough for its tab, title and section labels, which v12 let an empty last
    // section's label hang below.
    const bottom = Math.max(
      frame.starty + tab.height,
      title ? textY(frame.starty) + title.height : 0,
      ...sections.map((sec) => (sec.text ? textY(sec.y) + sec.text.height : 0))
    );
    const r = this.closeFrame(frame, minWidth, bottom);
    this.fragments[index] = {
      ast: s.ast,
      kind: s.fragment,
      depth,
      ...r,
      tab: { x: r.x, y: r.y, ...tab, text: kind },
      ...(title
        ? {
            title: placed(
              title,
              this.inFrame(
                r,
                r.x + m.half(m.labelBoxWidth) + m.half(r.width) - m.half(title.width),
                title.width
              ),
              textY(r.y)
            ),
          }
        : {}),
      sections: sections.map((sec) => ({
        ...(sec.ast !== undefined ? { ast: sec.ast } : {}),
        y: sec.y,
        ...(sec.text
          ? {
              label: placed(
                sec.text,
                this.inFrame(r, r.x + m.half(r.width - sec.text.width), sec.text.width),
                textY(sec.y)
              ),
            }
          : {}),
      })),
    };
  }

  /** A frame label's x, moved clear of the box borders inside the frame (cells only). */
  private inFrame(r: Rect, x: number, w: number): number {
    return clearOf(this.borders, x, w, [r.x + 1, r.x + r.width]);
  }

  private rect(s: SequenceRect): void {
    const { b } = this;
    const { m } = this.env;
    const depth = b.frames.length;
    b.bump(m.boxMargin.y);
    const frame = b.open();
    b.bump(m.boxMargin.y);
    const index = this.rects.length;
    this.rects.length++;
    this.statements(s.statements);
    const r = this.closeFrame(frame, 0, frame.starty);
    this.rects[index] = { ast: s.ast, color: s.color, depth, ...r };
  }
}
