/**
 * Where the diagram text starts, as v12's detectors saw it: after the front matter, with
 * directives and `%%` comments removed.
 */
import { isSpace } from '../parser-kit/chars.js';
import type { PreprocessResult } from './preprocess.js';

/**
 * Skip whitespace and `%%` comments. A `%%{` stops the skip only where a directive starts;
 * one without a name is skipped like a comment (v12 `anyCommentRegex` removed it).
 */
function skipTrivia(src: string, from: number, directiveAt: ReadonlySet<number>): number {
  let i = from;
  for (;;) {
    while (isSpace(src.charCodeAt(i))) i++;
    if (!src.startsWith('%%', i) || (src[i + 2] === '{' && directiveAt.has(i))) return i;
    const eol = src.indexOf('\n', i);
    if (eol === -1) return src.length;
    i = eol;
  }
}

/** Offset of the diagram keyword: after front matter, directives, `%%` comments and whitespace. */
export function diagramStart(src: string, pre: PreprocessResult): number {
  const starts = new Set(pre.directives.map((d) => d.range.start));
  let i = skipTrivia(src, pre.bodyStart, starts);
  for (const { range } of pre.directives) {
    if (range.end <= i) continue;
    if (range.start > i) break;
    i = skipTrivia(src, range.end, starts);
  }
  return i;
}
