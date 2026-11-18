/**
 * Statement-boundary recovery (R-PARSE-4): after reporting an error, a parser skips to the
 * next boundary (newline, `;`, `end`, … as the diagram defines) and carries on, so N
 * independent errors give N diagnostics.
 */
import type { KindSet, TokenCursor } from './cursor.js';
import type { Range } from './positions.js';
import { Kind } from './tokens.js';

/**
 * Advance `cursor` to the first token whose kind is in `boundaries` (or EOF), without
 * consuming it. Returns the source range skipped over (empty when already at a boundary).
 */
export function syncTo(cursor: TokenCursor, boundaries: KindSet): Range {
  cursor.recovering();
  const start = cursor.start;
  let end = start;
  while (cursor.kind !== Kind.EOF && boundaries[cursor.kind] !== 1) {
    end = cursor.end;
    cursor.next();
  }
  return { start, end };
}
