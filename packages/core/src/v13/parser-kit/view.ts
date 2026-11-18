/**
 * Index-addressed access to a token stream's significant tokens, for parsers that look back
 * (`i - 1`) or ahead (`i + 2`) as well as forward. {@link TokenCursor} is the forward-only form.
 */
import { TRIVIA } from './cursor.js';
import type { KindSet } from './cursor.js';
import { Kind } from './tokens.js';
import type { TokenStream } from './tokens.js';

/** Tokens as parallel arrays, like {@link TokenStream} without its source. */
export interface TokenView {
  readonly kind: Uint16Array;
  readonly start: Uint32Array;
  readonly end: Uint32Array;
  readonly length: number;
}

/**
 * The tokens of `stream` whose kind is not in `trivia`, in order. A stream with no trivia is
 * returned as it is, without copying.
 */
export function significantTokens(stream: TokenStream, trivia: KindSet = TRIVIA): TokenView {
  let count = 0;
  for (let j = 0; j < stream.length; j++) if (trivia[stream.kind[j] ?? Kind.EOF] === 1) count++;
  if (count === 0) return stream;
  const n = stream.length - count;
  const kind = new Uint16Array(n);
  const start = new Uint32Array(n);
  const end = new Uint32Array(n);
  let o = 0;
  for (let j = 0; j < stream.length; j++) {
    const k = stream.kind[j] ?? Kind.EOF;
    if (trivia[k] === 1) continue;
    kind[o] = k;
    start[o] = stream.start[j] ?? 0;
    end[o] = stream.end[j] ?? 0;
    o++;
  }
  return { kind, start, end, length: n };
}

/**
 * Statement-boundary recovery over a view (R-PARSE-4): the index of the first token at or after
 * `i` whose kind is in `boundaries`, or the view's length when none is.
 */
export function skipTo(view: TokenView, i: number, boundaries: KindSet): number {
  let j = i;
  while (j < view.length && boundaries[view.kind[j] ?? Kind.EOF] !== 1) j++;
  return j;
}
