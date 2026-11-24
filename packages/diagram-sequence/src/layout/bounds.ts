/**
 * The running bounds of the sequence layout: v12's `bounds` object (sequenceRenderer.ts) without
 * its drawing. The vertical position moves down statement by statement; every inserted box grows
 * the drawing's extent and each open frame, the outermost frame by the most `boxMargin`s, so that
 * nested frames keep a margin between them.
 */
import type { XY } from './metrics.js';

export interface Extent {
  startx?: number;
  stopx?: number;
  starty?: number;
  stopy?: number;
}

/** A frame (fragment or `rect`) while it is open. */
export interface OpenFrame extends Extent {
  starty: number;
}

const lower = (a: number | undefined, b: number): number => (a === undefined ? b : Math.min(a, b));
const upper = (a: number | undefined, b: number): number => (a === undefined ? b : Math.max(a, b));

export class Bounds {
  readonly data: Extent = {};
  readonly frames: OpenFrame[] = [];
  y = 0;

  constructor(private readonly margin: XY) {}

  /** Grows the drawing and every open frame to hold the box. */
  insert(x1: number, y1: number, x2: number, y2: number): void {
    const sx = Math.min(x1, x2);
    const ex = Math.max(x1, x2);
    const sy = Math.min(y1, y2);
    const ey = Math.max(y1, y2);
    const d = this.data;
    this.grow(d, sx, sy, ex, ey);
    const count = this.frames.length;
    this.frames.forEach((frame, i) => {
      const nx = (count - i) * this.margin.x;
      const ny = (count - i) * this.margin.y;
      this.grow(frame, sx - nx, sy - ny, ex + nx, ey + ny);
      this.grow(d, sx - nx, sy - ny, ex + nx, ey + ny);
    });
  }

  /** Moves the vertical position down. */
  bump(dy: number): void {
    this.y += dy;
    this.data.stopy = upper(this.data.stopy, this.y);
  }

  open(): OpenFrame {
    const frame: OpenFrame = { starty: this.y };
    this.frames.push(frame);
    return frame;
  }

  close(): OpenFrame | undefined {
    return this.frames.pop();
  }

  private grow(e: Extent, sx: number, sy: number, ex: number, ey: number): void {
    e.startx = lower(e.startx, sx);
    e.starty = lower(e.starty, sy);
    e.stopx = upper(e.stopx, ex);
    e.stopy = upper(e.stopy, ey);
  }
}
