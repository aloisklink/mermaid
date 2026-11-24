/**
 * The compact tree backing (ADR-3): flat parallel arrays (tag, attribute slice, parent,
 * first child, next sibling), wrapped by the `SvgTree` view that `postRender` hooks edit.
 * Used only when a `postRender` hook is registered; otherwise the writer streams.
 */
import { BLANK_REL, TEXT_HOLDERS } from './allowlist.js';
import { checkTag, formatValue } from './encode.js';
import { esc, escAttr } from './escape.js';
import type { AllowedAttr, AllowedTag, Attrs, AttrTypes, Brand } from './types.js';

/** A handle to one node of an `SvgTree`. */
export type SvgNode = Brand<number, 'SvgNode'>;

/** What `SvgTree.find` looks for: every given field must match. */
export type SvgMatch =
  | { readonly tag?: AllowedTag; readonly class?: string; readonly 'data-id'?: string }
  | ((node: SvgNode, tree: SvgTree) => boolean);

/** The view `postRender` hooks get. It accepts only allowed tags, attributes and branded values. */
export interface SvgTree {
  /** The document node. Its children are the top-level elements; it has no tag. */
  readonly root: SvgNode;
  /** Elements matching `match`, in document order. */
  find(match: SvgMatch): SvgNode[];
  /** The element's tag, or undefined for the document node and text nodes. */
  tag(node: SvgNode): AllowedTag | undefined;
  /** A text node's content (unescaped), or undefined for elements. */
  textOf(node: SvgNode): string | undefined;
  /** An attribute as written (unescaped), or undefined when absent. */
  getAttr(node: SvgNode, name: AllowedAttr): string | undefined;
  /** Sets an attribute; `undefined` removes it. */
  setAttr<K extends AllowedAttr>(node: SvgNode, name: K, value: AttrTypes[K] | undefined): void;
  /** Appends an element as the last child of `parent` and returns it. */
  append(parent: SvgNode, tag: AllowedTag, attrs?: Attrs): SvgNode;
  /** Appends a text node as the last child of `parent` (which must be able to hold text). */
  appendText(parent: SvgNode, text: string): void;
  /** Detaches a node and its subtree. */
  remove(node: SvgNode): void;
  children(node: SvgNode): SvgNode[];
  parent(node: SvgNode): SvgNode | undefined;
  /** Serialises the tree. */
  serialize(): string;
}

const NONE = -1;
const TEXT = '#text';
const DOC = '#document';
/** Checked markup kept as written: an embedded diagram's root (ADR-15). */
const RAW = '#raw';

export class CompactTree implements SvgTree {
  readonly root = 0 as SvgNode;
  // per node
  private readonly tags: string[] = [DOC];
  private readonly texts: string[] = [''];
  private readonly attrStart: number[] = [0];
  private readonly attrLen: number[] = [0];
  private readonly parents: number[] = [NONE];
  private readonly firstChild: number[] = [NONE];
  private readonly lastChild: number[] = [NONE];
  private readonly nextSibling: number[] = [NONE];
  // attribute slices
  private readonly attrNames: string[] = [];
  private readonly attrValues: string[] = [];

  private node(n: number): number {
    if (!Number.isInteger(n) || n < 0 || n >= this.tags.length)
      throw new RangeError(`No such SVG node: ${n}`);
    return n;
  }

  private link(parent: number, tag: string, text: string): number {
    const n = this.tags.length;
    this.tags.push(tag);
    this.texts.push(text);
    this.attrStart.push(this.attrNames.length);
    this.attrLen.push(0);
    this.parents.push(parent);
    this.firstChild.push(NONE);
    this.lastChild.push(NONE);
    this.nextSibling.push(NONE);
    const last = this.lastChild[parent] as number;
    if (last === NONE) this.firstChild[parent] = n;
    else this.nextSibling[last] = n;
    this.lastChild[parent] = n;
    return n;
  }

  /** Appends without the view's checks on `parent`; used by the writer. */
  appendElement(parent: number, tag: string, attrs: Attrs | undefined): number {
    checkTag(tag);
    const n = this.link(parent, tag, '');
    if (attrs) {
      let blank = false;
      for (const name in attrs) {
        const value = formatValue(tag, name, (attrs as Record<string, unknown>)[name]);
        if (value === undefined) continue;
        if (name === 'target' && value === '_blank') blank = true;
        this.attrNames.push(name);
        this.attrValues.push(value);
        this.attrLen[n] = (this.attrLen[n] as number) + 1;
      }
      // `_blank` always gets rel="noopener noreferrer": replaced in place, or added last.
      if (blank && tag === 'a') this.writeAttr(n, 'rel', BLANK_REL);
    }
    return n;
  }

  /** The tag of node `n` as stored, for the writer's checks. */
  tagOf(n: number): string | undefined {
    return this.tags[n];
  }

  /** Appends a `<style>` holding a theme style sheet; used by the writer only. */
  appendStyleSheet(parent: number, css: string): void {
    const n = this.link(parent, 'style', '');
    this.link(n, TEXT, css);
  }

  /** Appends an embedded diagram's checked root `<svg>`, written as is; used by the writer only. */
  appendRaw(parent: number, markup: string): void {
    this.link(parent, RAW, markup);
  }

  /** Appends a text node unless the text escapes to nothing. */
  appendTextNode(parent: number, text: string): void {
    if (!TEXT_HOLDERS.has(this.tags[parent] as string)) {
      throw new TypeError(`<${this.tags[parent]}> cannot hold text`);
    }
    if (esc(text) === '') return;
    this.link(parent, TEXT, text);
  }

  private findAttr(n: number, name: string): number {
    const start = this.attrStart[n] as number;
    const end = start + (this.attrLen[n] as number);
    for (let i = start; i < end; i++) if (this.attrNames[i] === name) return i;
    return NONE;
  }

  private writeAttr(n: number, name: string, value: string | undefined): void {
    const at = this.findAttr(n, name);
    if (value === undefined) {
      if (at === NONE) return;
      const end = (this.attrStart[n] as number) + (this.attrLen[n] as number);
      for (let i = at; i + 1 < end; i++) {
        this.attrNames[i] = this.attrNames[i + 1] as string;
        this.attrValues[i] = this.attrValues[i + 1] as string;
      }
      this.attrLen[n] = (this.attrLen[n] as number) - 1;
      return;
    }
    if (at !== NONE) {
      this.attrValues[at] = value;
      return;
    }
    const start = this.attrStart[n] as number;
    const len = this.attrLen[n] as number;
    if (start + len !== this.attrNames.length) {
      // Move the slice to the end so it can grow.
      const names = this.attrNames.slice(start, start + len);
      const values = this.attrValues.slice(start, start + len);
      this.attrStart[n] = this.attrNames.length;
      this.attrNames.push(...names);
      this.attrValues.push(...values);
    }
    this.attrNames.push(name);
    this.attrValues.push(value);
    this.attrLen[n] = len + 1;
  }

  private isElement(n: number): boolean {
    const tag = this.tags[n];
    return tag !== TEXT && tag !== DOC && tag !== RAW;
  }

  find(match: SvgMatch): SvgNode[] {
    const out: SvgNode[] = [];
    const test =
      typeof match === 'function'
        ? (n: number) => match(n as SvgNode, this)
        : (n: number) =>
            (match.tag === undefined || this.tags[n] === match.tag) &&
            (match['data-id'] === undefined ||
              this.getAttr(n as SvgNode, 'data-id') === match['data-id']) &&
            (match.class === undefined ||
              (this.getAttr(n as SvgNode, 'class') ?? '').split(/\s+/).includes(match.class));
    const stack: number[] = [];
    let c = this.firstChild[0] as number;
    while (c !== NONE || stack.length > 0) {
      if (c === NONE) {
        c = this.nextSibling[stack.pop() as number] as number;
        continue;
      }
      if (this.isElement(c) && test(c)) out.push(c as SvgNode);
      stack.push(c);
      c = this.firstChild[c] as number;
    }
    return out;
  }

  tag(node: SvgNode): AllowedTag | undefined {
    const n = this.node(node);
    return this.isElement(n) ? (this.tags[n] as AllowedTag) : undefined;
  }

  textOf(node: SvgNode): string | undefined {
    const n = this.node(node);
    return this.tags[n] === TEXT ? this.texts[n] : undefined;
  }

  getAttr(node: SvgNode, name: AllowedAttr): string | undefined {
    const n = this.node(node);
    const at = this.findAttr(n, name);
    return at === NONE ? undefined : this.attrValues[at];
  }

  setAttr<K extends AllowedAttr>(node: SvgNode, name: K, value: AttrTypes[K] | undefined): void {
    const n = this.node(node);
    if (!this.isElement(n)) throw new TypeError('Only elements have attributes');
    const tag = this.tags[n] as string;
    let text = formatValue(tag, name, value);
    if (name === 'rel' && text !== undefined && this.getAttr(node, 'target') === '_blank')
      text = BLANK_REL;
    this.writeAttr(n, name, text);
    if (tag === 'a' && name === 'target' && text === '_blank') this.writeAttr(n, 'rel', BLANK_REL);
  }

  append(parent: SvgNode, tag: AllowedTag, attrs?: Attrs): SvgNode {
    const p = this.node(parent);
    if (this.tags[p] === TEXT || this.tags[p] === RAW)
      throw new TypeError('Text nodes have no children');
    return this.appendElement(p, tag, attrs) as SvgNode;
  }

  appendText(parent: SvgNode, text: string): void {
    this.appendTextNode(this.node(parent), text);
  }

  remove(node: SvgNode): void {
    const n = this.node(node);
    if (n === 0) throw new TypeError('The document node cannot be removed');
    const p = this.parents[n] as number;
    if (p === NONE) return;
    let prev = NONE;
    let c = this.firstChild[p] as number;
    while (c !== NONE && c !== n) {
      prev = c;
      c = this.nextSibling[c] as number;
    }
    if (c === NONE) return;
    const next = this.nextSibling[n] as number;
    if (prev === NONE) this.firstChild[p] = next;
    else this.nextSibling[prev] = next;
    if (this.lastChild[p] === n) this.lastChild[p] = prev;
    this.parents[n] = NONE;
    this.nextSibling[n] = NONE;
  }

  children(node: SvgNode): SvgNode[] {
    const out: SvgNode[] = [];
    for (
      let c = this.firstChild[this.node(node)] as number;
      c !== NONE;
      c = this.nextSibling[c] as number
    ) {
      out.push(c as SvgNode);
    }
    return out;
  }

  parent(node: SvgNode): SvgNode | undefined {
    const p = this.parents[this.node(node)] as number;
    return p === NONE ? undefined : (p as SvgNode);
  }

  serialize(): string {
    let out = '';
    const stack: number[] = [];
    let c = this.firstChild[0] as number;
    for (;;) {
      if (c === NONE) {
        const done = stack.pop();
        if (done === undefined) break;
        out += '</' + this.tags[done] + '>';
        c = this.nextSibling[done] as number;
        continue;
      }
      const tag = this.tags[c] as string;
      if (tag === TEXT || tag === RAW) {
        out += tag === RAW ? (this.texts[c] as string) : esc(this.texts[c] as string);
        c = this.nextSibling[c] as number;
        continue;
      }
      out += '<' + tag;
      const start = this.attrStart[c] as number;
      const end = start + (this.attrLen[c] as number);
      for (let i = start; i < end; i++)
        out += ' ' + this.attrNames[i] + '="' + escAttr(this.attrValues[i] as string) + '"';
      const first = this.firstChild[c] as number;
      if (first === NONE) {
        out += '/>';
        c = this.nextSibling[c] as number;
      } else {
        out += '>';
        stack.push(c);
        c = first;
      }
    }
    return out;
  }
}
