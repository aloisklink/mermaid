import { CR, LF } from './char-codes.js';
/**
 * Scanner helpers for hand-written lexers. Everything here runs in time linear in the text
 * it consumes. Regexes must be sticky (`/y`): they match at one offset and never search
 * ahead. Regexes on user input must also pass the `mermaid/no-nested-quantifier` lint
 * (R-PARSE-7).
 *
 * A sticky regex's `lastIndex` is set on every call, so a module-level regex constant holds
 * no state that carries over between calls or parses.
 */

function sticky(re: RegExp, at: number): RegExp {
  if (!re.sticky) throw new TypeError(`Scanner: regex ${String(re)} needs the sticky (y) flag`);
  re.lastIndex = at;
  return re;
}

/** Match `re` exactly at `at`. Returns the match, or null. */
export function execAt(re: RegExp, src: string, at: number): RegExpExecArray | null {
  return sticky(re, at).exec(src);
}

/** Match `re` exactly at `at`. Returns the end offset of the match, or -1. */
export function matchAt(re: RegExp, src: string, at: number): number {
  return sticky(re, at).test(src) ? re.lastIndex : -1;
}

/** First offset at or after `at` whose char code fails `pred` (or `src.length`). */
export function scanWhile(src: string, at: number, pred: (code: number) => boolean): number {
  let i = at;
  while (i < src.length && pred(src.charCodeAt(i))) i++;
  return i;
}

/** Offset of the next `\n` or `\r` at or after `at` (or `src.length`). */
export function lineEnd(src: string, at: number): number {
  let i = at;
  while (i < src.length) {
    const c = src.charCodeAt(i);
    if (c === LF || c === CR) break;
    i++;
  }
  return i;
}

/** Length of the line break at `at`: 2 for `\r\n`, 1 for `\n` or `\r`, else 0. */
export function newlineAt(src: string, at: number): 0 | 1 | 2 {
  const c = src.charCodeAt(at);
  if (c === LF) return 1;
  if (c !== CR) return 0;
  return src.charCodeAt(at + 1) === LF ? 2 : 1;
}
