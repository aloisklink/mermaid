/**
 * Readers of config values a diagram cannot trust the type of: the config resolver checks no
 * value types, so a directive can set any of them. Every `diagram-*` package used to carry
 * copies of these; where the copies differed, the difference is a parameter.
 */

/** A whole decimal number, spaces around it allowed: `"20"`, `" 20 "`, `"2.5"`; not `"20px"`. */
export const NUMERIC = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

/** A whole numeric string as its number; any other value as it is. */
export const numericValue = (value: unknown): unknown =>
  typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;

/**
 * A number, or a string as `Number` reads it (a blank one only with `blank`, where it is 0),
 * else NaN. Not checked for finiteness.
 */
export function rawConfigNumber(value: unknown, blank = false): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && (blank || value.trim() !== '')) return Number(value);
  return Number.NaN;
}

/**
 * {@link rawConfigNumber} when it is finite and at least `min`, capped at `max`; else undefined.
 */
export function configNumber(
  value: unknown,
  min = -Infinity,
  max = Infinity,
  blank = false
): number | undefined {
  const n = rawConfigNumber(value, blank);
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : undefined;
}

/** A config value as a warning message shows it. */
export const shownValue = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/** A CSS font weight as a number: `bold` and `bolder` are `bold`, no positive number `normal`. */
export function fontWeightOf(value: unknown, bold: number, normal: number): number {
  if (value === 'bold' || value === 'bolder') return bold;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : normal;
}

/**
 * How a diagram reads its `useMaxWidth`: `not-false` scales unless it is `false`; `truthy`
 * scales when it is unset or truthy (v12's `configureSvgSize`); `boolean` takes a boolean and
 * reads anything else as `fallback`, telling `invalid` when it was set.
 */
export type UseMaxWidthPolicy = 'not-false' | 'truthy' | 'boolean';

export function useMaxWidth(
  value: unknown,
  policy: UseMaxWidthPolicy = 'not-false',
  fallback = true,
  invalid?: (given: unknown) => void
): boolean {
  if (policy === 'not-false') return value !== false;
  if (policy === 'truthy') return value === undefined || Boolean(value);
  if (typeof value === 'boolean') return value;
  if (value !== undefined) invalid?.(value);
  return fallback;
}

/** Lengths at or above this are not taken. */
const MAX_LENGTH = 1e4;

/** The warning `configLengths` raises. */
export interface ConfigLengthWarning {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

/** A key's length in px, or undefined when it is unset (or no length and has no default). */
export type ConfigLength = (key: string) => number | undefined;

/**
 * Reads lengths from the config section `name`: a number, or a whole numeric string as its
 * number, from 0 up to 10000. Anything else that is set reads as the schema default (from
 * `defaults`, the section's generated defaults), with one `code` warning per key, however
 * often the key is read.
 */
export function configLengths(
  name: string,
  code: string,
  section: Readonly<Record<string, unknown>>,
  defaults: object,
  warn: ((warning: ConfigLengthWarning) => void) | undefined
): ConfigLength {
  const read = new Map<string, number | undefined>();
  return (key) => {
    if (read.has(key)) return read.get(key);
    // Only the section's own keys: an inherited one reads as unset.
    const value = Object.hasOwn(section, key) ? section[key] : undefined;
    // Any other string stays a string, and so is not taken.
    const n = numericValue(value);
    const taken = typeof n === 'number' && n >= 0 && n < MAX_LENGTH ? n : undefined;
    const fallback = (defaults as Readonly<Record<string, unknown>>)[key];
    // Unset reads as unset: the layout's own fallback applies, as before.
    const px =
      taken ?? (value !== undefined && typeof fallback === 'number' ? fallback : undefined);
    read.set(key, px);
    if (taken === undefined && value !== undefined) {
      const path = `${name}.${key}`;
      warn?.({
        code,
        message: `Ignored ${path}: it is not a number from 0 up to 10000; using ${px ?? 'the default'}`,
        path,
      });
    }
    return px;
  };
}
