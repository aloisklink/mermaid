/**
 * Resource limits (R-SEC-5, D31, DESIGN §10). They live in the `RenderContext`, are set by the
 * integrator only (render options, or v12's `maxTextSize`/`maxEdges` in `initialize`), and a
 * breach is a `LimitError`: a `RangeError` the pipeline reports as a `LIMIT` `MermaidError`.
 *
 * Diagram text cannot raise them: `resolveConfig` drops `maxTextSize`, `maxEdges` and `limits`
 * from front matter and directives (INTEGRATOR_ONLY_KEYS), and the source check runs before
 * the text is even preprocessed.
 */

export interface Limits {
  /** Characters (UTF-16 units) of diagram text, front matter and directives included. */
  readonly maxSourceLength: number;
  /** Edges a diagram may make. `A & B --> C & D` makes four. */
  readonly maxEdges: number;
  /** Nodes (vertices) a diagram may make. */
  readonly maxNodes: number;
  /** How deep containers (subgraphs) may nest. */
  readonly maxDepth: number;
  /** Characters of the serialised SVG. */
  readonly maxOutputLength: number;
  /**
   * Steps a layout may take where its work is not bounded by the other limits: a loop whose
   * length the text sets apart from its size. Each layout that counts against it says what a
   * step is (D542; first, gantt's scheduling: one calendar day walked).
   */
  readonly maxLayoutWork: number;
}

/** The default {@link Limits.maxLayoutWork}: about a second of the slowest steps measured (D542). */
export const MAX_STEPS = 1_500_000;

export type LimitName = keyof Limits;

/** The defaults. A source within 50,000 characters can still ask for megabytes of drawing. */
export const DEFAULT_LIMITS: Readonly<Limits> = Object.freeze({
  maxSourceLength: 50_000,
  // v12 stopped at 500; one `A & … --> B & …` line multiplies, so a cap is still needed.
  maxEdges: 5_000,
  maxNodes: 10_000,
  maxDepth: 100,
  maxOutputLength: 4_000_000,
  maxLayoutWork: MAX_STEPS,
});

const NAMES = Object.keys(DEFAULT_LIMITS) as LimitName[];

/** The diagnostic code a parser uses for each limit (`EDGE_LIMIT` is v12's edge check). */
export const LIMIT_CODES: Readonly<Record<LimitName, string>> = Object.freeze({
  maxSourceLength: 'SOURCE_LIMIT',
  maxEdges: 'EDGE_LIMIT',
  maxNodes: 'NODE_LIMIT',
  maxDepth: 'DEPTH_LIMIT',
  maxOutputLength: 'OUTPUT_LIMIT',
  maxLayoutWork: 'LAYOUT_LIMIT',
});

const CODES = new Set(Object.values(LIMIT_CODES));

/** True for a diagnostic code that reports a breached limit (map it to a `LIMIT` error). */
export const isLimitCode = (code: string): boolean => CODES.has(code);

/** A breached limit. The pipeline turns it into `MermaidError { code: 'LIMIT' }`. */
export class LimitError extends RangeError {
  readonly code = 'LIMIT' as const;
  readonly limit: LimitName;
  /** The limit's value; `undefined` for a stack overflow, which no single number caps. */
  readonly max: number | undefined;
  /** The size found, when it is known (a stack overflow has none). */
  readonly found: number | undefined;

  constructor(
    limit: LimitName,
    max: number | undefined,
    found: number | undefined,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'LimitError';
    this.limit = limit;
    this.max = max;
    this.found = found;
  }
}

/** The v12 config keys an integrator may already use for two of the limits. */
export interface LegacyLimitConfig {
  readonly maxTextSize?: number;
  readonly maxEdges?: number;
}

const checked = (name: string, value: unknown): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new TypeError(`Limit ${name} must be a non-negative number (Infinity for none).`);
  }
  return value;
};

/**
 * The limits for one render: defaults, then v12's `maxTextSize`/`maxEdges` from the
 * integrator's config, then explicit `limits`. Pass integrator config only (`initialize()`
 * or the resolved config, which already lost those keys from diagram text). Throws
 * `TypeError` on a value that is not a non-negative number.
 */
export function resolveLimits(
  config?: LegacyLimitConfig,
  overrides?: Partial<Limits>
): Readonly<Limits> {
  const out: Record<LimitName, number> = { ...DEFAULT_LIMITS };
  if (config?.maxTextSize !== undefined) {
    out.maxSourceLength = checked('maxTextSize', config.maxTextSize);
  }
  if (config?.maxEdges !== undefined) out.maxEdges = checked('maxEdges', config.maxEdges);
  if (overrides) {
    for (const name of NAMES) {
      if (!Object.prototype.hasOwnProperty.call(overrides, name)) continue;
      const value = overrides[name];
      if (value !== undefined) out[name] = checked(name, value);
    }
  }
  return Object.freeze(out);
}

/** Step 1 of every render (DESIGN §3): refuse text over `maxSourceLength` before reading it. */
export function checkSource(text: string, limits: Limits): void {
  if (text.length > limits.maxSourceLength) {
    throw new LimitError(
      'maxSourceLength',
      limits.maxSourceLength,
      text.length,
      `The diagram text is ${text.length} characters long, over the limit of ${limits.maxSourceLength}. The limit is set by the page or app that renders the diagram (maxTextSize).`
    );
  }
}

/** The last step of every render: refuse an SVG over `maxOutputLength`. */
export function checkOutput(svg: string, limits: Limits): void {
  if (svg.length > limits.maxOutputLength) {
    throw new LimitError(
      'maxOutputLength',
      limits.maxOutputLength,
      svg.length,
      `The rendered SVG is ${svg.length} characters long, over the limit of ${limits.maxOutputLength}.`
    );
  }
}

// V8 and JavaScriptCore: RangeError "Maximum call stack size exceeded"; SpiderMonkey:
// InternalError "too much recursion".
const OVERFLOW = /call stack|too much recursion/i;

/**
 * The limit error behind a thrown value: a `LimitError` as is, a stack overflow as a
 * `maxDepth` breach (nesting deeper than a recursive stage can follow), anything else
 * `undefined` (other `RangeError`s, such as a NaN coordinate, are internal errors).
 */
export function asLimitError(error: unknown): LimitError | undefined {
  if (error instanceof LimitError) return error;
  if (
    error instanceof Error &&
    (error instanceof RangeError || error.name === 'InternalError') &&
    OVERFLOW.test(error.message)
  ) {
    return new LimitError(
      'maxDepth',
      undefined,
      undefined,
      'The diagram is nested too deeply to draw.',
      { cause: error }
    );
  }
  return undefined;
}

const SET_BY = 'The limit is set by the page or app that renders the diagram.';

/**
 * A parser's node or edge cap (#721): call it after each one is added, with `count` those so
 * far, and it reports the cap once, at the first one over it (a fractional cap included). `cap`
 * defaults to the default limit of that name (a parse outside a render); `what` names what the
 * limit counts in that diagram type ("sections"), and `diagnostics` is the parser kit's.
 */
export function checkLimit<R>(
  diagnostics: { error(code: string, message: string, range: R): unknown },
  limit: 'maxNodes' | 'maxEdges',
  count: number,
  cap: number | undefined,
  what: string,
  range: R
): void {
  const max = cap ?? DEFAULT_LIMITS[limit];
  // Called once per item, so the first over the cap is the one whose predecessor was not.
  if (count > max && count - 1 <= max) {
    diagnostics.error(
      LIMIT_CODES[limit],
      `The diagram has more than ${max} ${what}, the limit. ${SET_BY}`,
      range
    );
  }
}

/**
 * A parser's nesting cap (#721), once the tree is built: reports the first of `rows` (in source
 * order) that sits deeper than `cap`, the default `maxDepth` when absent. Each diagram type says
 * what depth 0 is.
 */
export function checkDepth<R>(
  diagnostics: { error(code: string, message: string, range: R): unknown },
  rows: readonly { readonly depth: number; readonly range: R }[],
  cap: number | undefined
): void {
  const max = cap ?? DEFAULT_LIMITS.maxDepth;
  const deep = rows.find((row) => row.depth > max);
  if (deep) {
    diagnostics.error(
      LIMIT_CODES.maxDepth,
      `The diagram is nested ${deep.depth} deep here, over the limit of ${max}. ${SET_BY}`,
      deep.range
    );
  }
}
