/**
 * `assertInert`: the output allow-list check (R-SEC-2). Tests run it over every rendered
 * output, and the pipeline re-runs it after `postRender` hooks, so a hook cannot bring in
 * `<script>`, `on*`, `<style>`, `foreignObject` or a script-capable URL.
 *
 * A linear hand-written scanner: the input may be hostile, so no backtracking regexes.
 * Structure follows Pele's test oracle (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano), tests/support/inert.ts at 3a2f075.
 */
import {
  ALLOWED_ATTRS,
  ALLOWED_TAGS,
  BLANK_REL,
  GRADIENT_ATTRS,
  GRADIENT_FIXED,
  GRADIENT_TAGS,
  HREF_TAGS,
  LINK_TARGETS,
  NUMERIC_ATTRS,
  RE_GRADIENT_ID,
  RE_USER_GRADIENT_ID,
  SVG_NS,
} from './allowlist.js';
import { RE_INVALID_XML } from './escape.js';
import {
  BLEND,
  BLEND_MODES,
  RE_UNSAFE_STYLE,
  STYLE_TEXT_PROPERTIES,
  checkColor,
  checkFilter,
  styleSheetProblem,
} from './style.js';
import type { EmbeddedSvg } from './types.js';
import { isImageDataUrl, type SecurityLevel } from './url.js';

export interface InertOptions {
  readonly securityLevel?: SecurityLevel;
  /** The integrator's link schemes, when not the default http, https and mailto. */
  readonly linkSchemes?: readonly string[];
  /**
   * Accept one `<style>` directly under the root `<svg>` holding a `theme: 'auto'` sheet
   * (R-THEME-8): custom properties only, as `themeStyleSheet()` builds it. Any other
   * `<style>` is still rejected.
   */
  readonly themeStyle?: boolean;
  /**
   * The render's gradient (D182): its id, or `false` when the render has none, so no such
   * gradient is accepted. Left out, the id is the one the document's gradient declares, which
   * must look like `<scope>-gradient`.
   */
  readonly gradient?: string | false;
  /**
   * The render's style scope: every user-space gradient (D391) must be `<scope>-g-<hash>`. Left
   * out, it is the render's gradient's (`<scope>-gradient`, given or found first), else the
   * first user-space gradient's, and the others must share it. The pipeline always gives it.
   */
  readonly scope?: string;
}

/**
 * Where the scan is in the `<defs>` an SVG may carry: at most one render's gradient (D182) and
 * any number of user-space gradients (D391), each with two stops.
 */
interface GradientScan {
  /** The render's gradient's id, given or found. */
  id: string | undefined;
  /** The user-space gradients' scope, given or found. */
  scope: string | undefined;
  /** Elements the root has had so far. */
  rootChildren: number;
  defs: number;
  /** Render's gradients (D182) so far. */
  box: number;
  /** Every gradient id the document has declared. */
  ids: Set<string>;
  /** The current `<linearGradient>`'s attributes, kind and stops. */
  attrs: Record<string, string>;
  user: boolean;
  stops: number;
}

const RE_FRACTION = /^(?:0|1|0?\.\d{1,6})$/;
const RE_PERCENT_STOP = /^(?:\d{1,2}(?:\.\d{1,6})?|100)%$/;

/** Why element `tag` cannot stand under `parent` here, as far as the gradient goes. */
function gradientPlace(
  tag: string,
  stack: readonly string[],
  base: number,
  g: GradientScan
): string | undefined {
  const parent = stack[stack.length - 1];
  const depth = stack.length - base;
  if (depth === 1) g.rootChildren++;
  switch (tag) {
    case 'defs':
      if (depth !== 1 || parent !== 'svg' || g.rootChildren !== 1 || ++g.defs > 1)
        return '<defs> that is not the first child of <svg>';
      return undefined;
    case 'linearGradient':
      if (parent !== 'defs') return '<linearGradient> out of place';
      g.attrs = {};
      g.stops = 0;
      return undefined;
    case 'stop':
      return parent === 'linearGradient' && ++g.stops <= 2 ? undefined : '<stop> out of place';
  }
  return parent !== undefined && GRADIENT_TAGS.has(parent) ? `<${tag}> in <${parent}>` : undefined;
}

/** Why an attribute of the gradient's elements, or one only they take, is not allowed. */
function gradientAttrProblem(
  tag: string,
  name: string,
  value: string,
  g: GradientScan
): string | undefined {
  const owner = GRADIENT_ATTRS.get(name);
  if (owner !== undefined && owner !== tag) return `${name} on <${tag}>`;
  if (tag === 'linearGradient') {
    // Checked as a whole at the end of the start tag (gradientShape).
    g.attrs[name] = value;
    return undefined;
  }
  if (tag === 'stop') {
    if (name === 'offset')
      return RE_FRACTION.test(value) || RE_PERCENT_STOP.test(value)
        ? undefined
        : `offset="${value}"`;
    if (name === 'stop-color') return checkColor(value) ? undefined : `stop-color="${value}"`;
    if (name === 'stop-opacity')
      return !g.user && RE_FRACTION.test(value) ? undefined : `stop-opacity="${value}"`;
    return `${name} on <stop>`;
  }
  if (tag === 'defs') return `${name} on <defs>`;
  if (name === 'id' && (value === g.id || g.ids.has(value))) return `id="${value}" is a gradient's`;
  return undefined;
}

/**
 * Why the `<linearGradient>` just started is neither the render's gradient (D182) nor a
 * user-space one (D391): `userSpaceOnUse`, `<scope>-g-<hash>`, numeric x1, x2 and y1 = y2.
 */
function gradientShape(g: GradientScan, options: InertOptions): string | undefined {
  const a = g.attrs;
  const id = a.id ?? '';
  const n = Object.keys(a).length;
  g.user = a.gradientUnits === 'userSpaceOnUse';
  if (g.user) {
    const scope = RE_USER_GRADIENT_ID.exec(id)?.[1];
    g.scope ??= scope;
    if (scope === undefined || scope !== g.scope) return `gradient id="${id}" is not this SVG's`;
    // attrProblem has checked each coordinate is a number.
    if (
      n !== 6 ||
      a.x1 === undefined ||
      a.x2 === undefined ||
      a.y1 === undefined ||
      a.y2 === undefined ||
      a.y1 !== a.y2
    )
      return `<linearGradient id="${id}"> that is not horizontal in user space`;
  } else {
    if (options.gradient === false) return '<defs> holds a gradient this render does not have';
    if (g.id === undefined && RE_GRADIENT_ID.test(id)) g.id = id;
    if (id !== g.id || ++g.box > 1) return `gradient id="${id}" is not this SVG's`;
    // The user-space gradients after it are in its scope.
    g.scope ??= id.slice(0, -9);
    if (n !== Object.keys(GRADIENT_FIXED).length + 1)
      return '<linearGradient> without its id, units and direction';
    for (const k in GRADIENT_FIXED)
      if (a[k] !== GRADIENT_FIXED[k]) return `${k}="${a[k]}" on <linearGradient>`;
  }
  if (g.ids.has(id)) return `a second gradient id="${id}"`;
  g.ids.add(id);
  return undefined;
}

/**
 * A `fill` or `stroke` that refers to a gradient: only `url(#<id>)`, after the gradient. Any
 * other `url(` (and `url(` anywhere else) is left to `attrProblem`, which rejects it.
 */
function gradientRef(name: string, value: string, g: GradientScan): boolean {
  return (
    (name === 'fill' || name === 'stroke') &&
    value.startsWith('url(#') &&
    value.endsWith(')') &&
    g.ids.has(value.slice(5, -1))
  );
}

const RE_NUMBER = /^-?\d{1,15}(?:\.\d{1,15})?(?:e[-+]?\d{1,3})?$/;
const RE_PERCENT = /^\d{1,15}(?:\.\d{1,15})?%$/;
const RE_NUMBER_LIST = /^[\d\s,.eE+-]*$/;
// cspell:disable-next-line
const RE_PATH = /^[MLHVCSQTAZmlhvcsqtaz\d\s,.eE+-]*$/;
const RE_ALIAS_REF = /^var\(--_[A-Za-z0-9_-]{1,64}\)$/;
// A palette slot as `AllowedAttr['data-color-id']` types it, `color-<n>`.
const RE_COLOR_ID = /^color-\d{1,3}$/;
const RE_TRANSFORM_CHARS = /^[a-zA-Z(),.\d\s+-]*$/;
const TRANSFORMS: ReadonlySet<string> = new Set([
  'translate',
  'rotate',
  'scale',
  'matrix',
  'skewX',
  'skewY',
  'e',
]);
const RE_WORD = /[a-zA-Z]+/g;
const RE_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const RE_NETWORK_PATH = /^[\\/]{2}/;
const RE_ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d{1,8}|#x[0-9a-fA-F]{1,8});/;
const FILL_RULES: ReadonlySet<string> = new Set(['nonzero', 'evenodd']);
const CURSORS: ReadonlySet<string> = new Set(['pointer']);
// An `<animate>` may move a dash pattern and nothing else (D606): never `href`, never an event.
const ANIMATED: ReadonlySet<string> = new Set(['stroke-dashoffset']);
const REPEATS: ReadonlySet<string> = new Set(['indefinite']);
const PAINT_LIKE: ReadonlySet<string> = new Set([
  'fill',
  'stroke',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'letter-spacing',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
]);

function decodeAttr(value: string): string {
  if (!value.includes('&')) return value;
  return value
    .replace(/&#x([0-9a-fA-F]{1,8});/g, (_m, hex: string) =>
      String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff))
    )
    .replace(/&#(\d{1,8});/g, (_m, dec: string) =>
      String.fromCodePoint(Math.min(Number(dec), 0x10ffff))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Every `&` must start a well-formed reference.
function badAmp(text: string): boolean {
  for (let i = text.indexOf('&'); i !== -1; i = text.indexOf('&', i + 1)) {
    if (!RE_ENTITY.test(text.slice(i, i + 12))) return true;
  }
  return false;
}

function decodePercent(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

// What a browser makes of an href: tabs and line breaks dropped, then leading spaces and controls.
// eslint-disable-next-line no-control-regex -- C0 controls are what browsers strip
const RE_LEADING_CTRL = /^[\u0000-\u0020]+/;
function browserView(value: string): string {
  return value.replace(/[\t\n\r]/g, '').replace(RE_LEADING_CTRL, '');
}

function hrefProblem(tag: string, value: string, options: InertOptions): string | undefined {
  const stricter = options.securityLevel === 'stricter';
  const image = tag === 'image';
  const seen = browserView(value);
  // An image source follows checkImageUrl: raster data URLs, and no mail or link schemes.
  if (image && isImageDataUrl(seen) && isImageDataUrl(decodePercent(seen))) return undefined;
  let schemes: readonly string[] = options.linkSchemes ?? ['http', 'https', 'mailto'];
  if (stricter) schemes = [];
  else if (image) schemes = ['http', 'https'];
  for (const form of [seen, browserView(decodePercent(seen))]) {
    if (RE_NETWORK_PATH.test(form)) return `href="${value}" is a network path`;
    const scheme = RE_SCHEME.exec(form);
    if (scheme && !schemes.includes((scheme[1] as string).toLowerCase()))
      return `href="${value}" has a scheme that is not allowed`;
  }
  return undefined;
}

/** Why a value is not allowed for an attribute of this name on this tag, or undefined. */
type AttrRule = (
  tag: string,
  name: string,
  value: string,
  options: InertOptions
) => string | undefined;

const shown = (name: string, value: string): string => `${name}="${value}"`;

/** The value must match `re`. */
const matching =
  (re: RegExp): AttrRule =>
  (_tag, name, value) =>
    re.test(value) ? undefined : shown(name, value);

/** The value must be one of `set`. */
const among =
  (set: ReadonlySet<string>): AttrRule =>
  (_tag, name, value) =>
    set.has(value) ? undefined : shown(name, value);

const sizeRule: AttrRule = (_tag, name, value) =>
  RE_NUMBER.test(value) || RE_PERCENT.test(value) ? undefined : `${name}="${value}" is not a size`;

const xmlnsRule: AttrRule = (tag, _name, value) =>
  tag === 'svg' && value === SVG_NS ? undefined : `xmlns="${value}" on <${tag}>`;

const hrefRule: AttrRule = (tag, _name, value, options) =>
  HREF_TAGS.has(tag) ? hrefProblem(tag, value, options) : `href on <${tag}>`;

const relRule: AttrRule = (_tag, _name, value) =>
  value === BLANK_REL ? undefined : `rel="${value}"`;

const transformRule: AttrRule = (_tag, name, value) => {
  if (!RE_TRANSFORM_CHARS.test(value)) return shown(name, value);
  for (const word of value.match(RE_WORD) ?? [])
    if (!TRANSFORMS.has(word)) return shown(name, value);
  return undefined;
};

// A theme alias, or a drop-shadow list: never url(), which could load or reference.
const filterRule: AttrRule = (_tag, name, value) =>
  RE_ALIAS_REF.test(value) || checkFilter(value) !== undefined ? undefined : shown(name, value);

const styleRule: AttrRule = (_tag, name, value) => {
  for (const decl of value.split(';')) {
    if (decl.trim() === '') continue;
    const at = decl.indexOf(':');
    const prop = (at < 0 ? decl : decl.slice(0, at)).trim();
    if (at < 0 || (!prop.startsWith('--') && !STYLE_TEXT_PROPERTIES.has(prop)))
      return `style property ${prop}`;
    const v = decl.slice(at + 1);
    if (RE_UNSAFE_STYLE.test(v) || (prop === BLEND && !BLEND_MODES.has(v.trim())))
      return shown(name, value);
  }
  return undefined;
};

const ATTR_RULES: ReadonlyMap<string, AttrRule> = new Map<string, AttrRule>([
  ['width', sizeRule],
  ['height', sizeRule],
  ['xmlns', xmlnsRule],
  ['href', hrefRule],
  ['target', among(LINK_TARGETS)],
  ['rel', relRule],
  ['d', matching(RE_PATH)],
  ['points', matching(RE_NUMBER_LIST)],
  ['viewBox', matching(RE_NUMBER_LIST)],
  ['transform', transformRule],
  ['fill-rule', among(FILL_RULES)],
  ['clip-rule', among(FILL_RULES)],
  ['data-color-id', matching(RE_COLOR_ID)],
  ['cursor', among(CURSORS)],
  ['attributeName', among(ANIMATED)],
  ['repeatCount', among(REPEATS)],
  ['filter', filterRule],
  ['style', styleRule],
]);

function attrProblem(
  tag: string,
  name: string,
  value: string,
  options: InertOptions
): string | undefined {
  if (!ALLOWED_ATTRS.has(name)) return `attribute ${name} on <${tag}>`;
  if (NUMERIC_ATTRS.has(name))
    return RE_NUMBER.test(value) ? undefined : `${name}="${value}" is not a number`;
  const rule = ATTR_RULES.get(name);
  if (rule !== undefined) return rule(tag, name, value, options);
  if (PAINT_LIKE.has(name) && RE_UNSAFE_STYLE.test(value)) return shown(name, value);
  return undefined;
}

const STYLE_OPEN = '<style>';
const STYLE_CLOSE = '</style>';

/** One root `<svg>`'s scope: the outer root's, or an embedded diagram's (ADR-15). */
interface Scope {
  /** Where the root sits in the element stack. */
  readonly base: number;
  readonly options: InertOptions;
  readonly g: GradientScan;
  sheets: number;
}

function scopeOf(base: number, options: InertOptions): Scope {
  const g: GradientScan = {
    id: typeof options.gradient === 'string' ? options.gradient : undefined,
    scope:
      options.scope ??
      (typeof options.gradient === 'string' ? options.gradient.slice(0, -9) : undefined),
    rootChildren: 0,
    defs: 0,
    box: 0,
    ids: new Set(),
    attrs: {},
    user: false,
    stops: 0,
  };
  return { base, options, g, sheets: 0 };
}

/**
 * Where the scan is: the markup, the position in it, the open elements and the roots they sit
 * under, and the start tag being read.
 */
interface Scan {
  readonly svg: string;
  readonly n: number;
  readonly options: InertOptions;
  i: number;
  /** Where the next `<` is, or -1. */
  lt: number;
  readonly stack: string[];
  /** The outer root, then each embedded diagram's root (ADR-15) open around the scan. */
  readonly frames: Scope[];
  /** The innermost root's scope: its own style sheet, gradients and scope. */
  f: Scope;
  /** The start tag being read: its attributes by name, and whether it ends `/>`. */
  attrs: Map<string, string>;
  selfClosing: boolean;
}

function skipSpace(s: Scan): void {
  while (s.i < s.n && /\s/.test(s.svg[s.i] as string)) s.i++;
}

/** The name at the position, as far as name characters go. */
function readName(s: Scan): string {
  const start = s.i;
  while (s.i < s.n && /[\w:.-]/.test(s.svg[s.i] as string)) s.i++;
  return s.svg.slice(start, s.i);
}

/** The text up to the next `<`: no `>`, and every `&` a reference. */
function textProblem(s: Scan): string | undefined {
  s.lt = s.svg.indexOf('<', s.i);
  const text = s.svg.slice(s.i, s.lt === -1 ? s.n : s.lt);
  if (text.includes('>')) return `unescaped ">" in text near ${JSON.stringify(text.slice(0, 40))}`;
  if (badAmp(text)) return `unescaped "&" in text near ${JSON.stringify(text.slice(0, 40))}`;
  return undefined;
}

/** A `<style>` under the root (`theme: 'auto'`): one sheet of custom properties, skipped over. */
function styleProblem(s: Scan): string | undefined {
  const { svg, stack, f } = s;
  if (svg.slice(s.lt, s.lt + STYLE_OPEN.length) !== STYLE_OPEN) return '<style> with attributes';
  if (stack.length !== f.base + 1 || stack[f.base] !== 'svg')
    return '<style> that is not a child of <svg>';
  if (++f.sheets > 1) return 'a second <style>';
  f.g.rootChildren++;
  const end = svg.indexOf(STYLE_CLOSE, s.lt);
  if (end === -1) return 'unclosed <style>';
  const css = svg.slice(s.lt + STYLE_OPEN.length, end);
  if (css.includes('<') || css.includes('&')) return 'markup in <style>';
  const problem = styleSheetProblem(css);
  if (problem !== undefined) return `<style> holds ${problem}`;
  s.i = end + STYLE_CLOSE.length;
  return undefined;
}

/** `</tag>`: it closes the open element, and that ends its gradient, `<defs>` or embedded root. */
function closingProblem(s: Scan, tag: string): string | undefined {
  skipSpace(s);
  if (s.svg[s.i] !== '>') return `malformed </${tag}>`;
  s.i++;
  const { stack, frames } = s;
  const open = stack.pop();
  if (open !== tag) return `</${tag}> closes <${open ?? 'nothing'}>`;
  if (tag === 'linearGradient' && s.f.g.stops !== 2) return '<linearGradient> without two stops';
  if (tag === 'defs' && s.f.g.ids.size === 0) return '<defs> without a gradient';
  if (tag === 'svg' && frames.length > 1 && stack.length === s.f.base) {
    frames.pop();
    s.f = frames[frames.length - 1] as Scope;
  }
  return undefined;
}

/** One `name="value"` of the start tag `tag`: well-formed, once, and allowed. */
function attributeProblem(s: Scan, tag: string): string | undefined {
  const { svg } = s;
  const name = readName(s);
  if (name === '' || svg[s.i] !== '=' || svg[s.i + 1] !== '"')
    return `malformed attribute on <${tag}>`;
  s.i += 2;
  const end = svg.indexOf('"', s.i);
  if (end === -1) return `unterminated attribute ${name} on <${tag}>`;
  const raw = svg.slice(s.i, end);
  s.i = end + 1;
  if (raw.includes('<')) return `"<" in attribute ${name} on <${tag}>`;
  if (badAmp(raw)) return `unescaped "&" in attribute ${name} on <${tag}>`;
  if (s.attrs.has(name)) return `<${tag}> has ${name} twice`;
  s.attrs.set(name, '');
  const value = decodeAttr(raw);
  const g = s.f.g;
  const problem =
    gradientAttrProblem(tag, name, value, g) ??
    (gradientRef(name, value, g) ? undefined : attrProblem(tag, name, value, s.options));
  if (problem !== undefined) return problem;
  s.attrs.set(name, value);
  return undefined;
}

/** The attributes of the start tag `tag`, up to its `>` or `/>`. */
function attributesProblem(s: Scan, tag: string): string | undefined {
  s.attrs = new Map();
  s.selfClosing = false;
  for (;;) {
    const before = s.i;
    skipSpace(s);
    if (s.svg[s.i] === '>') {
      s.i++;
      return undefined;
    }
    if (s.svg[s.i] === '/' && s.svg[s.i + 1] === '>') {
      s.i += 2;
      s.selfClosing = true;
      return undefined;
    }
    if (s.i === before) return `malformed <${tag}>`;
    const problem = attributeProblem(s, tag);
    if (problem !== undefined) return problem;
  }
}

/**
 * `<tag ...>`: where the element may stand, its attributes, what the whole tag must satisfy,
 * then it opens (unless it ends `/>`).
 */
function openingProblem(s: Scan, tag: string): string | undefined {
  const problem = gradientPlace(tag, s.stack, s.f.base, s.f.g) ?? attributesProblem(s, tag);
  if (problem !== undefined) return problem;
  if (s.attrs.get('target') === '_blank' && s.attrs.get('rel') !== BLANK_REL)
    return `<${tag} target="_blank"> without rel="${BLANK_REL}"`;
  if (tag === 'linearGradient') {
    const shape = gradientShape(s.f.g, s.f.options);
    if (shape !== undefined) return shape;
  }
  if (s.selfClosing && (tag === 'defs' || tag === 'linearGradient')) return `an empty <${tag}>`;
  if (tag === 'stop' && !s.attrs.has('offset')) return '<stop> without an offset';
  if (!s.selfClosing) {
    // A nested root opens an embedded diagram's scope.
    if (tag === 'svg' && s.stack.length > 0) {
      s.f = scopeOf(s.stack.length, { ...s.options, gradient: undefined, scope: undefined });
      s.frames.push(s.f);
    }
    s.stack.push(tag);
  }
  return undefined;
}

/** The markup at the `<` `s.lt`: a `<style>` sheet, an end tag or a start tag. */
function markupProblem(s: Scan): string | undefined {
  const { svg } = s;
  s.i = s.lt + 1;
  const closing = svg[s.i] === '/';
  if (closing) s.i++;
  const tag = readName(s);
  if (tag === '' || !/^[A-Za-z]/.test(tag))
    return `markup ${JSON.stringify(svg.slice(s.lt, s.lt + 20))}`;
  if (tag === 'style' && s.options.themeStyle && !closing) return styleProblem(s);
  if (!ALLOWED_TAGS.has(tag)) return `element <${tag}>`;
  return closing ? closingProblem(s, tag) : openingProblem(s, tag);
}

/**
 * The first thing about the markup that is not inert, or undefined when there is none. A
 * nested `<svg>` (an embedded diagram, ADR-15) is checked as a root of its own: one `<style>`
 * and one `<defs>` directly under it, its own gradient scope.
 */
export function inertProblem(svg: string, options: InertOptions = {}): string | undefined {
  const bad = RE_INVALID_XML.exec(svg);
  if (bad) return `character U+${bad[0].charCodeAt(0).toString(16).toUpperCase()} at ${bad.index}`;
  const root = scopeOf(0, options);
  const s: Scan = {
    svg,
    n: svg.length,
    options,
    i: 0,
    lt: -1,
    stack: [],
    frames: [root],
    f: root,
    attrs: new Map(),
    selfClosing: false,
  };
  while (s.i < s.n) {
    const problem = textProblem(s) ?? (s.lt === -1 ? undefined : markupProblem(s));
    if (problem !== undefined) return problem;
    if (s.lt === -1) break;
  }
  if (s.stack.length > 0) return `unclosed <${s.stack[s.stack.length - 1]}>`;
  return undefined;
}

/** Throws when the markup is not inert. */
export function assertInert(svg: string, options?: InertOptions): void {
  const problem = inertProblem(svg, options);
  if (problem !== undefined) throw new Error(`SVG output is not inert: ${problem}`);
}

/**
 * `svg`, a finished diagram's root `<svg>`, as markup a host may splice in with
 * `SvgWriter.embed()` (ADR-15). Throws unless it is one root element and inert under `options`
 * (its `theme: 'auto'` sheet allowed).
 */
export function embeddedSvg(svg: string, options: InertOptions = {}): EmbeddedSvg {
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>'))
    throw new Error('An embedded diagram must be one root <svg>');
  const problem = inertProblem(svg, { ...options, themeStyle: true });
  if (problem !== undefined) throw new Error(`Embedded SVG is not inert: ${problem}`);
  return svg as EmbeddedSvg;
}
