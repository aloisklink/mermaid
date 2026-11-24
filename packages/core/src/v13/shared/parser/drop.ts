// Hole-drop helpers shared by every lexer family.
import { type Hole, QUOTE, SourceOffsets, type SourceView } from '../../parser-kit/index.js';

/**
 * The end of the character v12 dropped at `b` (a `drop` hole at or after `holes[from]`), which
 * belongs to the token before it; else `b`.
 */
export function dropAt(holes: readonly Hole[], from: number, b: number): number {
  let k = from;
  while (k < holes.length && (holes[k]?.start ?? b) < b) k++;
  const h = holes[k];
  return h && h.start === b && h.kind === 'drop' ? h.end : b;
}

/** The view's text with the tag-attribute quotes v12 turned into `'` turned so too. */
export function tagQuotes(view: SourceView): string {
  const { text, mask, runs } = view;
  if (!mask) return text;
  const at = runs ? new SourceOffsets(runs) : undefined;
  let out = '';
  let from = 0;
  for (let i = text.indexOf('"'); i !== -1; i = text.indexOf('"', i + 1)) {
    if (((mask[at ? at.source(i) : i] ?? 0) & QUOTE) === 0) continue;
    out += text.slice(from, i) + "'";
    from = i + 1;
  }
  return out + text.slice(from);
}
