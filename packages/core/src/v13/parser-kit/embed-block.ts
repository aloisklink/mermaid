/**
 * Embedded diagram blocks (ADR-15): the line rules every host lexer shares, on char codes.
 * Where an opener may start (first on its line, or after `;` in a flowchart) is the host's.
 */
import { CR, DQUOTE, LBRACE, LF, RBRACE } from './char-codes.js';
import { isBlank } from './chars.js';

/**
 * The `{` that ends the block opener at `p`, or -1 when the line there (ending at `end`) is no
 * opener: `mermaid`, a blank, then an id before the line's last `{`. Anything else
 * (`mermaid`, `mermaid["T"]`, `mermaid --> B`) is the host's own syntax.
 */
export function openerBrace(text: string, p: number, end: number): number {
  if (!text.startsWith('mermaid', p) || !isBlank(text.charCodeAt(p + 7))) return -1;
  let last = end - 1;
  while (last > p + 7 && isBlank(text.charCodeAt(last))) last--;
  if (text.charCodeAt(last) !== LBRACE) return -1;
  let id = p + 7;
  while (id < last && isBlank(text.charCodeAt(id))) id++;
  return id === last ? -1 : last;
}

/**
 * Whether the line `text[a, e)` ends in a `{` outside a `"…"` string, `space` being what may
 * follow it.
 */
export function endsInBrace(
  text: string,
  a: number,
  e: number,
  space: (c: number) => boolean = isBlank
): boolean {
  let quoted = false;
  let last = -1;
  let lastQuoted = false;
  for (let j = a; j < e; j++) {
    const c = text.charCodeAt(j);
    if (c === DQUOTE) quoted = !quoted;
    if (!space(c)) {
      last = c;
      lastQuoted = quoted;
    }
  }
  return last === LBRACE && !lastQuoted;
}

/**
 * The start of the line whose `}` closes the block whose body starts at line `s`, or -1 when
 * `text` ends (at `end`) first. A line ending in `{` opens a level, a line starting with `}`
 * closes one; braces in `"…"` strings never count. Lines end at LF or CR, CRLF being one.
 */
export function closingLine(
  text: string,
  s: number,
  end: number,
  space?: (c: number) => boolean
): number {
  let depth = 1;
  for (let line = s; line < end; ) {
    let e = line;
    while (e < end && text.charCodeAt(e) !== LF && text.charCodeAt(e) !== CR) e++;
    let a = line;
    while (a < e && isBlank(text.charCodeAt(a))) a++;
    if (text.charCodeAt(a) === RBRACE && --depth === 0) return line;
    if (endsInBrace(text, a, e, space)) depth++;
    line = e + (text.charCodeAt(e) === CR && text.charCodeAt(e + 1) === LF ? 2 : 1);
  }
  return -1;
}
