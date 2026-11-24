/**
 * Plain-text rendering of a diagnostic with a source snippet and a caret (R-ERR-2): the form
 * error messages and the error image show. Positions are 1-based for people.
 */
import type { Diagnostic, Severity } from './diagnostics.js';
import { LineIndex } from './positions.js';
import type { Range } from './positions.js';

function snippet(src: string, lines: LineIndex, range: Range, gutter: number): string[] {
  const { line, column } = lines.position(range.start);
  const start = lines.offset(line, 0);
  const text = src.slice(start, lines.offset(line, Number.MAX_SAFE_INTEGER)).replace(/\t/g, ' ');
  const width = Math.max(1, Math.min(range.end, start + text.length) - range.start);
  const no = String(line + 1).padStart(gutter);
  return [`${no} | ${text}`, `${' '.repeat(gutter)} | ${' '.repeat(column)}${'^'.repeat(width)}`];
}

/**
 * ```text
 * Error at line 3, column 3: Unclosed node label: … Add `]` to close it.
 * 3 |   A[one
 *   |    ^
 * Expected: label text or `]`
 * Note at line 5, column 1: The text ends here.
 * ```
 */
const SEVERITY_LABEL = {
  error: 'Error',
  warning: 'Warning',
  info: 'Note',
} as const satisfies Record<Severity, string>;

export function formatDiagnostic(src: string, d: Diagnostic, lines = new LineIndex(src)): string {
  const at = lines.position(d.range.start);
  const related = d.related ?? [];
  const gutter = String(
    Math.max(at.line, ...related.map((r) => lines.position(r.range.start).line)) + 1
  ).length;
  const kind = SEVERITY_LABEL[d.severity];
  const out = [`${kind} at line ${at.line + 1}, column ${at.column + 1}: ${d.message}`];
  out.push(...snippet(src, lines, d.range, gutter));
  if (d.expected?.length) out.push(`Expected: ${d.expected.join(', ')}`);
  for (const r of related) {
    const p = lines.position(r.range.start);
    out.push(`Note at line ${p.line + 1}, column ${p.column + 1}: ${r.message}`);
    out.push(...snippet(src, lines, r.range, gutter));
  }
  return out.join('\n');
}
