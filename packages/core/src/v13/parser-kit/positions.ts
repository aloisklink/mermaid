import { CR, LF } from './char-codes.js';
/**
 * Source positions. All kit ranges are offsets into the original source (nothing is ever
 * rewritten, DESIGN §4.1), including front matter and directives. `LineIndex` converts
 * offsets to the 0-based line/column pairs editors use, and back.
 */

/** Half-open range `[start, end)` of UTF-16 offsets into the original source. */
export interface Range {
  start: number;
  end: number;
}

/** 0-based line and UTF-16 column, as in LSP. */
export interface Position {
  line: number;
  column: number;
}

/** Line table for one source text. `\r\n`, `\n` and `\r` each end a line. */
export class LineIndex {
  private readonly starts: number[] = [0];

  constructor(private readonly src: string) {
    for (let i = 0; i < src.length; i++) {
      const c = src.charCodeAt(i);
      if (c === CR && src.charCodeAt(i + 1) === LF) i++;
      if (c === LF || c === CR) this.starts.push(i + 1);
    }
  }

  get lineCount(): number {
    return this.starts.length;
  }

  /** Line and column of `offset` (clamped to the source). */
  position(offset: number): Position {
    const at = Math.max(0, Math.min(offset, this.src.length));
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.starts[mid] ?? 0) <= at) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, column: at - (this.starts[lo] ?? 0) };
  }

  /** Offset of `line`/`column`. A column past the line's end clamps to it (before the break). */
  offset(line: number, column: number): number {
    if (line >= this.starts.length) return this.src.length;
    const start = this.starts[Math.max(0, line)] ?? 0;
    let end = this.starts[line + 1] ?? this.src.length;
    if (line + 1 < this.starts.length) {
      end -= this.src.charCodeAt(end - 2) === CR && this.src.charCodeAt(end - 1) === LF ? 2 : 1;
    }
    return Math.min(start + Math.max(0, column), end);
  }
}
