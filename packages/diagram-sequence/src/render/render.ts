// Draws a laid-out sequence diagram through the SvgWriter (DESIGN §7, spec #125 T4). The
// layout (`layoutSequence`) placed everything; this file only paints it. Sections are drawn in
// v12's stacking order: participant boxes and `rect` blocks at the back, then participants with
// their lifelines, activations, fragment frames, notes and messages. Every element drawn from
// an AST node carries `data-id` and `data-ast` (R-PARSE-8); labels carry `data-id` only.
import type { RenderContext } from '@mermaid-js/core/v13/index.js';
import {
  checkColor,
  type Paint,
  type SafeValue,
  type SvgWriter,
} from '@mermaid-js/core/v13/svg/index.js';
import { centreX, centreY, openSvgRoot } from '@mermaid-js/core/v13/shared/svg/document.js';
import type { SequenceModel } from '../model.js';
import { sequenceMetrics, type SequenceMetrics } from '../layout/index.js';
import type {
  BoxLayout,
  FragmentLayout,
  ParticipantLayout,
  RectLayout,
  SequenceLayout,
} from '../layout/index.js';
import { drawCentral, drawMessageLine, drawNumber, type MessagePaint } from './arrows.js';
import { paints, type Paints } from './paint.js';
import { drawSymbol } from './symbols.js';

/** What the renderer reads from the render context. */
export type SequenceRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'warn' | 'idPrefix' | 'version' | 'units'
>;

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly model: SequenceModel;
  readonly layout: SequenceLayout;
  readonly ctx: SequenceRenderContext;
  readonly paint: Paints;
  readonly columns: ReadonlyMap<string, ParticipantLayout>;
  /** Each participant's declaration order: its palette slot. */
  readonly order: ReadonlyMap<string, number>;
  /** The sequence metrics in the render's units (px for SVG), as the layout read them. */
  readonly m: SequenceMetrics;
}

/** v12 `.loopLine`: 2px, dashed 2,2; sections dashed 3,3. */
const FRAME_STROKE = 2;
const FRAME_DASH = '2, 2' as SafeValue;
const SECTION_DASH = '3, 3' as SafeValue;
/** v12 `drawLabel`: the tab's cut corner. */
const TAB_CUT = 7;
const TAB_SLANT = 1.2;
/** v12 lifelines take the `line` CSS width (2px). */
const LIFELINE_STROKE = 2;

/** Writes the whole `<svg>` document for a laid-out sequence diagram. */
export function renderSequence(
  model: SequenceModel,
  layout: SequenceLayout,
  ctx: SequenceRenderContext,
  w: SvgWriter
): void {
  const scene: Scene = {
    w,
    model,
    layout,
    ctx,
    paint: paints(ctx, layout),
    columns: new Map(layout.participants.map((p) => [p.id, p])),
    order: new Map(model.participants.map((p, i) => [p.id, i])),
    m: sequenceMetrics(ctx.units, ctx.config.sequence, ctx.theme),
  };
  openRoot(scene);
  if (layout.boxes.length > 0) drawBoxes(scene);
  if (layout.rects.length > 0) drawRects(scene);
  drawParticipants(scene);
  if (layout.activations.length > 0) drawActivations(scene);
  if (layout.fragments.length > 0) drawFragments(scene);
  if (layout.notes.length > 0) drawNotes(scene);
  drawMessages(scene);
  if (layout.title && scene.paint.title)
    w.label(layout.title.text, centreX(layout.title), centreY(layout.title), {
      class: 'sequenceTitle',
      fill: scene.paint.title,
    });
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, model }: Scene): void {
  const { theme, config } = ctx;
  // Read before the root style is written, so it declares their aliases.
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  openSvgRoot(w, ctx, {
    name: 'sequence',
    viewBox: layout.bounds,
    maxWidth: config.sequence?.useMaxWidth !== false,
    title: model.accTitle,
    desc: model.accDescr,
    attrs: {
      'font-family': font,
      'font-size': fontSize,
    },
  });
}

/** An author colour (`rect`, `box`), checked; a refused one warns and takes `fallback`. */
function authorColor(scene: Scene, color: string, ast: string, fallback: Paint): Paint {
  if (color.trim() === '') return fallback;
  const safe = checkColor(color);
  if (safe) return safe;
  scene.ctx.warn({
    code: 'STYLE_VALUE_DROPPED',
    message: `Dropped the colour ${JSON.stringify(color)}: it is not a CSS colour Mermaid allows`,
    astIds: [ast],
  });
  return fallback;
}

/** `box` groups behind their participants (v12 `drawBox`). */
function drawBoxes(scene: Scene): void {
  const { w, layout, paint } = scene;
  const rect = paint.rect!;
  w.open('g', { class: 'boxes' });
  for (const box of layout.boxes) drawBox(scene, box, rect);
  w.close();
}

function drawBox(scene: Scene, box: BoxLayout, rect: NonNullable<Paints['rect']>): void {
  const { w, paint } = scene;
  w.open('g', { class: 'box', 'data-id': box.ast, 'data-ast': box.ast });
  w.leaf('rect', {
    class: 'rect',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fill: box.color === undefined ? 'none' : authorColor(scene, box.color, box.ast, 'none'),
    stroke: rect.stroke,
    filter: paint.shadow,
  });
  if (box.label)
    w.label(box.label.text, centreX(box.label), centreY(box.label), {
      class: 'text',
      'data-id': box.ast,
      fill: rect.text,
      ...paint.fonts.message,
    });
  w.close();
}

/** `rect` background blocks (v12 `drawBackgroundRect`). */
function drawRects(scene: Scene): void {
  const { w, layout } = scene;
  w.open('g', { class: 'rects' });
  for (const r of layout.rects) drawRect(scene, r);
  w.close();
}

function drawRect(scene: Scene, r: RectLayout): void {
  const { w, paint } = scene;
  const rect = paint.rect!;
  w.leaf('rect', {
    class: 'rect',
    'data-id': r.ast,
    'data-ast': r.ast,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    fill: authorColor(scene, r.color, r.ast, rect.fill),
    stroke: rect.stroke,
    filter: paint.shadow,
  });
}

/** Each participant: its lifeline, its top symbol and its mirrored bottom symbol. */
function drawParticipants(scene: Scene): void {
  const { w, layout, paint } = scene;
  w.open('g', { class: 'participants', ...paint.fonts.actor });
  for (const p of layout.participants) drawParticipant(scene, p);
  w.close();
}

function drawParticipant(scene: Scene, p: ParticipantLayout): void {
  const { w, paint } = scene;
  const tint = paint.slotOf(scene.order.get(p.id) ?? 0);
  w.open('g', {
    class: `participant participant-${p.kind}`,
    'data-id': p.id,
    'data-ast': p.ast,
    'data-color-id': tint?.id,
  });
  const { x, y1, y2 } = p.lifeline;
  if (y2 > y1)
    w.leaf('line', {
      class: 'actor-line',
      'data-id': p.id,
      x1: x,
      y1,
      x2: x,
      y2,
      stroke: paint.actor.line,
      'stroke-width': LIFELINE_STROKE,
    });
  const symbol = { w, p, paint: paint.actor, tint, shadow: paint.shadow, m: scene.m };
  drawSymbol({ ...symbol, y: p.top }, 'top');
  if (p.bottom !== undefined) drawSymbol({ ...symbol, y: p.bottom }, 'bottom');
  w.close();
}

/** Activation bars (v12 `drawActivation`): `activation0`–`2` by nesting depth. */
function drawActivations(scene: Scene): void {
  const { w, layout, paint } = scene;
  const a = paint.activation!;
  w.open('g', { class: 'activations' });
  for (const bar of layout.activations) {
    const tint = paint.slotOf(scene.order.get(bar.participant) ?? 0);
    w.leaf('rect', {
      class: `activation${bar.depth % 3}`,
      // An `activate` line's id, else the message whose `+` or `()` opened it.
      'data-id': bar.ast ?? bar.message ?? bar.participant,
      'data-ast': bar.ast,
      'data-color-id': tint?.id,
      x: bar.x,
      y: bar.y,
      width: bar.width,
      height: bar.height,
      // A bar covers its lifeline, so a border-only palette keeps an opaque fill (v12).
      fill: tint ? (tint.fill ?? a.opaque) : a.fill,
      stroke: tint?.stroke ?? a.stroke,
    });
  }
  w.close();
}

/** Fragment frames: a dashed border, the keyword tab, the title and section dividers. */
function drawFragments(scene: Scene): void {
  const { w, layout, paint } = scene;
  w.open('g', { class: 'fragments', ...paint.fonts.message });
  for (const f of layout.fragments) drawFragment(scene, f);
  w.close();
}

function drawFragment(scene: Scene, f: FragmentLayout): void {
  const { w, paint } = scene;
  const frame = paint.frame!;
  const line = {
    class: 'loopLine',
    stroke: frame.line,
    'stroke-width': FRAME_STROKE,
    'stroke-dasharray': FRAME_DASH,
  } as const;
  const x2 = f.x + f.width;
  const y2 = f.y + f.height;
  w.open('g', { class: `fragment fragment-${f.kind}`, 'data-id': f.ast, 'data-ast': f.ast });
  w.leaf('line', { ...line, x1: f.x, y1: f.y, x2, y2: f.y });
  w.leaf('line', { ...line, x1: x2, y1: f.y, x2, y2 });
  w.leaf('line', { ...line, x1: f.x, y1: y2, x2, y2 });
  w.leaf('line', { ...line, x1: f.x, y1: f.y, x2: f.x, y2 });
  const t = f.tab;
  const cut = Math.min(TAB_CUT, t.height, t.width / TAB_SLANT);
  w.leaf('polygon', {
    class: 'labelBox',
    points: [
      t.x,
      t.y,
      t.x + t.width,
      t.y,
      t.x + t.width,
      t.y + t.height - cut,
      t.x + t.width - cut * TAB_SLANT,
      t.y + t.height,
      t.x,
      t.y + t.height,
    ],
    fill: frame.tabFill,
    stroke: frame.line,
    filter: paint.shadow,
  });
  w.label(t.text, centreX(t), centreY(t), {
    class: 'labelText',
    'data-id': f.ast,
    fill: frame.tabText,
  });
  if (f.title)
    w.label(f.title.text, centreX(f.title), centreY(f.title), {
      class: 'loopText',
      'data-id': f.ast,
      fill: frame.title,
    });
  for (const section of f.sections) {
    const id = section.ast ?? f.ast;
    w.open('g', { class: 'loopSection', 'data-id': id, 'data-ast': section.ast });
    w.leaf('line', {
      ...line,
      'stroke-dasharray': SECTION_DASH,
      x1: f.x,
      y1: section.y,
      x2,
      y2: section.y,
    });
    if (section.label)
      w.label(section.label.text, centreX(section.label), centreY(section.label), {
        class: 'sectionTitle',
        'data-id': id,
        fill: frame.title,
      });
    w.close();
  }
  w.close();
}

/** Notes (v12 `drawNote`). */
function drawNotes(scene: Scene): void {
  const { w, layout, paint } = scene;
  const note = paint.note!;
  w.open('g', { class: 'notes', ...paint.fonts.note });
  for (const n of layout.notes) {
    w.open('g', { class: `note-${n.placement}`, 'data-id': n.ast, 'data-ast': n.ast });
    w.leaf('rect', {
      class: 'note',
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      fill: note.fill,
      stroke: note.stroke,
      filter: paint.shadow,
    });
    w.label(n.label.text, centreX(n.label), centreY(n.label), {
      class: 'noteText',
      'data-id': n.ast,
      fill: note.text,
    });
    w.close();
  }
  w.close();
}

/** Messages, with their labels, central connections and sequence numbers. */
function drawMessages(scene: Scene): void {
  const { w, layout, paint, ctx } = scene;
  const rightAngles = ctx.config.sequence?.rightAngles === true;
  const mp: MessagePaint = {
    line: paint.signal.line,
    text: paint.signal.text,
    number: paint.number,
  };
  w.open('g', { class: 'messages', ...paint.fonts.message });
  for (const m of layout.messages) {
    w.open('g', { class: 'message', 'data-id': m.ast, 'data-ast': m.ast });
    if (m.label)
      w.label(m.label.text, centreX(m.label), centreY(m.label), {
        class: 'messageText',
        'data-id': m.ast,
        fill: mp.text,
      });
    drawMessageLine(w, m, rightAngles, mp, scene.m);
    drawCentral(w, m, scene.columns, mp.line, scene.m);
    drawNumber(w, m, mp, scene.m);
    w.close();
  }
  w.close();
}
