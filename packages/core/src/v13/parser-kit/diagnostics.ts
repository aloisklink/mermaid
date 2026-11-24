/**
 * Diagnostics and the `Expected` grouping table (DESIGN §4.2, R-ERR-2, R-ERR-5).
 * Ranges are offsets into the original source.
 */
import type { Range } from './positions.js';
import type { TokenKind } from './tokens.js';

export type Severity = 'error' | 'warning' | 'info';

/** A second location for a diagnostic, e.g. the opener of an unclosed construct. */
export interface RelatedInfo {
  message: string;
  range: Range;
}

export interface Diagnostic {
  severity: Severity;
  /** Stable machine code, e.g. `UNCLOSED_LABEL`. */
  code: string;
  /** Human message in Mermaid terms; never a token kind or grammar rule name (R-ERR-5). */
  message: string;
  range: Range;
  /** At most 5 human names of what would have been accepted here (from an {@link ExpectedTable}). */
  expected?: string[];
  related?: RelatedInfo[];
}

/** Optional parts of a diagnostic. */
export interface DiagnosticExtra {
  expected?: string[];
  related?: RelatedInfo[];
}

/** Collects the diagnostics of one parse. Create one per parse. */
export class Diagnostics {
  readonly list: Diagnostic[] = [];

  add(
    severity: Severity,
    code: string,
    message: string,
    range: Range,
    extra?: DiagnosticExtra
  ): Diagnostic {
    const d: Diagnostic = { severity, code, message, range, ...extra };
    this.list.push(d);
    return d;
  }

  error(code: string, message: string, range: Range, extra?: DiagnosticExtra): Diagnostic {
    return this.add('error', code, message, range, extra);
  }

  warning(code: string, message: string, range: Range, extra?: DiagnosticExtra): Diagnostic {
    return this.add('warning', code, message, range, extra);
  }

  /**
   * Error `Expected <names>, got <found>.` with `expected` set to `names`; with a `hint`, the
   * message ends `, got <found>; <hint>.`.
   */
  unexpected(
    code: string,
    range: Range,
    names: string[],
    found: string,
    extra?: DiagnosticExtra,
    hint?: string
  ): Diagnostic {
    const why = hint ? `; ${hint}` : '';
    return this.error(code, `Expected ${formatExpected(names)}, got ${found}${why}.`, range, {
      ...extra,
      expected: names,
    });
  }

  get hasErrors(): boolean {
    return this.list.some((d) => d.severity === 'error');
  }
}

/** Maximum number of names in an "expected" list (R-ERR-2). */
export const MAX_EXPECTED = 5;

/**
 * Per-diagram table that groups raw token kinds under human names, e.g.
 * `['an arrow such as -->', [T.Arrow, T.ThickArrow]]`. Every token kind a parser can
 * expect should appear in exactly one group. Order matters: names come out in table order.
 */
export class ExpectedTable {
  private readonly byKind = new Map<TokenKind, number>();
  private readonly groups: readonly string[];

  constructor(groups: readonly (readonly [name: string, kinds: readonly TokenKind[]])[]) {
    this.groups = groups.map(([name]) => name);
    groups.forEach(([, kinds], i) => {
      for (const k of kinds) if (!this.byKind.has(k)) this.byKind.set(k, i);
    });
  }

  /** Human names for `kinds`, deduplicated, in table order, at most {@link MAX_EXPECTED}. */
  names(kinds: Iterable<TokenKind>): string[] {
    const hit = new Set<number>();
    for (const k of kinds) {
      const g = this.byKind.get(k);
      if (g !== undefined) hit.add(g);
    }
    return [...hit]
      .sort((a, b) => a - b)
      .slice(0, MAX_EXPECTED)
      .map((g) => this.groups[g] ?? '');
  }

  /** Human name of one kind, for "got …"; `unexpected text` when it is not in the table. */
  name(kind: TokenKind): string {
    const g = this.byKind.get(kind);
    return g === undefined ? 'unexpected text' : (this.groups[g] ?? '');
  }
}

/** `a`, `a or b`, `a, b or c`. */
export function formatExpected(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? 'something else';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}
