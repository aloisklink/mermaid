/**
 * Path data built from numbers, so a `d` attribute never carries free text.
 */
import { num } from './escape.js';
import type { PathData, Transform } from './types.js';

export interface PathBuilder {
  moveTo(x: number, y: number): PathBuilder;
  lineTo(x: number, y: number): PathBuilder;
  /** Cubic Bézier to (x, y) with control points (x1, y1) and (x2, y2). */
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): PathBuilder;
  /** Quadratic Bézier to (x, y) with control point (x1, y1). */
  quadTo(x1: number, y1: number, x: number, y: number): PathBuilder;
  arcTo(
    rx: number,
    ry: number,
    rotation: number,
    large: boolean,
    sweep: boolean,
    x: number,
    y: number
  ): PathBuilder;
  close(): PathBuilder;
  /** The path data written so far. */
  done(): PathData;
}

/**
 * The last few values this module built (path data from `done()`, and `translate`, `rotate`,
 * `scale`), so the stream writer can tell a value it need not escape (`isBuilt`). Each is made
 * only of `num()` output (digits, `.`, `-`, `e`/`+` for huge numbers, and `Infinity` for finite
 * values above about 1.8e306, whose hundredths overflow), command letters, commas, spaces and
 * parentheses. Module-private: only this module writes it, and only with strings it built from
 * numbers. `transforms()` must never be recorded: it joins strings its caller supplies (the
 * writer passes a caller's `transform` through it for boxed labels).
 */
const BUILT: string[] = ['', '', '', ''];
let nextBuilt = 0;

function built<T extends string>(value: T): T {
  return (BUILT[(nextBuilt = (nextBuilt + 1) & 3)] = value);
}

/**
 * Whether `value` equals one of the last four values this module built from numbers, so
 * escaping would leave it unchanged. String equality compares content, so an equal string
 * from anywhere else is the same characters and just as safe.
 */
export function isBuilt(value: string): boolean {
  return BUILT.includes(value);
}

class Builder implements PathBuilder {
  // A private field: only this class's methods can append to it, and only from numbers.
  #d = '';
  moveTo(x: number, y: number): PathBuilder {
    this.#d += 'M' + num(x) + ',' + num(y);
    return this;
  }
  lineTo(x: number, y: number): PathBuilder {
    this.#d += 'L' + num(x) + ',' + num(y);
    return this;
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): PathBuilder {
    this.#d +=
      'C' + num(x1) + ',' + num(y1) + ' ' + num(x2) + ',' + num(y2) + ' ' + num(x) + ',' + num(y);
    return this;
  }
  quadTo(x1: number, y1: number, x: number, y: number): PathBuilder {
    this.#d += 'Q' + num(x1) + ',' + num(y1) + ' ' + num(x) + ',' + num(y);
    return this;
  }
  arcTo(
    rx: number,
    ry: number,
    rotation: number,
    large: boolean,
    sweep: boolean,
    x: number,
    y: number
  ): PathBuilder {
    this.#d +=
      'A' +
      num(rx) +
      ',' +
      num(ry) +
      ' ' +
      num(rotation) +
      ' ' +
      (large ? '1' : '0') +
      ',' +
      (sweep ? '1' : '0') +
      ' ' +
      num(x) +
      ',' +
      num(y);
    return this;
  }
  close(): PathBuilder {
    this.#d += 'Z';
    return this;
  }
  done(): PathData {
    return built(this.#d as PathData);
  }
}

export function pathBuilder(): PathBuilder {
  return new Builder();
}

export function translate(x: number, y: number): Transform {
  return built(`translate(${num(x)},${num(y)})` as Transform);
}

export function rotate(angle: number, cx?: number, cy?: number): Transform {
  return built(
    (cx === undefined || cy === undefined
      ? `rotate(${num(angle)})`
      : `rotate(${num(angle)},${num(cx)},${num(cy)})`) as Transform
  );
}

export function scale(sx: number, sy: number = sx): Transform {
  return built(`scale(${num(sx)},${num(sy)})` as Transform);
}

/** Several transforms applied in order, as one attribute value. */
export function transforms(...parts: readonly Transform[]): Transform {
  return parts.join(' ') as Transform;
}
