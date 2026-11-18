/**
 * Types shared by the SVG writer, its two backings and the safety checks.
 *
 * Tag and attribute names are compile-time unions taken from the allow-list in
 * `allowlist.ts`. Values that could carry script or load a resource (URLs, colours,
 * lengths, style text, path data, transforms) are branded strings that only the
 * constructors in this module can produce.
 */

declare const brand: unique symbol;

/** A string that only a checked constructor in `core/svg` can produce. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A link or image URL that passed `checkUrl()`. */
export type SafeUrl = Brand<string, 'SafeUrl'>;
/** A colour that passed the colour allow-list (`checkColor()` / `checkStyle()`). */
export type SafeColor = Brand<string, 'SafeColor'>;
/** A length that passed the length allow-list, or one built from a number by `px()`. */
export type SafeLength = Brand<string, 'SafeLength'>;
/** A reference to a theme CSS variable, `var(--name)` or `var(--name,fallback)`. */
export type ThemeRef = Brand<string, 'ThemeRef'>;
/** A path `d` value built by `PathBuilder`. */
export type PathData = Brand<string, 'PathData'>;
/** A `transform` value built by `translate()`, `rotate()`, `scale()`. */
export type Transform = Brand<string, 'Transform'>;
/** A `style` attribute value built by `styleText()`. */
export type StyleText = Brand<string, 'StyleText'>;
/** A `theme: 'auto'` style sheet built by `themeStyleSheet()` (R-THEME-8). */
export type ThemeStyleSheet = Brand<string, 'ThemeStyleSheet'>;
/** A CSS `filter` value that passed `checkFilter()`: `none` or `drop-shadow(…)` only. */
export type SafeFilter = Brand<string, 'SafeFilter'>;
/**
 * A finished diagram's root `<svg>`, checked by `embeddedSvg()`, for a host to splice in whole
 * with `SvgWriter.embed()` (ADR-15).
 */
export type EmbeddedSvg = Brand<string, 'EmbeddedSvg'>;
/** A free-form, plain value that passed a property validator (font-family, keywords). */
export type SafeValue = Brand<string, 'SafeValue'>;

/** The v12 link targets that are kept (D62). */
export type LinkTarget = '_self' | '_blank' | '_parent' | '_top';

/** A paint value: a checked colour, a theme variable, or a keyword. */
export type Paint = SafeColor | ThemeRef | 'none' | 'currentColor' | 'transparent';
/**
 * `url(#…)` of one of the render's own gradients: `url(#<scope>-gradient)` (D182), which only
 * `Theme.outline()` makes, or a user-space gradient's (D391), which only
 * `SvgWriter.linearGradient()` makes. Only `fill` and `stroke` take it.
 */
export type GradientRef = Brand<string, 'GradientRef'>;
/** What `fill` and `stroke` accept: a paint, or the render's gradient. */
export type OutlinePaint = Paint | GradientRef;
/** A gradient stop colour: a checked colour, or `var(--mermaid-gradientStart,<colour>)`. */
export type StopColor = SafeColor | ThemeRef;
/** A length: a plain number (user units), a checked length or a theme variable. */
export type Length = number | SafeLength | ThemeRef;

/** The attributes the writer can emit, with the value type each accepts. */
export interface AttrTypes {
  // document and structure
  xmlns: 'http://www.w3.org/2000/svg';
  viewBox: readonly [number, number, number, number];
  width: number | `${number}%`;
  height: number | `${number}%`;
  preserveAspectRatio: 'none' | 'xMidYMid meet' | 'xMinYMin meet';
  class: string;
  id: string;
  role: 'img' | 'graphics-document' | 'presentation';
  'aria-roledescription': string;
  'aria-labelledby': string;
  'aria-describedby': string;
  'aria-label': string;
  'aria-hidden': 'true' | 'false';
  'data-id': string;
  'data-ast': string;
  'data-mermaid-version': string;
  /** The render's id prefix, which a `theme: 'auto'` style sheet is scoped to. */
  'data-p': string;
  /** A palette slot, `color-<n>`, so tests and user CSS can target it (v12 `data-color-id`). */
  'data-color-id': `color-${number}`;
  /** A venn area's member ids joined with `_` (v12 venn.js's `data-venn-sets`). */
  'data-venn-sets': string;
  style: StyleText;
  transform: Transform;
  'pointer-events': 'none' | 'all' | 'visiblePainted';
  /** `pointer` only: the mark of a clickable node (D605). */
  cursor: 'pointer';
  // geometry
  x: number;
  y: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  r: number;
  rx: number;
  ry: number;
  dx: number;
  dy: number;
  d: PathData;
  points: readonly number[];
  // presentation
  fill: OutlinePaint;
  'fill-opacity': number | SafeValue;
  /** Icon bodies (D295). */
  'fill-rule': 'nonzero' | 'evenodd';
  'clip-rule': 'nonzero' | 'evenodd';
  stroke: OutlinePaint;
  'stroke-width': Length;
  'stroke-dasharray': SafeValue | 'none';
  'stroke-dashoffset': Length;
  'stroke-linecap': 'butt' | 'round' | 'square';
  'stroke-linejoin': 'miter' | 'round' | 'bevel';
  'stroke-miterlimit': number;
  'stroke-opacity': number | SafeValue;
  opacity: number | SafeValue;
  /** The theme's drop shadow (#85): a checked `drop-shadow(…)` list or a theme variable. */
  filter: SafeFilter | ThemeRef;
  color: Paint;
  'font-family': SafeValue | ThemeRef;
  'font-size': Length;
  'font-weight': SafeValue | ThemeRef | 'normal' | 'bold';
  'font-style': SafeValue | 'normal' | 'italic';
  'text-anchor': 'start' | 'middle' | 'end';
  'dominant-baseline':
    | 'auto'
    | 'middle'
    | 'central'
    | 'hanging'
    | 'alphabetic'
    | 'text-before-edge';
  'text-decoration': SafeValue | 'underline' | 'line-through' | 'none';
  'letter-spacing': Length;
  'xml:space': 'preserve';
  // links and images
  href: SafeUrl;
  target: LinkTarget;
  rel: 'noopener noreferrer';
  // an animated edge's `<animate>` (D606)
  /** `stroke-dashoffset` only: the one property a diagram may animate. */
  attributeName: 'stroke-dashoffset';
  from: number;
  to: number;
  /** Seconds. */
  dur: number;
  repeatCount: 'indefinite';
}

export type AllowedAttr = keyof AttrTypes;

/** Attributes for one element. `undefined` values are skipped. */
export type Attrs = { readonly [K in AllowedAttr]?: AttrTypes[K] | undefined };

export type AllowedTag =
  | 'svg'
  | 'g'
  | 'path'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'polygon'
  | 'polyline'
  | 'line'
  | 'text'
  | 'tspan'
  | 'a'
  | 'title'
  | 'desc'
  | 'image'
  | 'animate';

/**
 * The gradient's elements (D182). They are on the allow-list, but only the writer emits them,
 * once per SVG as the root's first child; renderers and `postRender` hooks cannot.
 */
export type GradientTag = 'defs' | 'linearGradient' | 'stop';
/** The gradient's attributes, written by the writer on `linearGradient` and `stop` only. */
export type GradientAttr = 'offset' | 'stop-color' | 'stop-opacity' | 'gradientUnits';

/** The render's gradient (D182), as the theme gives it to the writer. */
export interface SvgGradient {
  /** The `linearGradient` id, `<scope>-gradient`; outlines refer to it as `url(#id)`. */
  readonly id: string;
  readonly start: StopColor;
  readonly stop: StopColor;
}

/**
 * A user-space linear gradient (D391): horizontal, `from` at (x1, y) to `to` at (x2, y), in the
 * user units of the element that refers to it. `SvgWriter.linearGradient()` takes it.
 */
export interface LinearGradient {
  readonly x1: number;
  readonly x2: number;
  /** Both ends' y (`y1 = y2`); 0 when left out. */
  readonly y?: number;
  readonly from: StopColor;
  readonly to: StopColor;
}

/** A warning raised by a safety check. The pipeline forwards these to `ctx.warn`. */
export interface SvgWarning {
  code:
    | 'URL_REFUSED'
    | 'LINK_TARGET_DROPPED'
    | 'SECURITY_LEVEL'
    | 'STYLE_PROPERTY_DROPPED'
    | 'STYLE_VALUE_DROPPED';
  message: string;
}

export type Warn = (warning: SvgWarning) => void;
