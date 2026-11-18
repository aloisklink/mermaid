/**
 * What every step of the sequence layout shares: the metrics, the fonts, the resolved options
 * and the columns, plus small helpers.
 */
import type { SequenceDiagramConfig } from '@mermaid-js/core/v13/config/index.js';
import type { RenderContext } from '@mermaid-js/core/v13/index.js';
import { checkStyle } from '@mermaid-js/core/v13/svg/index.js';
import {
  fontSizePx,
  layoutLabel,
  type FontKey,
  type MeasuredLabel,
} from '@mermaid-js/core/v13/text/index.js';
import {
  ARROW_HEADS,
  type ArrowHead,
  type ArrowKind,
  type SequenceMessage,
  type SequenceModel,
  type SequenceParticipant,
  type SequenceStatement,
} from '../model.js';
import { FONT_WEIGHT, sequenceMetrics, type SequenceMetrics } from './metrics.js';
import type { PlacedLabel } from './types.js';
import { fontWeightOf as weightOf } from '@mermaid-js/core/v13/shared/config/readers.js';

/** What the layout reads from the render context. */
export type SequenceLayoutContext = Pick<
  RenderContext,
  'config' | 'measurer' | 'units' | 'theme' | 'warn' | 'inline'
>;

/**
 * Deprecated alias of core's `MATH_NOT_RENDERED` (D176), raised for one alpha next to it (or next
 * to `ASCII_DROPPED` for math, in text output) when a label's `$$…$$` is shown as written. Not for
 * TeX a provider refused (`MATH_ERROR`) or a placeholder render (`PLACEHOLDER`). Sequence's own
 * math warning before core drew math (D105).
 */
export const SEQUENCE_MATH = {
  code: 'SEQUENCE_MATH',
  message:
    'SEQUENCE_MATH is deprecated and goes in the next alpha: read MATH_NOT_RENDERED (or ASCII_DROPPED in text output). Math ($$…$$) is shown as written.',
} as const;

/** Whether a label shows a `$$…$$` pair as written: in any run but its inline boxes. */
function showsMath(label: MeasuredLabel): boolean {
  const text = label.lines
    .map((line) => line.map((r) => (r.kind === 'box' ? '' : r.text)).join(''))
    .join('\n');
  const at = text.indexOf('$$');
  return at >= 0 && text.includes('$$', at + 2);
}

export interface Fonts {
  readonly actor: FontKey;
  readonly message: FontKey;
  readonly note: FontKey;
  readonly title: FontKey;
}

/** One participant's column while the layout runs. */
export interface Column {
  readonly p: SequenceParticipant;
  readonly label: MeasuredLabel;
  readonly width: number;
  height: number;
  /** The gap after the column. */
  margin: number;
  x: number;
  top: number;
  /** Top of its bottom box when it is destroyed. */
  stopy?: number;
  visible: boolean;
}

export interface Env {
  readonly m: SequenceMetrics;
  readonly fonts: Fonts;
  readonly seq: Readonly<SequenceDiagramConfig>;
  /** `wrap` config: labels wrap unless they say `nowrap:`. */
  readonly autoWrap: boolean;
  readonly mirror: boolean;
  /** `rightAngles` config; in cells every self loop is square, so it is not read there. */
  readonly rightAngles: boolean;
  /** The sequence number of each numbered message (v12 `autonumber`, `showSequenceNumbers`). */
  readonly numbers: ReadonlyMap<SequenceMessage, number>;
  /**
   * The text a message's label is measured and drawn from: its own, and in cells its sequence
   * number in front (`1. Hello`), which SVG draws in a badge on the line instead.
   */
  messageText(s: SequenceMessage): string;
  readonly columns: ReadonlyMap<string, Column>;
  /** Participant ids in declaration order, hidden ones included: v12's neighbours. */
  readonly order: readonly string[];
  /** Each id's place in `order`. */
  readonly index: ReadonlyMap<string, number>;
  /** The render's warning sink. */
  readonly warn: SequenceLayoutContext['warn'];
  measure(text: string, font: FontKey, max: number): MeasuredLabel;
}

const kindsWhere = (
  test: (h: (typeof ARROW_HEADS)[ArrowKind]) => boolean
): ReadonlySet<ArrowKind> =>
  new Set((Object.keys(ARROW_HEADS) as ArrowKind[]).filter((k) => test(ARROW_HEADS[k])));
const isStick = (h: ArrowHead | undefined): boolean => h === 'stickTop' || h === 'stickBottom';

// Arrows whose end needs no room for a head (v12 `buildMessageModel`): no end head, or a
// stick one.
export const NO_HEAD_GAP = kindsWhere((h) => h.end === undefined || isStick(h.end));
// Arrows with a head at the start as well, other than a stick one.
export const START_GAP = kindsWhere((h) => h.start !== undefined && !isStick(h.start));
export const BIDIRECTIONAL = kindsWhere((h) => h.start !== undefined && h.end !== undefined);
/** Arrows whose head is drawn at the start (`…_reverse…`). */
export const REVERSE_ARROWS = kindsWhere((h) => h.start !== undefined && h.end === undefined);

/**
 * The fonts labels are measured in, and so drawn in (the renderer reads them too). A per-key
 * family the style check refuses falls back to the Mermaid font, with a warning when `warn`
 * is given (the layout passes it, so it is raised once per render).
 */
export function fontsOf(
  ctx: Pick<SequenceLayoutContext, 'config' | 'theme'>,
  warn?: SequenceLayoutContext['warn']
): Fonts {
  const seq = (ctx.config.sequence ?? {}) as Readonly<Record<string, unknown>>;
  const family = ctx.theme.value('fontFamily');
  const size = ctx.theme.number('fontSize');
  // Family keys inherit the Mermaid font; size and weight keys apply when set.
  const font = (prefix: string): FontKey => {
    const key = `${prefix}FontFamily`;
    const f = seq[key];
    let safe: string | undefined;
    if (typeof f === 'string' && f.trim() !== '') {
      safe = checkStyle(['font-family:' + f]).text['font-family'] as string | undefined;
      if (safe === undefined)
        warn?.({
          code: 'STYLE_VALUE_DROPPED',
          message: `Dropped sequence.${key} ${JSON.stringify(f)}: it is not a font family Mermaid allows`,
          path: `sequence.${key}`,
        });
    }
    const s = fontSizePx(seq[`${prefix}FontSize`], size);
    return {
      family: safe ?? family,
      size: s !== undefined && s > 0 ? s : size,
      weight: weightOf(seq[`${prefix}FontWeight`], FONT_WEIGHT.bold, FONT_WEIGHT.normal),
    };
  };
  return {
    actor: font('actor'),
    message: font('message'),
    note: font('note'),
    title: { family, size, weight: FONT_WEIGHT.normal },
  };
}

const orKeep = (v: number | undefined, current: number): number =>
  v === undefined || v === 0 || Number.isNaN(v) ? current : v;

/**
 * v12's message numbers: from 1 by 1, restarted by `autonumber [start [step]]`, shown while
 * `autonumber` (or `showSequenceNumbers`) is on. A message naming an undeclared participant
 * still takes its number (rows.ts leaves it out).
 */
export function sequenceNumbers(
  statements: readonly SequenceStatement[],
  seq: Readonly<SequenceDiagramConfig>
): Map<SequenceMessage, number> {
  const out = new Map<SequenceMessage, number>();
  let index = 1;
  let step = 1;
  let shown = seq.showSequenceNumbers === true;
  for (const s of walk(statements)) {
    if (s.kind === 'autonumber') {
      index = orKeep(s.start, index);
      // v12: `autonumber N` restarts the step at 1.
      step = orKeep(s.step ?? (s.start === undefined ? undefined : 1), step);
      shown = s.visible || seq.showSequenceNumbers === true;
    } else if (s.kind === 'message') {
      if (shown) out.set(s, index);
      // v12 rounds to two decimals against floating point drift.
      index = Math.round((index + step) * 100) / 100;
    }
  }
  return out;
}

/** The shared state of one layout, before the columns are measured. */
export function envOf(ctx: SequenceLayoutContext, model: SequenceModel): Omit<Env, 'columns'> {
  const seq = ctx.config.sequence ?? {};
  const { participants } = model;
  const m = sequenceMetrics(ctx.units, seq, ctx.theme);
  const numbers = sequenceNumbers(model.statements, seq);
  let mathShown = false;
  return {
    m,
    fonts: fontsOf(ctx, (w) => ctx.warn(w)),
    seq,
    autoWrap: ctx.config.wrap === true || seq.wrap === true,
    mirror: seq.mirrorActors !== false,
    rightAngles: !m.cells && seq.rightAngles === true,
    numbers,
    messageText: (s) => {
      const n = m.cells ? numbers.get(s) : undefined;
      if (n === undefined) return s.text;
      return s.text === '' ? `${n}.` : `${n}. ${s.text}`;
    },
    order: participants.map((p) => p.id),
    index: new Map(participants.map((p, i) => [p.id, i])),
    warn: (w) => ctx.warn(w),
    measure: (text, font, max) => {
      // v12 sequence broke a label at `<br>` only: a written `\n` is text (#763, D564).
      const label = layoutLabel(text, font, max > 0 ? max : 1, ctx.measurer, {
        backslashBreak: false,
        inline: ctx.inline,
      });
      if (!mathShown && showsMath(label) && ctx.inline?.notRendered('math') === true) {
        mathShown = true;
        ctx.warn({ ...SEQUENCE_MATH });
      }
      return label;
    },
  };
}

const neighbour = (env: Env, id: string, step: number): string | undefined => {
  const i = env.index.get(id);
  return i === undefined ? undefined : env.order[i + step];
};
export const prevOf = (env: Env, id: string): string | undefined => neighbour(env, id, -1);
export const nextOf = (env: Env, id: string): string | undefined => neighbour(env, id, 1);

/** The x of a column's lifeline. */
export const centerOf = (env: Env, c: Column): number => c.x + env.m.half(c.width);

/** Each statement, depth first, in source order. */
export function* walk(statements: readonly SequenceStatement[]): Generator<SequenceStatement> {
  for (const s of statements) {
    yield s;
    if (s.kind === 'fragment') for (const section of s.sections) yield* walk(section.statements);
    else if (s.kind === 'rect') yield* walk(s.statements);
  }
}

/** The x of a label of width `w` aligned in the span `lo`…`hi`, `pad` in from its sides. */
export function alignX(
  env: Env,
  align: unknown,
  span: readonly [number, number],
  w: number,
  pad: number
): number {
  const [lo, hi] = span;
  if (align === 'left') return lo + pad;
  if (align === 'right') return hi - pad - w;
  return lo + env.m.half(hi - lo - w);
}

export const placed = (text: MeasuredLabel, x: number, y: number): PlacedLabel => ({
  x,
  y,
  width: text.width,
  height: text.height,
  text,
});
