/**
 * The style allow-list (R-SEC-3, DESIGN §10). `style`, `classDef` and `linkStyle`
 * declarations are checked per property and come out as presentation attributes; anything
 * else is dropped with a warning. Also the constructors for the branded colour, length and
 * theme-reference values.
 */
import { RE_INVALID_XML, num } from './escape.js';
import type {
  Attrs,
  SafeColor,
  SafeFilter,
  SafeLength,
  SafeValue,
  StyleText,
  ThemeRef,
  ThemeStyleSheet,
  Warn,
} from './types.js';

/** Values containing any of these are dropped whatever the property. */
export const RE_UNSAFE_STYLE =
  /url\s*\(|expression\s*\(|javascript:|@import|image-set|\/\*|[<>{};\\]/i;

const RE_HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RE_NAMED = /^[a-z]{3,30}$/i;
const RE_COLOR_CHARS = /^[a-z0-9_#.,%()\s+\-/]+$/i;
// Not a ReDoS risk: only run on a colour of at most 200 characters (checkColor)
const RE_FUNC_NAME = /[a-z-]*$/i;
const COLOR_FUNCS: ReadonlySet<string> = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'light-dark',
  'var',
]);
const RE_VAR_ARG = /^\s*--(?:mermaid-|_)[\w-]/;
const RE_LENGTH =
  /^-?(?:\d{1,10}(?:\.\d{1,10})?|\.\d{1,10})(?:px|em|rem|ex|ch|pt|pc|cm|mm|in|vw|vh|%)?$/i;
const RE_NUMBER = /^(?:\d{1,10}(?:\.\d{1,10})?|\.\d{1,10})%?$/;
const RE_FAMILY = /^[\p{L}\p{N}\s,'"_.-]{1,200}$/u;
const RE_CUSTOM_PROP = /^--[A-Za-z0-9_-]{1,64}$/;

const FONT_SIZES: ReadonlySet<string> = new Set([
  'xx-small',
  'x-small',
  'small',
  'medium',
  'large',
  'x-large',
  'xx-large',
  'smaller',
  'larger',
]);
const WEIGHTS: ReadonlySet<string> = new Set([
  'normal',
  'bold',
  'bolder',
  'lighter',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
]);
const DECORATIONS: ReadonlySet<string> = new Set(['none', 'underline', 'overline', 'line-through']);

/** A colour from user styles or theme variables, or undefined when it is not allowed. */
export function checkColor(value: string): SafeColor | undefined {
  const v = value.trim();
  if (v === '' || v.length > 200 || RE_UNSAFE_STYLE.test(v) || RE_INVALID_XML.test(v))
    return undefined;
  if (RE_HEX.test(v) || RE_NAMED.test(v)) return v as SafeColor;
  if (!RE_COLOR_CHARS.test(v)) return undefined;
  // Every `(` must open an allowed colour function, and `var()` may only name Mermaid variables.
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '(') {
      const name = (RE_FUNC_NAME.exec(v.slice(0, i).trimEnd()) as RegExpExecArray)[0].toLowerCase();
      if (!COLOR_FUNCS.has(name)) return undefined;
      if (name === 'var' && !RE_VAR_ARG.test(v.slice(i + 1))) return undefined;
      if (++depth > 8) return undefined;
    } else if (c === ')' && --depth < 0) return undefined;
  }
  return depth === 0 ? (v as SafeColor) : undefined;
}

const RE_SHADOW_LENGTH = /^(-?)(\d{1,6}(?:\.\d{1,6})?|\.\d{1,6})(px|em|rem)?$/i;
const SHADOW_HEAD = 'drop-shadow(';
const MAX_SHADOWS = 4;
// The largest shadow offset or blur, in px (an em or rem counted as 16px). A blur costs render
// time with its radius, so an unbounded one is a denial of service on whoever views the SVG.
const MAX_SHADOW_PX = 100;
const PX_PER_EM = 16;

/** A shadow offset or blur within MAX_SHADOW_PX (a blur also not negative). */
function shadowLength(word: string, blur: boolean): boolean {
  const m = RE_SHADOW_LENGTH.exec(word);
  if (!m) return false;
  if (blur && m[1] === '-') return false;
  const pixels = Number(m[2]) * (m[3] && m[3].toLowerCase() !== 'px' ? PX_PER_EM : 1);
  return pixels <= MAX_SHADOW_PX;
}

/**
 * Splits on whitespace (`'space'`) or commas (`'comma'`) outside parentheses, so `rgb(0 0 0)`
 * stays one part. Parts are trimmed and empty ones dropped; undefined when the parentheses
 * don't balance.
 */
export function splitTopLevel(text: string, sep: 'space' | 'comma'): string[] | undefined {
  const out: string[] = [];
  let depth = 0;
  let part = '';
  const flush = () => {
    const t = part.trim();
    if (t !== '') out.push(t);
    part = '';
  };
  for (const c of text) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return undefined;
    if (depth === 0 && (sep === 'comma' ? c === ',' : /\s/.test(c))) flush();
    else part += c;
  }
  if (depth !== 0) return undefined;
  flush();
  return out;
}

/** One `drop-shadow(<x> <y> [<blur>] [<colour>])`, normalised, or undefined. */
function checkShadow(fn: string): string | undefined {
  if (!fn.toLowerCase().startsWith(SHADOW_HEAD) || !fn.endsWith(')')) return undefined;
  const args = splitTopLevel(fn.slice(SHADOW_HEAD.length, -1), 'space');
  if (!args) return undefined;
  let lengths = 0;
  while (lengths < args.length && lengths < 3 && RE_SHADOW_LENGTH.test(args[lengths] as string)) {
    if (!shadowLength(args[lengths] as string, lengths === 2)) return undefined;
    lengths++;
  }
  // At most one colour after the lengths, a single word such as `red` or `rgb(0 0 0 / 0.06)`.
  if (lengths < 2 || args.length > lengths + 1) return undefined;
  const colour = args[lengths];
  if (colour !== undefined && checkColor(colour) === undefined) return undefined;
  return 'drop-shadow(' + args.join(' ') + ')';
}

/**
 * A CSS `filter` value for the theme's drop shadow (#85), or undefined when it is not
 * allowed: `none`, or one to four `drop-shadow(<x> <y> [<blur>] [<colour>])` functions with
 * every length within 100px and the colour through `checkColor`. Nothing else, so no `url()`
 * reference can load a resource or reach an element outside the diagram.
 */
export function checkFilter(value: string): SafeFilter | undefined {
  const v = value.trim();
  if (v === '' || v.length > 400 || RE_UNSAFE_STYLE.test(v) || RE_INVALID_XML.test(v))
    return undefined;
  if (v.toLowerCase() === 'none') return 'none' as SafeFilter;
  const fns = splitTopLevel(v, 'space');
  if (!fns || fns.length === 0 || fns.length > MAX_SHADOWS) return undefined;
  const out: string[] = [];
  for (const fn of fns) {
    const s = checkShadow(fn);
    if (s === undefined) return undefined;
    out.push(s);
  }
  return out.join(' ') as SafeFilter;
}

/** A CSS length or plain number, or undefined when it is not one. */
export function checkLength(value: string): SafeLength | undefined {
  const v = value.trim();
  return RE_LENGTH.test(v) ? (v as SafeLength) : undefined;
}

/** A length in px built from a number. */
export function px(value: number): SafeLength {
  return (num(value) + 'px') as SafeLength;
}

/** A reference to a theme CSS variable, with an optional checked fallback. */
export function themeRef(
  name: string,
  fallback?: SafeColor | SafeLength | ThemeRef | number
): ThemeRef {
  if (!RE_CUSTOM_PROP.test(name))
    throw new TypeError(`${JSON.stringify(name)} is not a CSS custom property name`);
  if (fallback === undefined) return `var(${name})` as ThemeRef;
  return `var(${name},${typeof fallback === 'number' ? num(fallback) : fallback})` as ThemeRef;
}

/**
 * `mix-blend-mode` (D392), with its only values. Not a presentation attribute, so `checkStyle`
 * writes it as the shape's `style`, and it is not in {@link STYLE_PROPERTIES}.
 */
export const BLEND = 'mix-blend-mode';
export const BLEND_MODES: ReadonlySet<string> = new Set(['normal', 'multiply']);

type Kind =
  | 'blend'
  | 'color'
  | 'length'
  | 'opacity'
  | 'dash'
  | 'weight'
  | 'fontStyle'
  | 'family'
  | 'decoration'
  | 'cap'
  | 'join'
  | 'size'
  | 'spacing';
/** `style`: the shape's `style` attribute, for a property that is not a presentation attribute. */
type Target = 'shape' | 'text' | 'both' | 'style';

const PROPERTIES: Readonly<Record<string, readonly [Kind, Target]>> = {
  fill: ['color', 'shape'],
  stroke: ['color', 'shape'],
  'stroke-width': ['length', 'shape'],
  'stroke-dasharray': ['dash', 'shape'],
  'stroke-dashoffset': ['length', 'shape'],
  'stroke-opacity': ['opacity', 'shape'],
  'stroke-linecap': ['cap', 'shape'],
  'stroke-linejoin': ['join', 'shape'],
  'fill-opacity': ['opacity', 'shape'],
  opacity: ['opacity', 'both'],
  color: ['color', 'text'],
  'font-size': ['size', 'text'],
  'font-family': ['family', 'text'],
  'font-weight': ['weight', 'text'],
  'font-style': ['fontStyle', 'text'],
  'text-decoration': ['decoration', 'text'],
  'letter-spacing': ['spacing', 'text'],
  [BLEND]: ['blend', 'style'],
};

/** The properties `checkStyle` keeps as presentation attributes (all but `mix-blend-mode`). */
export const STYLE_PROPERTIES: ReadonlySet<string> = new Set(
  Object.keys(PROPERTIES).filter((p) => p !== BLEND)
);

type ValueCheck = (v: string, lower: string) => string | undefined;

/** The lower-cased value when it is one of `set`. */
const oneOf =
  (set: ReadonlySet<string>): ValueCheck =>
  (_v, lower) =>
    set.has(lower) ? lower : undefined;

const FONT_STYLES: ReadonlySet<string> = new Set(['normal', 'italic', 'oblique']);
const LINE_CAPS: ReadonlySet<string> = new Set(['butt', 'round', 'square']);
const LINE_JOINS: ReadonlySet<string> = new Set(['miter', 'round', 'bevel']);

/** Each kind's check: the value as it may be written, or undefined when it is not allowed. */
const VALUE_CHECKS: Readonly<Record<Kind, ValueCheck>> = {
  blend: oneOf(BLEND_MODES),
  color: checkColor,
  length: checkLength,
  size: (v, lower) => (FONT_SIZES.has(lower) ? lower : checkLength(v)),
  spacing: (v, lower) => (lower === 'normal' ? lower : checkLength(v)),
  opacity: (v) => (RE_NUMBER.test(v) ? v : undefined),
  dash: (v, lower) => {
    if (lower === 'none') return lower;
    const parts = v.split(/[\s,]+/).filter((p) => p !== '');
    return parts.length > 0 && parts.length <= 32 && parts.every((p) => RE_LENGTH.test(p))
      ? parts.join(' ')
      : undefined;
  },
  weight: oneOf(WEIGHTS),
  fontStyle: oneOf(FONT_STYLES),
  family: (v) => (RE_FAMILY.test(v) ? v : undefined),
  decoration: (_v, lower) => {
    const words = lower.split(/\s+/);
    return words.length <= 3 && words.every((w) => DECORATIONS.has(w))
      ? words.join(' ')
      : undefined;
  },
  cap: oneOf(LINE_CAPS),
  join: oneOf(LINE_JOINS),
};

function checkValue(kind: Kind, v: string): string | undefined {
  return VALUE_CHECKS[kind](v, v.toLowerCase());
}

/** Checked style declarations, split by what they apply to, as presentation attributes. */
export interface CheckedStyle {
  /**
   * For the shape or line: fill, stroke, stroke-*, opacity, and `style` holding only
   * `mix-blend-mode:normal|multiply` (D392). A renderer that writes its own `style` on the same
   * element passes this one as `styleText`'s `tail`, so neither replaces the other.
   */
  readonly shape: Attrs;
  /** For the label: `color` becomes `fill`, plus font-* and text-decoration. */
  readonly text: Attrs;
}

const EMPTY: CheckedStyle = Object.freeze({ shape: Object.freeze({}), text: Object.freeze({}) });

/**
 * Checks Mermaid style declarations (`['fill:#f9f', 'stroke-width:4px']`, as the parser
 * splits a `style`/`classDef`/`linkStyle` statement). Unknown properties and unsafe values
 * are dropped with a warning. Later declarations win.
 */
export function checkStyle(declarations: readonly string[], warn?: Warn): CheckedStyle {
  if (declarations.length === 0) return EMPTY;
  const shape: Record<string, string> = {};
  const text: Record<string, string> = {};
  let any = false;
  for (const decl of declarations) {
    const at = decl.indexOf(':');
    const prop = (at < 0 ? decl : decl.slice(0, at)).trim().toLowerCase();
    if (prop === '') continue;
    const entry = Object.prototype.hasOwnProperty.call(PROPERTIES, prop)
      ? PROPERTIES[prop]
      : undefined;
    if (entry === undefined || at < 0) {
      warn?.({
        code: 'STYLE_PROPERTY_DROPPED',
        message: `Style property ${JSON.stringify(prop.slice(0, 60))} is not supported and was dropped.`,
      });
      continue;
    }
    const raw = decl
      .slice(at + 1)
      .replace(/!important/gi, '')
      .trim();
    const value =
      raw === '' || RE_UNSAFE_STYLE.test(raw) || RE_INVALID_XML.test(raw)
        ? undefined
        : checkValue(entry[0], raw);
    if (value === undefined) {
      warn?.({
        code: 'STYLE_VALUE_DROPPED',
        message: `Value ${JSON.stringify(raw.slice(0, 60))} for ${prop} is not allowed and was dropped.`,
      });
      continue;
    }
    any = true;
    const target = entry[1];
    if (target === 'style') shape.style = prop + ':' + value;
    else {
      if (target !== 'text') shape[prop] = value;
      if (target !== 'shape') text[prop === 'color' ? 'fill' : prop] = value;
    }
  }
  return any ? { shape: shape as Attrs, text: text as Attrs } : EMPTY;
}

/** Properties a `style` attribute built by `styleText` may set, besides custom properties. */
export const STYLE_TEXT_PROPERTIES: ReadonlySet<string> = new Set([
  ...STYLE_PROPERTIES,
  'max-width',
  'width',
  'height',
  BLEND,
]);

/**
 * A `style` attribute value from checked parts, for the few places that need one (the root
 * element's `max-width` and theme aliases, DESIGN §7.2).
 */
export function styleText(
  declarations: Readonly<Record<string, SafeColor | SafeLength | SafeValue | ThemeRef | number>>,
  /** Declarations already checked by an earlier `styleText`, appended as they are. */
  tail?: StyleText
): StyleText {
  let out = '';
  for (const prop in declarations) {
    const value = declarations[prop];
    if (value === undefined) continue;
    if (!RE_CUSTOM_PROP.test(prop) && !STYLE_TEXT_PROPERTIES.has(prop)) {
      throw new TypeError(`${JSON.stringify(prop)} is not an allowed style property`);
    }
    const text = typeof value === 'number' ? num(value) : value;
    if (
      RE_UNSAFE_STYLE.test(text) ||
      RE_INVALID_XML.test(text) ||
      (prop === BLEND && !BLEND_MODES.has(text))
    )
      throw new TypeError(`Unsafe style value for ${prop}`);
    out += (out === '' ? '' : ';') + prop + ':' + text;
  }
  if (tail) out += (out === '' ? '' : ';') + tail;
  return out as StyleText;
}

const RE_SCOPE = /^[A-Za-z_][\w-]{0,63}$/;

/**
 * A style-sheet scope for a render id: the id itself when it already is one, else a hash of
 * it (`p-<base36>`), so any id (React's `:r1:`, ids with spaces) gives a valid, distinct scope.
 */
export function styleScope(id: string): string {
  return RE_SCOPE.test(id) ? id : `p-${hash36(id)}`;
}

/** FNV-1a (32-bit) of `text`, in base 36: a short, stable id part, not a secure hash. */
export function hash36(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
const MEDIA_DARK = '@media (prefers-color-scheme:dark){';

function sheetBlock(scope: string, decls: Readonly<Record<string, ThemeRef>>): string {
  let body = '';
  for (const prop in decls) {
    const value = decls[prop];
    if (!RE_CUSTOM_PROP.test(prop) || typeof value !== 'string' || !safeSheetValue(value))
      throw new TypeError(`${JSON.stringify(prop)} cannot go in a theme style sheet`);
    body += (body === '' ? '' : ';') + prop + ':' + value;
  }
  return `svg[data-p=${scope}]{${body}}`;
}

function safeSheetValue(value: string): boolean {
  return (
    value.trim() !== '' &&
    !RE_UNSAFE_STYLE.test(value) &&
    !RE_INVALID_XML.test(value) &&
    !/["'&]/.test(value)
  );
}

/**
 * The only `<style>` content the writer emits (R-THEME-8, DESIGN §8.1 item 6): custom
 * property declarations scoped to `svg[data-p=<scope>]`, once for light and once under
 * `prefers-color-scheme: dark`.
 */
export function themeStyleSheet(
  scope: string,
  light: Readonly<Record<string, ThemeRef>>,
  dark: Readonly<Record<string, ThemeRef>>
): ThemeStyleSheet {
  if (!RE_SCOPE.test(scope)) throw new TypeError(`${JSON.stringify(scope)} is not a style scope`);
  return (sheetBlock(scope, light) + MEDIA_DARK + sheetBlock(scope, dark) + '}') as ThemeStyleSheet;
}

const RE_BLOCK_HEAD = /^svg\[data-p=[A-Za-z_][\w-]{0,63}\]\{/;

/** Why `css` is not a sheet `themeStyleSheet` could have built, or undefined when it is. */
export function styleSheetProblem(css: string): string | undefined {
  let rest = css;
  const block = (): string | undefined => {
    const head = RE_BLOCK_HEAD.exec(rest);
    if (!head) return 'a style rule that is not svg[data-p=…]';
    const end = rest.indexOf('}');
    if (end === -1) return 'an unclosed style rule';
    const body = rest.slice(head[0].length, end);
    rest = rest.slice(end + 1);
    if (body.includes('{')) return 'a nested style rule';
    if (body === '') return undefined;
    for (const decl of body.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0 || !RE_CUSTOM_PROP.test(decl.slice(0, at)) || !safeSheetValue(decl.slice(at + 1)))
        return `style declaration ${JSON.stringify(decl.slice(0, 40))}`;
    }
    return undefined;
  };
  const first = block();
  if (first) return first;
  if (!rest.startsWith(MEDIA_DARK)) return 'a style sheet without the dark-scheme rule';
  rest = rest.slice(MEDIA_DARK.length);
  const second = block();
  if (second) return second;
  return rest === '}' ? undefined : 'extra style sheet content';
}
