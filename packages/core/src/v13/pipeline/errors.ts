/**
 * Typed errors of the render pipeline (DESIGN §11, R-ERR-1, R-COMPAT-7, R-API-2).
 */
import { isLimitCode, LIMIT_CODES, LimitError, type LimitName } from '../limits/index.js';
import { formatDiagnostic } from '../parser-kit/format.js';
import { LineIndex } from '../parser-kit/positions.js';
import type { Diagnostic } from '../parser-kit/diagnostics.js';

export type MermaidErrorCode =
  | 'SYNTAX'
  | 'SEMANTIC'
  | 'UNSUPPORTED_DIAGRAM'
  | 'UNSUPPORTED_FORMAT'
  | 'NOT_LOADED'
  | 'LIMIT'
  | 'INTERNAL';

/** Something `prepare` loads and `renderSync` needs (R-API-2). */
export type Resource =
  | { readonly kind: 'diagram'; readonly name: string }
  | { readonly kind: 'layout'; readonly name: string }
  | { readonly kind: 'theme'; readonly name: string }
  | { readonly kind: 'iconPack'; readonly name: string }
  | { readonly kind: 'math'; readonly name: string };

export interface MermaidErrorInit {
  /** Offset and length in the original source; 0 when the error has no position. */
  readonly offset?: number;
  readonly length?: number;
  /** The source the offset points into, to derive 1-based line and column. */
  readonly source?: string;
  readonly expected?: readonly string[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly cause?: unknown;
  /** The breached limit of a `LIMIT` error; derived from `cause` or the diagnostics if unset. */
  readonly limit?: LimitName;
}

const LIMIT_BY_CODE = new Map(
  (Object.entries(LIMIT_CODES) as [LimitName, string][]).map(([name, code]) => [code, name])
);

/** The one error type `render`, `renderSync`, `prepare` and `parse` reject or throw with. */
export class MermaidError extends Error {
  readonly code: MermaidErrorCode;
  /** 1-based, in the original source (front matter included). */
  readonly line: number;
  /** 1-based. */
  readonly column: number;
  readonly offset: number;
  readonly length: number;
  readonly expected?: readonly string[];
  /** Every diagnostic; the first is the primary one. */
  readonly diagnostics: readonly Diagnostic[];
  /** For `code: 'LIMIT'`: which limit was breached (`maxEdges`, `maxSourceLength`, …). */
  readonly limit?: LimitName;

  constructor(code: MermaidErrorCode, message: string, init: MermaidErrorInit = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'MermaidError';
    this.code = code;
    this.offset = init.offset ?? 0;
    this.length = init.length ?? 0;
    const at =
      init.source === undefined ? undefined : new LineIndex(init.source).position(this.offset);
    this.line = at ? at.line + 1 : 1;
    this.column = at ? at.column + 1 : 1;
    if (init.expected) this.expected = init.expected;
    this.diagnostics = init.diagnostics ?? [];
    if (code === 'LIMIT') {
      const limit =
        init.limit ??
        (init.cause instanceof LimitError ? init.cause.limit : undefined) ??
        this.diagnostics.map((d) => LIMIT_BY_CODE.get(d.code)).find((n) => n !== undefined);
      if (limit !== undefined) this.limit = limit;
    }
  }
}

/** `renderSync` was asked to draw with something `prepare`/`preload` has not loaded. */
export class NotLoadedError extends MermaidError {
  readonly missing: readonly Resource[];

  constructor(missing: readonly Resource[]) {
    super(
      'NOT_LOADED',
      `Not loaded: ${missing.map((r) => `${r.kind} "${r.name}"`).join(', ')}. Call prepare() or preload() first, or use render().`
    );
    this.name = 'NotLoadedError';
    this.missing = missing;
  }
}

/** A diagram type does not support the requested output format (R-ASCII-5, D58). */
export class UnsupportedFormatError extends MermaidError {
  readonly diagramType: string;
  readonly format: string;

  constructor(diagramType: string, format: string) {
    super('UNSUPPORTED_FORMAT', `Diagram type "${diagramType}" cannot be rendered as ${format}.`);
    this.name = 'UnsupportedFormatError';
    this.diagramType = diagramType;
    this.format = format;
  }
}

function errorClass(code: string): 'LIMIT' | 'SEMANTIC' | 'SYNTAX' {
  if (isLimitCode(code)) return 'LIMIT';
  return SEMANTIC.has(code) ? 'SEMANTIC' : 'SYNTAX';
}

// Parser codes that are about meaning rather than syntax, and the limit codes.
const SEMANTIC: ReadonlySet<string> = new Set([
  'UNKNOWN_SHAPE',
  'SHAPE_DATA',
  'LINK_STYLE_INDEX',
  'UNKNOWN_DIRECTION',
  'EMBED_DUPLICATE_ID',
]);

/**
 * The error for a parse whose diagnostics include errors, or undefined when there are none.
 * The message is the primary diagnostic with its snippet and caret (R-ERR-2).
 */
export function errorFromDiagnostics(
  source: string,
  diagnostics: readonly Diagnostic[]
): MermaidError | undefined {
  const all = diagnostics.filter((d) => d.severity === 'error');
  // A breached limit is the primary error even when other errors come first (R-SEC-5).
  const limit = all.find((d) => isLimitCode(d.code));
  const errors = limit ? [limit, ...all.filter((d) => d !== limit)] : all;
  const first = errors[0];
  if (!first) return undefined;
  const lines = new LineIndex(source);
  let message = formatDiagnostic(source, first, lines);
  if (errors.length > 1) {
    message += `\n(${errors.length - 1} more error${errors.length > 2 ? 's' : ''})`;
  }
  const code = errorClass(first.code);
  return new MermaidError(code, message, {
    source,
    offset: first.range.start,
    length: first.range.end - first.range.start,
    expected: first.expected,
    diagnostics: errors,
  });
}
