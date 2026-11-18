/**
 * The security allow-list (R-SEC-2). The writer, the `SvgTree` view and `assertInert` all
 * derive from these tables, so what can be written and what is accepted start as the same list.
 * A new diagram type that needs another element or attribute adds it here and in
 * `types.ts`, with care.
 *
 * The writers' tables (`WRITABLE_TAGS`, `PLAIN_ATTRS`) are snapshots taken at module load,
 * while `assertInert` and the extension checks read the live `ALLOWED_TAGS` / `ALLOWED_ATTRS`.
 * Those two are exported as `Set`s, but mutating them after load is unsupported: the writers
 * would not see the change, so the lists would no longer agree.
 */
import { escAttr } from './escape.js';
import type { AllowedAttr, AllowedTag, AttrTypes, GradientAttr, GradientTag } from './types.js';

const TAG_TABLE: Record<AllowedTag | GradientTag, true> = {
  svg: true,
  g: true,
  path: true,
  rect: true,
  circle: true,
  ellipse: true,
  polygon: true,
  polyline: true,
  line: true,
  text: true,
  tspan: true,
  a: true,
  title: true,
  desc: true,
  image: true,
  animate: true,
  defs: true,
  linearGradient: true,
  stop: true,
};

const ATTR_TABLE: Record<AllowedAttr | GradientAttr, true> = {
  xmlns: true,
  viewBox: true,
  width: true,
  height: true,
  preserveAspectRatio: true,
  class: true,
  id: true,
  role: true,
  'aria-roledescription': true,
  'aria-labelledby': true,
  'aria-describedby': true,
  'aria-label': true,
  'aria-hidden': true,
  'data-id': true,
  'data-ast': true,
  'data-mermaid-version': true,
  'data-p': true,
  'data-color-id': true,
  'data-venn-sets': true,
  style: true,
  transform: true,
  'pointer-events': true,
  cursor: true,
  x: true,
  y: true,
  x1: true,
  y1: true,
  x2: true,
  y2: true,
  cx: true,
  cy: true,
  r: true,
  rx: true,
  ry: true,
  dx: true,
  dy: true,
  d: true,
  points: true,
  fill: true,
  'fill-opacity': true,
  'fill-rule': true,
  'clip-rule': true,
  stroke: true,
  'stroke-width': true,
  'stroke-dasharray': true,
  'stroke-dashoffset': true,
  'stroke-linecap': true,
  'stroke-linejoin': true,
  'stroke-miterlimit': true,
  'stroke-opacity': true,
  opacity: true,
  filter: true,
  color: true,
  'font-family': true,
  'font-size': true,
  'font-weight': true,
  'font-style': true,
  'text-anchor': true,
  'dominant-baseline': true,
  'text-decoration': true,
  'letter-spacing': true,
  'xml:space': true,
  href: true,
  target: true,
  rel: true,
  attributeName: true,
  from: true,
  to: true,
  dur: true,
  repeatCount: true,
  offset: true,
  'stop-color': true,
  'stop-opacity': true,
  gradientUnits: true,
};

/** Every element the writer may emit. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set(Object.keys(TAG_TABLE));
/** Every attribute the writer may emit. */
export const ALLOWED_ATTRS: ReadonlySet<string> = new Set(Object.keys(ATTR_TABLE));
/** The gradients' elements: only the writer itself emits them (D182, D391). */
export const GRADIENT_TAGS: ReadonlySet<string> = new Set<GradientTag>([
  'defs',
  'linearGradient',
  'stop',
]);
/** The gradient's attributes, by the one element each belongs on. */
export const GRADIENT_ATTRS: ReadonlyMap<string, GradientTag> = new Map<GradientAttr, GradientTag>([
  ['gradientUnits', 'linearGradient'],
  ['offset', 'stop'],
  ['stop-color', 'stop'],
  ['stop-opacity', 'stop'],
]);
/**
 * The render's gradient (D182): `linearGradient`'s attributes other than `id`, with
 * their only values. A horizontal gradient over each outline's bounding box (v12 insertLookDefs'
 * 0% → 100%, as the fractions objectBoundingBox units take).
 */
export const GRADIENT_FIXED: Readonly<Record<string, string>> = {
  gradientUnits: 'objectBoundingBox',
  x1: '0',
  y1: '0',
  x2: '1',
  y2: '0',
};
/** A gradient id: a style scope (`styleScope`) and `-gradient`. */
export const RE_GRADIENT_ID = /^[A-Za-z_][\w-]{0,63}-gradient$/;
/** A user-space gradient id (D391): a style scope, `-g-` and a base-36 hash. */
export const RE_USER_GRADIENT_ID = /^([A-Za-z_][\w-]{0,63})-g-[0-9a-z]{1,7}$/;
/** Elements that may hold character data. */
export const TEXT_HOLDERS: ReadonlySet<string> = new Set(['text', 'tspan', 'title', 'desc']);
/** Attributes whose value must be a number. */
export const NUMERIC_ATTRS: ReadonlySet<string> = new Set([
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'stroke-miterlimit',
  'from',
  'to',
  'dur',
]);
/** Elements that may carry `href`. */
export const HREF_TAGS: ReadonlySet<string> = new Set(['a', 'image']);
/** Link targets that are kept (D62). */
export const LINK_TARGETS: ReadonlySet<string> = new Set(['_self', '_blank', '_parent', '_top']);
/** The value of `rel` written on every `_blank` link. */
export const BLANK_REL = 'noopener noreferrer';
export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The tags `isAllowedTag` accepts, as one table: the writer checks each element against it with
 * one lookup. Derived from the tables above once, at module load.
 */
export const WRITABLE_TAGS: ReadonlySet<string> = new Set(
  [...ALLOWED_TAGS].filter((t) => !GRADIENT_TAGS.has(t))
);

/**
 * Keyword values the attribute types spell out (`AttrTypes`), such as `text-anchor="middle"` or
 * `fill="none"`. Each is a code constant, checked at module load to escape to itself, so the
 * stream writer writes an attribute value equal to one of them without testing it again.
 */
const KEYWORDS: { readonly [K in AllowedAttr]?: readonly Extract<AttrTypes[K], string>[] } = {
  preserveAspectRatio: ['none', 'xMidYMid meet', 'xMinYMin meet'],
  role: ['img', 'graphics-document', 'presentation'],
  'aria-hidden': ['true', 'false'],
  'pointer-events': ['none', 'all', 'visiblePainted'],
  cursor: ['pointer'],
  fill: ['none', 'currentColor', 'transparent'],
  stroke: ['none', 'currentColor', 'transparent'],
  color: ['none', 'currentColor', 'transparent'],
  'fill-rule': ['nonzero', 'evenodd'],
  'clip-rule': ['nonzero', 'evenodd'],
  'stroke-dasharray': ['none'],
  'stroke-linecap': ['butt', 'round', 'square'],
  'stroke-linejoin': ['miter', 'round', 'bevel'],
  'font-weight': ['normal', 'bold'],
  'font-style': ['normal', 'italic'],
  'text-anchor': ['start', 'middle', 'end'],
  'dominant-baseline': ['auto', 'middle', 'central', 'hanging', 'alphabetic', 'text-before-edge'],
  'text-decoration': ['underline', 'line-through', 'none'],
  'xml:space': ['preserve'],
  target: ['_self', '_blank', '_parent', '_top'],
  rel: ['noopener noreferrer'],
  attributeName: ['stroke-dashoffset'],
  repeatCount: ['indefinite'],
};

/**
 * Attributes whose name check does not depend on the element, each with its keyword values
 * (often none): every allowed attribute except the gradient's (only the writer writes those)
 * and `href` and `xmlns` (allowed on some elements only). A name found here passes every name
 * check `formatValue` makes, on any element; any other name takes those checks one by one.
 * Derived from the tables above once, at module load.
 */
export const PLAIN_ATTRS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  [...ALLOWED_ATTRS]
    .filter((n) => !GRADIENT_ATTRS.has(n) && n !== 'href' && n !== 'xmlns')
    .map((n): [string, ReadonlySet<string>] => {
      const keywords = new Set(KEYWORDS[n as AllowedAttr]);
      for (const k of keywords) if (escAttr(k) !== k) throw new Error(`${k} needs escaping`);
      return [n, keywords];
    })
);

/** A tag renderers and hooks may write (the gradient's are the writer's own). */
export function isAllowedTag(tag: string): tag is AllowedTag {
  return ALLOWED_TAGS.has(tag) && !GRADIENT_TAGS.has(tag);
}

/** An attribute renderers and hooks may write (the gradient's are the writer's own). */
export function isAllowedAttr(name: string): name is AllowedAttr {
  return ALLOWED_ATTRS.has(name) && !GRADIENT_ATTRS.has(name);
}
