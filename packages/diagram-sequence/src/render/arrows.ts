// Messages: the line or self loop, its arrowheads as inline paths (no `<marker>`, so no ids),
// the central-connection circles and the sequence number badge. The head shapes are v12's
// marker paths (`svgDraw.js` `insertArrowHead` and friends), placed and turned in JS the way
// the browser placed the markers: `refX`/`refY` on the line end, the marker's x axis along the
// line, scaled by the line's stroke width where v12's marker used `markerUnits="strokeWidth"`.
import type { Attrs, Paint, SafeValue, SvgWriter } from '@mermaid-js/core/v13/svg/index.js';
import { ARROW_HEADS, type ArrowHead, type ArrowKind } from '../model.js';
import type { MessageLayout, ParticipantLayout, SequenceMetrics } from '../layout/index.js';
import { REVERSE_ARROWS } from '../layout/index.js';

type Point = readonly [number, number];

/** One v12 marker: its outline (or strokes), its reference point and its scale. */
interface HeadShape {
  /** Polygons (filled) or polylines (stroked), in marker units. */
  readonly paths: readonly (readonly Point[])[];
  readonly ref: Point;
  readonly scale: number;
  readonly stroked: boolean;
  /** Stroke width in user units, for stroked heads and the outline of a filled one. */
  readonly strokeWidth?: number;
}

/** The message line's width (v12 `.messageLine0/1`), which strokeWidth markers scale with. */
export const MESSAGE_STROKE = 1.5;
const DOTTED = '3, 3' as SafeValue;
/** v12's curved self message: its second control point is 1.5 drops below the start. */
const SELF_CURVE_C2_DROP = 1.5;
/** v12 `drawSequenceNumber`: the text shrinks past 3, then past 5 characters. */
const NUMBER_LENGTHS = { short: 3, medium: 5 } as const;

const HEADS = {
  // `-arrowhead`, markerUnits userSpaceOnUse; v12 CSS fills and strokes it in signalColor.
  arrow: {
    paths: [
      [
        [-1, 0],
        [10, 5],
        [0, 10],
      ],
    ],
    ref: [7.9, 5],
    scale: 1,
    stroked: false,
    strokeWidth: 1,
  },
  // `-filled-head` (`-)`), markerUnits strokeWidth.
  open: {
    paths: [
      [
        [18, 7],
        [9, 13],
        [14, 7],
        [9, 1],
      ],
    ],
    ref: [15.5, 7],
    scale: MESSAGE_STROKE,
    stroked: false,
  },
  // `-crosshead` (`-x`), markerUnits strokeWidth, stroked 1pt.
  cross: {
    paths: [
      [
        [1, 2],
        [6, 7],
      ],
      [
        [6, 2],
        [1, 7],
      ],
    ],
    ref: [4, 4.5],
    scale: MESSAGE_STROKE,
    stroked: true,
    strokeWidth: (4 / 3) * MESSAGE_STROKE,
  },
  solidTop: {
    paths: [
      [
        [0, 0],
        [10, 8],
        [0, 8],
      ],
    ],
    ref: [7.9, 7.25],
    scale: 1,
    stroked: false,
  },
  solidBottom: {
    paths: [
      [
        [0, 0],
        [10, 0],
        [0, 8],
      ],
    ],
    ref: [7.9, 0.75],
    scale: 1,
    stroked: false,
  },
  stickTop: {
    paths: [
      [
        [0, 0],
        [7, 7],
      ],
    ],
    ref: [7.5, 7],
    scale: 1,
    stroked: true,
    strokeWidth: 1.5,
  },
  stickBottom: {
    paths: [
      [
        [0, 7],
        [7, 0],
      ],
    ],
    ref: [7.5, 0],
    scale: 1,
    stroked: true,
    strokeWidth: 1.5,
  },
} satisfies Record<ArrowHead, HeadShape>;

const isDotted = (arrow: ArrowKind): boolean => arrow.includes('dotted');
const isBidirectional = (arrow: ArrowKind): boolean => arrow.startsWith('bidirectional');

/** `points` in a marker's units, placed with `ref` on `at` and turned by `angle` radians. */
export function placePoints(
  points: readonly Point[],
  ref: Point,
  scale: number,
  at: Point,
  angle: number
): number[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const out: number[] = [];
  for (const [px, py] of points) {
    const dx = (px - ref[0]) * scale;
    const dy = (py - ref[1]) * scale;
    out.push(at[0] + dx * cos - dy * sin, at[1] + dx * sin + dy * cos);
  }
  return out;
}

function drawHead(w: SvgWriter, name: ArrowHead, at: Point, angle: number, paint: Paint): void {
  const head: HeadShape = HEADS[name];
  for (const path of head.paths) {
    const points = placePoints(path, head.ref, head.scale, at, angle);
    if (head.stroked)
      w.leaf('polyline', {
        class: 'arrowhead',
        points,
        fill: 'none',
        stroke: paint,
        'stroke-width': head.strokeWidth,
      });
    else
      w.leaf('polygon', {
        class: 'arrowhead',
        points,
        fill: paint,
        stroke: head.strokeWidth === undefined ? undefined : paint,
        'stroke-width': head.strokeWidth,
      });
  }
}

/** The renderer's lengths from the sequence metrics table (px). */
export type DrawMetrics = Pick<
  SequenceMetrics,
  | 'numberRadius'
  | 'numberBaseline'
  | 'numberFontSizes'
  | 'numberShift'
  | 'numberSelfShift'
  | 'numberCentralShift'
  | 'numberCentralFromShift'
  | 'numberCentralReverseShift'
  | 'centralRadius'
  | 'centralNumberOffset'
>;

export interface MessagePaint {
  readonly line: Paint;
  readonly text: Paint;
  readonly number?: { readonly fill: Paint; readonly text: Paint };
}

/**
 * The x a line starts and ends at, moved clear of a sequence number as v12 `drawMessage`
 * moved it, central connections included.
 */
function lineEnds(m: MessageLayout, d: DrawMetrics): [number, number] {
  let x1 = m.startX;
  let x2 = m.stopX;
  if (!m.number || m.self) return [x1, x2];
  // A circle at the line's start: v12 `CENTRAL_CONNECTION_REVERSE` and `_DUAL`.
  const fromCircle = m.central === 'from' || m.central === 'both';
  if (isBidirectional(m.arrow)) {
    if (x1 < x2) x1 += 2 * d.numberShift;
    else {
      x1 -= d.numberShift + (m.central ? d.numberCentralShift : 0);
      if (fromCircle) x1 -= d.numberCentralFromShift;
    }
  } else if (REVERSE_ARROWS.has(m.arrow)) {
    if (x2 > x1) x2 -= 2 * d.numberShift;
    else {
      x2 -= d.numberShift;
      if (fromCircle) x1 -= d.numberCentralFromShift;
    }
    if (m.central) x2 += d.numberCentralReverseShift;
  } else x1 += d.numberShift;
  return [x1, x2];
}

/** The line (or self loop) and its heads. */
export function drawMessageLine(
  w: SvgWriter,
  m: MessageLayout,
  rightAngles: boolean,
  paint: MessagePaint,
  d: DrawMetrics
): void {
  const lineAttrs: Attrs = {
    class: isDotted(m.arrow) ? 'messageLine1' : 'messageLine0',
    fill: 'none',
    stroke: paint.line,
    'stroke-width': MESSAGE_STROKE,
    'stroke-dasharray': isDotted(m.arrow) ? DOTTED : undefined,
  };
  const { start, end } = ARROW_HEADS[m.arrow];
  if (m.self) {
    const y = m.y;
    const x = m.startX;
    const x0 =
      x + (m.number && (start !== undefined || isBidirectional(m.arrow)) ? d.numberSelfShift : 0);
    const { right, bottom } = m.self;
    const p = w.path().moveTo(x0, y);
    let endAngle: number;
    let startAngle: number;
    if (rightAngles) {
      p.lineTo(right, y).lineTo(right, bottom).lineTo(x, bottom);
      endAngle = Math.PI;
      startAngle = Math.PI;
    } else {
      // v12: `C x+60,y-10 x+60,y+30 x,y+20`, with the reach and drop from the layout.
      const drop = bottom - y;
      const c1: Point = [x0 + (right - x), y - drop / 2];
      const c2: Point = [right, y + drop * SELF_CURVE_C2_DROP];
      p.curveTo(c1[0], c1[1], c2[0], c2[1], x, bottom);
      endAngle = Math.atan2(bottom - c2[1], x - c2[0]);
      startAngle = Math.atan2(c1[1] - y, c1[0] - x0) + Math.PI;
    }
    w.leaf('path', { ...lineAttrs, d: p.done() });
    if (end) drawHead(w, end, [x, bottom], endAngle, paint.line);
    if (start) drawHead(w, start, [x0, y], startAngle, paint.line);
    return;
  }
  const [x1, x2] = lineEnds(m, d);
  w.leaf('line', { ...lineAttrs, x1, y1: m.y, x2, y2: m.y });
  const angle = x2 >= x1 ? 0 : Math.PI;
  if (end) drawHead(w, end, [x2, m.y], angle, paint.line);
  if (start) drawHead(w, start, [x1, m.y], angle + Math.PI, paint.line);
}

/** Central connection circles `()` on the lifelines (v12 `drawCentralConnection`). */
export function drawCentral(
  w: SvgWriter,
  m: MessageLayout,
  columns: ReadonlyMap<string, ParticipantLayout>,
  fill: Paint,
  d: DrawMetrics
): void {
  if (!m.central) return;
  const from = columns.get(m.from);
  const to = columns.get(m.to);
  if (!from || !to) return;
  let fromX = from.lifeline.x;
  let toX = to.lifeline.x;
  const ltr = fromX <= toX;
  const reverse = REVERSE_ARROWS.has(m.arrow);
  const offset = ltr ? d.centralNumberOffset : -d.centralNumberOffset;
  if (m.number) {
    if (m.central === 'to' && reverse) toX -= offset;
    if (m.central === 'from' && !reverse) fromX += offset;
    if (m.central === 'both') {
      if (reverse) toX -= offset;
      else fromX += offset;
    }
  }
  const circle = (cx: number): void =>
    w.leaf('circle', { class: 'centralConnection', cx, cy: m.y, r: d.centralRadius, fill });
  if (m.central === 'from' || m.central === 'both') circle(fromX);
  if (m.central === 'to' || m.central === 'both') circle(toX);
}

/** The autonumber badge: a filled circle and the number (v12 `-sequencenumber` marker). */
export function drawNumber(
  w: SvgWriter,
  m: MessageLayout,
  paint: MessagePaint,
  d: DrawMetrics
): void {
  if (!m.number || !paint.number) return;
  const { value, x } = m.number;
  const text = String(value);
  const [short, medium, long] = d.numberFontSizes;
  let size = short;
  if (text.length > NUMBER_LENGTHS.medium) size = long;
  else if (text.length > NUMBER_LENGTHS.short) size = medium;
  w.leaf('circle', {
    class: 'sequenceNumberCircle',
    cx: x,
    cy: m.y,
    r: d.numberRadius,
    fill: paint.number.fill,
  });
  w.open('text', {
    class: 'sequenceNumber',
    x,
    y: m.y + d.numberBaseline,
    'font-size': size,
    'text-anchor': 'middle',
    fill: paint.number.text,
  });
  w.text(text);
  w.close();
}
