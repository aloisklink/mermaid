/**
 * The typed SVG writer (DESIGN §7.1, ADR-3): the only way to produce markup. One API,
 * two backings with byte-identical output: streaming into a string (default) and the
 * compact tree used when a `postRender` hook is registered.
 */
import { BLANK_REL, GRADIENT_FIXED, PLAIN_ATTRS, TEXT_HOLDERS } from './allowlist.js';
import { checkName, checkTag, formatChecked } from './encode.js';
import { esc, escAttr, num } from './escape.js';
import { isBuilt, pathBuilder, transforms, translate, type PathBuilder } from './path.js';
import { checkColor, hash36, styleScope } from './style.js';
import { CompactTree, type SvgTree } from './tree.js';
import type {
  AllowedTag,
  Attrs,
  EmbeddedSvg,
  GradientRef,
  LinearGradient,
  SvgGradient,
  ThemeStyleSheet,
} from './types.js';

/** One run of text with uniform emphasis. */
export interface LabelSpan {
  readonly text: string;
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  /** Extra checked attributes for this span's `<tspan>` (for example a theme font). */
  readonly attrs?: Attrs;
  /** `'box'` for an inline box ({@link LabelBoxSpan}); text spans leave it out. */
  readonly kind?: 'box';
  /**
   * Advance width in px. The label layout always sets it; the writer needs it only for a label
   * that holds a box, whose lines it then positions itself.
   */
  readonly width?: number;
}

/**
 * A detached piece of markup: an element, its attributes and its children. The writer replays
 * it through `open`/`leaf`/`text`/`close`, so it is held to the same allow-list (R-SEC-2).
 */
export interface SvgFragment {
  readonly tag: AllowedTag;
  readonly attrs?: Attrs;
  /** Child elements, and character data (only inside `text`/`tspan`/`title`/`desc`). */
  readonly children?: readonly (SvgFragment | string)[];
}

/**
 * A measured box that an extension supplies for a delimited span of label text (D177): typeset
 * math, icons. Lengths are px. `node` is drawn with the box's top-left corner at its origin.
 */
export interface InlineBox {
  readonly width: number;
  readonly height: number;
  /** Distance from the top of the box to its baseline, which sits on the line's baseline. */
  readonly baseline: number;
  readonly node: SvgFragment;
}

/** An inline box in a label line. `text` is its source as written (`$$x^2$$`). */
export type LabelBoxSpan = LabelSpan & InlineBox & { readonly kind: 'box' };

/**
 * A measured label, as the label layout produces it. Lines are drawn centred on a point;
 * `baseline` is the distance from the top of a line box to its baseline (from the
 * measurer's ascent/descent), so no font-size heuristic is needed here.
 */
export interface LabelBox {
  readonly lines: readonly (readonly LabelSpan[])[];
  /** Height of one line box. */
  readonly lineHeight: number;
  /** Height of the whole label (normally `lines.length * lineHeight`). */
  readonly height: number;
  /** Distance from the top of a line box to its baseline. */
  readonly baseline: number;
  /**
   * Draw the lines left-aligned as one block (bullet lists): each line starts `indents[i]` from
   * the left edge of a box `width` wide centred on the point. Needs `width`.
   */
  readonly left?: boolean;
  /** Width of the widest line, its indent included. */
  readonly width?: number;
  /** Offset of each line from the left edge of the box. */
  readonly indents?: readonly number[];
  /**
   * Distance from the top of the label to each line's baseline, set when a box taller than the
   * font grows its line. Without it, line `i`'s baseline is `i * lineHeight + baseline`.
   */
  readonly baselines?: readonly number[];
}

/**
 * What an outline draws (D302): a node's shape, a part of one (a compartment, an underlay), a
 * divider line inside a node, a small mark (a dot, a cross), a group's frame, or an edge line.
 */
export type OutlineRole = 'node' | 'part' | 'divider' | 'mark' | 'group' | 'edge';

/** The elements an outline can be. */
export type OutlineTag = 'rect' | 'circle' | 'ellipse' | 'polygon' | 'line' | 'path';

/**
 * Where an outline drawer writes its replacement: `<g>` groups and `<path>` leaves only. Core
 * checks every tag and attribute name, and that each `open` has its `close` within one `draw`.
 */
export interface OutlineSink {
  open(tag: 'g', attrs?: Attrs): void;
  leaf(tag: 'path', attrs?: Attrs): void;
  close(): void;
  /** A builder for `d` values, as `SvgWriter.path()`. */
  path(): PathBuilder;
}

/**
 * The drawer the writer calls for each outline: writes the replacement into `sink` and returns
 * true, or returns false for the plain leaf. The draw step installs the active extension's
 * drawer, already checked (`HookRun.outline`).
 */
export type OutlineDraw = (
  role: OutlineRole,
  tag: OutlineTag,
  attrs: Attrs,
  sink: OutlineSink
) => boolean;

export interface SvgWriter {
  open(tag: AllowedTag, attrs?: Attrs): void;
  close(): void;
  leaf(tag: AllowedTag, attrs?: Attrs): void;
  /**
   * A shape outline (D302): exactly `leaf(tag, attrs)` unless an extension's drawer is active,
   * which may draw it another way (hand-drawn). Arrowheads, label backgrounds and text are not
   * outlines.
   */
  outline(role: OutlineRole, tag: OutlineTag, attrs?: Attrs): void;
  /**
   * An edge line drawn plain in every look, for the types v12 never sketched (D301, D447):
   * exactly `leaf('path', attrs)`, never given to an outline drawer, yet found by the shared
   * edge-path step as `outline('edge', 'path', …)` is, so line hops apply to it (D537, #655).
   */
  plainEdge(attrs: Attrs): void;
  /** Character data, always escaped. Only `text`, `tspan`, `title` and `desc` hold text. */
  text(content: string): void;
  /** A measured label centred on (x, y), as `<text>`/`<tspan>`. */
  label(box: LabelBox, x: number, y: number, attrs?: Attrs): void;
  /** A builder for `d` values; numbers are formatted to two decimals. */
  path(): PathBuilder;
  /**
   * The `theme: 'auto'` style sheet, as a `<style>` child of the root `<svg>` (R-THEME-8).
   * `assertInert` accepts it only with `themeStyle: true`.
   */
  styleSheet(css: ThemeStyleSheet): void;
  /**
   * A user-space linear gradient (D391), as the paint for `fill` or `stroke`. The writer owns
   * the element: `finish()` writes it into the root's `<defs>` with the id
   * `<scope>-g-<hash of the ends and stops>`, once however often it is asked for in a render.
   */
  linearGradient(gradient: LinearGradient): GradientRef;
  /**
   * An embedded diagram's finished root `<svg>` (ADR-15), spliced in as one unit inside the
   * open element. It keeps its own `<style>`, `<defs>` and ids: `assertInert` checks each
   * nested root as a scope of its own.
   */
  embed(svg: EmbeddedSvg): void;
}

export interface WriterOptions {
  /**
   * The render's gradient (D182), `Theme.gradient()`. When an element's `fill` or `stroke`
   * is `url(#<id>)`, `finish()` writes it as the root's first child.
   */
  readonly gradient?: SvgGradient;
  /**
   * Internal: the active outline drawer (D302), which gets the writer itself as its sink. Only
   * the draw step sets it, with a drawer already guarded by `HookRun.outline` (the D302 sink
   * rules). Without one, `outline` is `leaf`.
   */
  readonly outline?: OutlineDraw;
  /**
   * The render's id prefix, read on the first `linearGradient()` call: its `styleScope` starts
   * every user-space gradient id (D391). `mermaid` when left out.
   */
  readonly idPrefix?: () => string;
}

const NO_ATTRS: Attrs = Object.freeze({});

/** `outline` on either backing: the drawer's replacement, or the plain leaf. */
function writeOutline(
  w: SvgWriter,
  draw: OutlineDraw | undefined,
  role: OutlineRole,
  tag: OutlineTag,
  attrs: Attrs | undefined
): void {
  if (!draw?.(role, tag, attrs ?? NO_ATTRS, w)) w.leaf(tag, attrs);
}

/** `url(#id)`, the value an outline that refers to the gradient carries. */
const refOf = (g: SvgGradient | undefined): string | undefined =>
  g === undefined ? undefined : `url(#${g.id})`;

const FIXED = Object.entries(GRADIENT_FIXED)
  .map(([k, v]) => ` ${k}="${v}"`)
  .join('');

/** A `<linearGradient>`'s two stops, `from` at 0 and `to` at 1, and its end tag. */
const stopsAndEnd = (from: string, to: string) =>
  `<stop offset="0" stop-color="${escAttr(from)}"/><stop offset="1" stop-color="${escAttr(to)}"/></linearGradient>`;

/**
 * The render's user-space gradients (D391), keyed by their written ends and stops, so equal
 * ones share an id. A hash that two different gradients share is hashed again, so ids stay
 * unique within the render.
 */
class UserGradients {
  private readonly ids = new Map<string, string>();
  private readonly taken = new Set<string>();
  markup = '';

  constructor(private readonly scope: string) {}

  ref(g: LinearGradient): GradientRef {
    for (const c of [g.from, g.to])
      if (checkColor(c) !== c) throw new TypeError(`${JSON.stringify(c)} is not a stop colour`);
    const y = num(g.y ?? 0);
    const ends = ` x1="${num(g.x1)}" y1="${y}" x2="${num(g.x2)}" y2="${y}"`;
    const key = ends + g.from + ' ' + g.to;
    let id = this.ids.get(key);
    if (id === undefined) {
      let k = key;
      while (this.taken.has((id = `${this.scope}-g-${hash36(k)}`))) k += ' ';
      this.ids.set(key, id);
      this.taken.add(id);
      this.markup +=
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"${ends}>` +
        stopsAndEnd(g.from, g.to);
    }
    return `url(#${id})` as GradientRef;
  }
}

/**
 * `svg` with the gradients' `<defs>` as the root's first child: the render's gradient (D182)
 * when an element refers to it, then the user-space ones (D391). Both backings escape `>` in
 * attribute values, so the first `>` ends the root's start tag.
 */
function withDefs(svg: string, g: SvgGradient | undefined, user: UserGradients | undefined) {
  if (g === undefined && !user) return svg;
  const end = svg.indexOf('>');
  if (end < 0 || svg[end - 1] === '/')
    throw new Error('SvgWriter: the gradient is referred to by an empty root');
  const defs =
    '<defs>' +
    (g ? `<linearGradient id="${escAttr(g.id)}"${FIXED}>` + stopsAndEnd(g.start, g.stop) : '') +
    (user?.markup ?? '') +
    '</defs>';
  return svg.slice(0, end + 1) + defs + svg.slice(end + 1);
}

/** The writer's user-space gradients, made on the first `linearGradient()` call. */
const usersOf = (idPrefix: (() => string) | undefined) =>
  new UserGradients(styleScope(idPrefix ? idPrefix() : 'mermaid'));

function checkSheetParent(top: string | undefined, depth: number): void {
  if (top !== 'svg' || depth !== 1)
    throw new TypeError('A theme style sheet must be a child of the root <svg>');
}

export interface StreamSvgWriter extends SvgWriter {
  /** The markup written so far. Throws if an element is still open. */
  finish(): string;
}

export interface TreeSvgWriter extends SvgWriter {
  /** The tree the writer has built, for `postRender` hooks to edit. */
  readonly tree: SvgTree;
  /** Serialises the (possibly edited) tree. Throws if an element is still open. */
  finish(): string;
}

function textDecoration(span: LabelSpan): Attrs['text-decoration'] {
  if (span.underline) return 'underline';
  return span.strike ? 'line-through' : span.attrs?.['text-decoration'];
}

function spanAttrs(span: LabelSpan, pos: Attrs | undefined): Attrs | undefined {
  if (!span.bold && !span.italic && !span.underline && !span.strike && !span.attrs) return pos;
  return {
    ...pos,
    ...span.attrs,
    'font-weight': span.bold ? 'bold' : span.attrs?.['font-weight'],
    'font-style': span.italic ? 'italic' : span.attrs?.['font-style'],
    'text-decoration': textDecoration(span),
  };
}

const isBox = (span: LabelSpan): span is LabelBoxSpan => span.kind === 'box';

/** Replays `node` into `w` through `open`/`leaf`/`text`/`close`, so the allow-list holds. */
export function writeFragment(w: SvgWriter, node: SvgFragment): void {
  const children = node.children;
  if (!children || children.length === 0) {
    w.leaf(node.tag, node.attrs);
    return;
  }
  w.open(node.tag, node.attrs);
  for (const child of children) {
    if (typeof child === 'string') w.text(child);
    else writeFragment(w, child);
  }
  w.close();
}

/**
 * A label with inline boxes: every line is placed from its measured widths, with
 * `text-anchor: start`, so the text after a box starts where the box ends. The text is one
 * `<text>`; each box follows it as a `<g>` translated to its top-left corner, its baseline on
 * the line's, carrying the label's paint (`class`, `fill`, `style`) for its node to inherit.
 */
function writeBoxed(
  w: SvgWriter,
  box: LabelBox,
  cx: number,
  cy: number,
  attrs: Attrs | undefined
): void {
  const top = cy - box.height / 2;
  const left = box.left === true && box.width !== undefined ? cx - box.width / 2 : undefined;
  const boxes: { x: number; y: number; span: LabelBoxSpan }[] = [];
  let open = false;
  for (let i = 0; i < box.lines.length; i++) {
    const line = box.lines[i] as readonly LabelSpan[];
    const y = top + (box.baselines?.[i] ?? i * box.lineHeight + box.baseline);
    let width = 0;
    for (const span of line) width += span.width ?? 0;
    let x = left === undefined ? cx - width / 2 : left + (box.indents?.[i] ?? 0);
    let placed = false;
    for (const span of line) {
      if (isBox(span)) {
        boxes.push({ x, y: y - span.baseline, span });
        placed = false;
      } else {
        if (!open) {
          w.open('text', { ...attrs, 'text-anchor': 'start', 'xml:space': 'preserve' });
          open = true;
        }
        w.open('tspan', spanAttrs(span, placed ? undefined : { x, y }));
        w.text(span.text);
        w.close();
        placed = true;
      }
      x += span.width ?? 0;
    }
  }
  if (open) w.close();
  for (const { x, y, span } of boxes) {
    const at = translate(x, y);
    w.open('g', {
      class: attrs?.class,
      fill: attrs?.fill,
      style: attrs?.style,
      transform: attrs?.transform === undefined ? at : transforms(attrs.transform, at),
    });
    writeFragment(w, span.node);
    w.close();
  }
}

// Written through the primitives, so both backings agree by construction.
function writeLabel(
  w: SvgWriter,
  box: LabelBox,
  cx: number,
  cy: number,
  attrs: Attrs | undefined
): void {
  const lines = box.lines;
  if (lines.length === 0) return;
  if (lines.some((line) => line.some(isBox))) {
    writeBoxed(w, box, cx, cy, attrs);
    return;
  }
  const top = cy - box.height / 2;
  const first = lines[0];
  const only = lines.length === 1 && first && first.length === 1 ? first[0] : undefined;
  const left = box.left === true && box.width !== undefined ? cx - box.width / 2 : undefined;
  if (only && spanAttrs(only, undefined) === undefined) {
    w.open('text', {
      ...attrs,
      x: left === undefined ? cx : left + (box.indents?.[0] ?? 0),
      y: top + box.baseline,
      'text-anchor': left === undefined ? 'middle' : 'start',
    });
    w.text(only.text);
    w.close();
    return;
  }
  w.open('text', {
    ...attrs,
    'text-anchor': left === undefined ? 'middle' : 'start',
    'xml:space': 'preserve',
  });
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as readonly LabelSpan[];
    const y = top + i * box.lineHeight + box.baseline;
    const x = left === undefined ? cx : left + (box.indents?.[i] ?? 0);
    if (line.length === 0) {
      w.open('tspan', { x, y });
      w.text(' ');
      w.close();
      continue;
    }
    for (let j = 0; j < line.length; j++) {
      const span = line[j] as LabelSpan;
      w.open('tspan', spanAttrs(span, j === 0 ? { x, y } : undefined));
      w.text(span.text);
      w.close();
    }
  }
  w.close();
}

/**
 * Whether the stream writer may write attribute `name`'s `value` (formatted from `raw`) without
 * escaping it: numbers and number lists (formatted through `num()`, except that a `viewBox`
 * array's own `map` would be called; an array is not re-checked here), the attribute's
 * code-constant keywords (checked at load), and path data and transforms equal to ones built
 * from numbers in `path.ts`. Every other value, whoever supplied it, is escaped.
 */
function unescaped(
  name: string,
  raw: unknown,
  value: string,
  keywords: ReadonlySet<string> | undefined
): boolean {
  return (
    typeof raw !== 'string' ||
    (!!keywords?.size && keywords.has(value)) ||
    ((name === 'd' || name === 'transform') && isBuilt(value))
  );
}

class Stream implements StreamSvgWriter {
  private out = '';
  private readonly stack: string[] = [];
  private pending = false;
  private readonly ref: string | undefined;
  private referred = false;
  private user: UserGradients | undefined;

  constructor(
    private readonly gradient: SvgGradient | undefined,
    private readonly draw: OutlineDraw | undefined,
    private readonly idPrefix: (() => string) | undefined
  ) {
    this.ref = refOf(gradient);
  }

  linearGradient(g: LinearGradient): GradientRef {
    return (this.user ??= usersOf(this.idPrefix)).ref(g);
  }

  private attrs(tag: string, attrs: Attrs | undefined): string {
    if (!attrs) return '';
    let s = '';
    const blank = tag === 'a' && attrs.target === '_blank';
    let rel = false;
    for (const name in attrs) {
      const raw = (attrs as Record<string, unknown>)[name];
      // `formatValue`, with the name looked up once for both its checks and its keywords.
      if (raw === undefined) continue;
      const keywords = PLAIN_ATTRS.get(name);
      if (keywords === undefined) checkName(tag, name);
      let value = formatChecked(name, raw);
      if (this.ref !== undefined && value === this.ref && (name === 'stroke' || name === 'fill'))
        this.referred = true;
      if (name === 'rel' && blank) {
        value = BLANK_REL;
        rel = true;
      }
      const plain = unescaped(name, raw, value, keywords);
      s += ' ' + name + '="' + (plain ? value : escAttr(value)) + '"';
    }
    if (blank && !rel) s += ' rel="' + BLANK_REL + '"';
    return s;
  }

  private flush(): void {
    if (this.pending) {
      this.out += '>';
      this.pending = false;
    }
  }

  open(tag: AllowedTag, attrs?: Attrs): void {
    checkTag(tag);
    const a = this.attrs(tag, attrs);
    this.flush();
    this.out += '<' + tag + a;
    this.pending = true;
    this.stack.push(tag);
  }

  close(): void {
    const tag = this.stack.pop();
    if (tag === undefined) throw new Error('SvgWriter.close() without a matching open()');
    if (this.pending) {
      this.out += '/>';
      this.pending = false;
    } else {
      this.out += '</' + tag + '>';
    }
  }

  leaf(tag: AllowedTag, attrs?: Attrs): void {
    checkTag(tag);
    const a = this.attrs(tag, attrs);
    this.flush();
    this.out += '<' + tag + a + '/>';
  }

  outline(role: OutlineRole, tag: OutlineTag, attrs?: Attrs): void {
    writeOutline(this, this.draw, role, tag, attrs);
  }

  plainEdge(attrs: Attrs): void {
    this.leaf('path', attrs);
  }

  text(content: string): void {
    const top = this.stack[this.stack.length - 1];
    if (top === undefined || !TEXT_HOLDERS.has(top))
      throw new TypeError(`<${top ?? 'document'}> cannot hold text`);
    const e = esc(content);
    if (e === '') return;
    this.flush();
    this.out += e;
  }

  label(box: LabelBox, x: number, y: number, attrs?: Attrs): void {
    writeLabel(this, box, x, y, attrs);
  }

  path(): PathBuilder {
    return pathBuilder();
  }

  styleSheet(css: ThemeStyleSheet): void {
    checkSheetParent(this.stack[this.stack.length - 1], this.stack.length);
    this.flush();
    this.out += '<style>' + esc(css) + '</style>';
  }

  embed(svg: EmbeddedSvg): void {
    if (this.stack.length === 0) throw new TypeError('An embedded <svg> must be inside the root');
    this.flush();
    this.out += svg;
  }

  finish(): string {
    if (this.stack.length > 0)
      throw new Error(`SvgWriter.finish() with <${this.stack[this.stack.length - 1]}> still open`);
    return withDefs(this.out, this.referred ? this.gradient : undefined, this.user);
  }
}

class Tree implements TreeSvgWriter {
  private readonly compact = new CompactTree();
  private readonly stack: number[] = [0];
  private user: UserGradients | undefined;

  constructor(
    private readonly gradient: SvgGradient | undefined,
    private readonly draw: OutlineDraw | undefined,
    private readonly idPrefix: (() => string) | undefined
  ) {}

  linearGradient(g: LinearGradient): GradientRef {
    return (this.user ??= usersOf(this.idPrefix)).ref(g);
  }

  get tree(): SvgTree {
    return this.compact;
  }

  private get current(): number {
    return this.stack[this.stack.length - 1] as number;
  }

  open(tag: AllowedTag, attrs?: Attrs): void {
    this.stack.push(this.compact.appendElement(this.current, tag, attrs));
  }

  close(): void {
    if (this.stack.length === 1) throw new Error('SvgWriter.close() without a matching open()');
    this.stack.pop();
  }

  leaf(tag: AllowedTag, attrs?: Attrs): void {
    this.compact.appendElement(this.current, tag, attrs);
  }

  plainEdge(attrs: Attrs): void {
    this.leaf('path', attrs);
  }

  outline(role: OutlineRole, tag: OutlineTag, attrs?: Attrs): void {
    writeOutline(this, this.draw, role, tag, attrs);
  }

  text(content: string): void {
    this.compact.appendTextNode(this.current, content);
  }

  label(box: LabelBox, x: number, y: number, attrs?: Attrs): void {
    writeLabel(this, box, x, y, attrs);
  }

  path(): PathBuilder {
    return pathBuilder();
  }

  styleSheet(css: ThemeStyleSheet): void {
    checkSheetParent(this.compact.tagOf(this.current), this.stack.length - 1);
    this.compact.appendStyleSheet(this.current, css);
  }

  embed(svg: EmbeddedSvg): void {
    if (this.stack.length === 1) throw new TypeError('An embedded <svg> must be inside the root');
    this.compact.appendRaw(this.current, svg);
  }

  finish(): string {
    if (this.stack.length > 1) throw new Error('SvgWriter.finish() with an element still open');
    const svg = this.compact.serialize();
    // Read from the tree as the hooks left it, so a reference they add or remove counts.
    const ref = refOf(this.gradient);
    const t = this.compact;
    const referred =
      ref !== undefined &&
      t.find((n) => t.getAttr(n, 'stroke') === ref || t.getAttr(n, 'fill') === ref).length > 0;
    return withDefs(svg, referred ? this.gradient : undefined, this.user);
  }
}

/** The default backing: writes straight into a string buffer. */
export function streamWriter(options?: WriterOptions): StreamSvgWriter {
  return new Stream(options?.gradient, options?.outline, options?.idPrefix);
}

/** The tree backing, for when a `postRender` hook is registered. */
export function treeWriter(options?: WriterOptions): TreeSvgWriter {
  return new Tree(options?.gradient, options?.outline, options?.idPrefix);
}
