/**
 * The text detectors test (D89, #469): the renderer's registry and the language service read
 * it through these two functions, so both detect the same type.
 */
import type { PreprocessResult } from './preprocess.js';

export interface DetectTextOptions {
  /**
   * Keep a `%%` comment on the last line, which has no line break after it, as v12's
   * `stripAnyComments` did (it cut a comment together with its line break). First-party rows
   * fall back to this text ({@link firstPartyDetects}).
   */
  readonly keepLastLineComment?: boolean;
}

/**
 * The text from `start` (the diagram start) with directives removed by their preprocess ranges
 * and each `%%` comment cut from its line: what third-party detectors are given. It is not
 * v12's text: v12's own directive regex is not reproduced (size, R-PERF-8), and blank space
 * before a comment stays (no pattern depends on it).
 */
export function detectText(
  src: string,
  start: number,
  pre: PreprocessResult,
  options: DetectTextOptions = {}
): string {
  let text = '';
  let at = start;
  for (const { range } of pre.directives) {
    if (range.end <= at) continue;
    text += src.slice(at, Math.max(at, range.start));
    at = range.end;
  }
  text += src.slice(at);
  if (!text.includes('%%')) return text;
  const lines = text.split('\n');
  const last = options.keepLastLineComment ? lines.length - 1 : -1;
  return lines
    .map((line, i) => {
      const c = line.indexOf('%%');
      return c < 0 || i === last ? line : line.slice(0, c).trimEnd();
    })
    .join('\n');
}

/**
 * Whether a first-party row matches: `test` on the raw `body` (the text from the diagram's
 * start) first; when the body holds a `%%`, also on the text with comments cut as v12's
 * detection cut them (`v12Text`, {@link detectText} with `keepLastLineComment`), so a header
 * with a comment right after it and a body below matches as in v12.
 */
export function firstPartyDetects(
  test: (text: string) => boolean,
  body: string,
  v12Text: () => string
): boolean {
  return test(body) || (body.includes('%%') && test(v12Text()));
}
