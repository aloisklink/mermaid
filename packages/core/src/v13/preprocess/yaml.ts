// D597: this file stays whole as a Pele port; its `complexity` entries in eslint-suppressions.json are deliberate.
/**
 * A small YAML reader covering what Mermaid feeds to js-yaml with the JSON schema: block and
 * flow collections, quoted and plain scalars, and block scalars. Used for front matter and for
 * flowchart shape data (`@{ … }`).
 *
 * Ported from Pele's `src/util/yaml.ts` at 3a2f075 (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano). Changes from Pele:
 * - it reads a range of the original source in place, so every diagnostic has a real range;
 * - errors are diagnostics, not exceptions; the first error stops the read (as in js-yaml);
 * - `__proto__`, `constructor` and `prototype` keys are dropped with a warning;
 * - duplicate keys, tags, anchors, aliases and reserved indicators are errors, as in js-yaml;
 * - nesting is capped at {@link MAX_YAML_DEPTH} levels across block and flow collections.
 *
 * Editors opt in to a tree mode (`{ tree: true }`, R-LANG-5): it also returns a {@link YamlNode}
 * tree with a range for every key and value, and keeps reading after an error: per entry in
 * block collections and in a root flow document (#169); a flow collection inside a block value
 * still fails as a whole, as the block entry's error, so the read stays linear.
 *
 * Every step is linear in the text it reads (R-PARSE-7).
 */
// cspell:words kepano
import { CR, LF, NUL, SPACE, TAB } from '../parser-kit/char-codes.js';
import { Diagnostics } from '../parser-kit/diagnostics.js';
import type { Diagnostic } from '../parser-kit/diagnostics.js';
import { flowCollection } from './yaml-nodes.js';
import { plainNumber, unescapeDouble } from './yaml-scalar.js';
import type {
  FlowCollection,
  YamlMap,
  YamlMapNode,
  YamlNode,
  YamlPair,
  YamlScalarNode,
  YamlScalarStyle,
  YamlValue,
} from './yaml-nodes.js';
import { lineEnd, newlineAt } from '../parser-kit/scanner.js';
import {
  isSpaceOrBreak,
  isSeqItem,
  splitKey,
  fold,
  stripComment,
  mappingIndicator,
  nonPrintable,
  leading,
  flowResync,
  trimBack,
} from './yaml-text.js';

export type { YamlMap, YamlValue };

/** Where an inline value sits: after `key:`, after `- `, or as a node on its own line. */
type ValueSlot = 'after-key' | 'after-dash' | 'alone';

export interface YamlOptions {
  /** Offset where the YAML text starts (default 0). */
  start?: number;
  /** Offset where the YAML text ends (default `src.length`). */
  end?: number;
  /** Indent stripped from the start of every line that has it (front matter inside an indented fence). */
  indent?: string;
}

export interface YamlResult {
  /** The document, or `null` when it is empty or has an error. */
  value: YamlValue;
  /** At most one error (the read stops there), plus warnings. Ranges are offsets into `src`. */
  diagnostics: Diagnostic[];
}

/** Options of the editor mode: the result also has the node tree. */
export interface YamlTreeOptions extends YamlOptions {
  tree: true;
}

export interface YamlTreeResult extends YamlResult {
  /** The document as read: in tree mode, what could be read around the errors. */
  value: YamlValue;
  /** The node tree, or `null` when the document is empty or nothing could be read. */
  root: YamlNode | null;
}

/** Maximum nesting of collections. Deeper input is an error instead of a stack overflow. */
export const MAX_YAML_DEPTH = 64;

/** Keys that could reach an object prototype through a later merge. They are dropped. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Thrown inside the reader and turned into a diagnostic. Not an Error: no stack trace.
class YamlError {
  constructor(
    readonly code: string,
    readonly message: string,
    readonly start: number,
    readonly end: number
  ) {}
}

const RE_FLOW_KEY_END = /[\s,[\]{}]/;
const RE_FLOW_INDICATOR = /[,[\]{}]/;
const RE_SPACE = /\s/;
const RE_LEADING_BLANK = /^[ \t]/;
const RE_BLOCK_HEADER = /^[|>][-+0-9]*\s*(?:#.*)?$/;
const RE_INDENT_DIGIT = /[1-9]/;
const END_EXPECTED = 'end of the stream or a document separator is expected';

/** One read of one YAML range. Lines keep their offsets into the original source. */
class Reader {
  /** Line text, with the fence indent removed. */
  readonly lines: string[] = [];
  /** Offset of `lines[i][0]` in the source. */
  readonly at: number[] = [];
  /** Offset where the raw line `i` starts (before the indent is removed). */
  readonly raw: number[] = [];
  i = 0;
  /** Tree mode: the node of the value read last, taken by the collection that holds it. */
  node: YamlNode | undefined;
  /** Tree mode: lines that already have an error (one error per line). */
  readonly errorLines = new Set<number>();
  /** Tree mode: reading a root flow document, which an unclosed collection runs to the end of. */
  rootFlow = false;

  constructor(
    readonly src: string,
    readonly start: number,
    readonly end: number,
    indent: string,
    readonly diagnostics: Diagnostics,
    readonly tree = false
  ) {
    let pos = start;
    for (;;) {
      let e = lineEnd(src, pos);
      if (e > end) e = end;
      let text = src.slice(pos, e);
      let off = pos;
      if (indent && text.startsWith(indent)) {
        text = text.slice(indent.length);
        off += indent.length;
      }
      this.lines.push(text);
      this.at.push(off);
      this.raw.push(pos);
      if (e >= end) break;
      pos = e + (newlineAt(src, e) || 1);
    }
  }

  /** Tree mode: record a scalar node for the value just read. */
  leaf(value: YamlValue, start: number, end: number, style: YamlScalarStyle): void {
    this.node = {
      kind: 'scalar',
      value: value as YamlScalarNode['value'],
      style,
      range: { start, end },
    };
  }

  /** Tree mode: the node of the value just read (an empty `null` at `at` if there is none). */
  take(at: number): YamlNode {
    const node = this.node ?? {
      kind: 'scalar',
      value: null,
      style: 'plain',
      range: { start: at, end: at },
    };
    this.node = undefined;
    return node;
  }

  fail(message: string, start: number, end = start + 1, code = 'YAML_SYNTAX'): never {
    throw new YamlError(code, message, start, Math.max(end, start));
  }

  /** The range of line `i` without its indent. */
  lineRange(i: number): [number, number] {
    const text = this.lines[i] ?? '';
    const at = this.at[i] ?? this.end;
    return [at + leading(text), at + text.length];
  }

  skipBlank(): void {
    while (this.i < this.lines.length) {
      const t = (this.lines[this.i] ?? '').trim();
      // `---` is a document marker only at the start of a line; indented, it is text.
      if (t !== '' && !t.startsWith('#') && (this.lines[this.i] ?? '') !== '---') break;
      this.i++;
    }
  }

  indent(): number {
    const line = this.lines[this.i] ?? '';
    let k = 0;
    while (k < line.length && line[k] === ' ') k++;
    if (line[k] === '\t') {
      const at = (this.at[this.i] ?? 0) + k;
      this.fail('tabs are not allowed for indentation', at);
    }
    return k;
  }

  /** Tree mode: report `err` unless its line already has an error. Returns its line. */
  report(err: YamlError): number {
    // Binary search: errors can come in any order, and there may be one per line.
    let lo = 0;
    let hi = this.raw.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.raw[mid] ?? 0) <= err.start) lo = mid;
      else hi = mid - 1;
    }
    if (!this.errorLines.has(lo)) {
      this.errorLines.add(lo);
      this.diagnostics.error(err.code, `Invalid YAML: ${err.message}.`, {
        start: err.start,
        end: err.end,
      });
    }
    return lo;
  }

  /**
   * Tree mode: after an error in an entry of a collection at `indent`, go on at the first line
   * from `from` that can start the next entry: skip the rest of the entry (lines indented
   * deeper), blank and comment lines, and lines that only close a flow collection.
   */
  resync(from: number, indent: number): void {
    this.i = from;
    while (this.i < this.lines.length) {
      const line = this.lines[this.i] ?? '';
      const t = line.trim();
      const c = t[0];
      if (t !== '' && c !== '#' && c !== '}' && c !== ']' && leading(line) <= indent) break;
      this.i++;
    }
  }

  /** Index of the line that contains `offset`. */
  lineOf(offset: number, from: number): number {
    let i = from;
    while (i + 1 < this.raw.length && (this.raw[i + 1] ?? Infinity) <= offset) i++;
    return i;
  }

  /**
   * Store `value` under `key`, refusing duplicate keys and dropping prototype keys. Returns
   * whether it was stored.
   */
  assign(target: YamlMap, key: string, value: YamlValue, start: number, end: number): boolean {
    if (UNSAFE_KEYS.has(key)) {
      this.diagnostics.warning(
        'YAML_UNSAFE_KEY',
        `The key \`${key}\` is not allowed and was ignored.`,
        { start, end }
      );
      return false;
    }
    if (Object.hasOwn(target, key)) this.fail(`duplicated mapping key \`${key}\``, start, end);
    target[key] = value;
    return true;
  }

  depth(depth: number, at: number): void {
    if (depth > MAX_YAML_DEPTH) {
      this.fail(`nesting is deeper than ${MAX_YAML_DEPTH} levels`, at, at + 1, 'YAML_TOO_DEEP');
    }
  }

  /** A plain scalar starting at `at`. */
  scalar(raw: string, at: number): YamlValue {
    const s = raw.trim();
    if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
    if (s === 'true' || s === 'True' || s === 'TRUE') return true;
    if (s === 'false' || s === 'False' || s === 'FALSE') return false;
    const c = s[0] ?? '';
    if (c === '!' || c === '&' || c === '*') {
      this.fail('tags, anchors and aliases (`!`, `&`, `*`) are not supported', at);
    }
    if (c === '@' || c === '`')
      this.fail(`\`${c}\` is reserved and cannot start a plain value`, at);
    if (c !== '-' && c !== '+' && c !== '.' && (c < '0' || c > '9')) return s;
    const n = plainNumber(s);
    if (n !== undefined) return n;
    return s;
  }

  unquoteDouble(body: string, at: number): string {
    return unescapeDouble(body, (message) => this.fail(message, at));
  }

  /**
   * Characters that cannot start a plain value in a block (js-yaml readPlainScalar). A lone
   * `-` or `?` after `key:` is an indicator too; after `- ` or at the root a lone `?` is an
   * explicit key in js-yaml, which this subset leaves alone.
   */
  plainStart(text: string, at: number, slot: ValueSlot): void {
    const c = text[0];
    if ((c === '-' || (c === '?' && slot === 'after-key')) && text.length === 1) {
      this.fail('bad indentation of a mapping entry', at);
    }
    if (c === ']' || c === '}' || c === ',' || c === '%') {
      this.fail('bad indentation of a mapping entry', at);
    }
    if ((c === '?' || c === '-') && isSpaceOrBreak(text[1])) {
      this.fail('bad indentation of a mapping entry', at);
    }
    if (c === '|' || c === '>') this.fail('a line break is expected', at);
  }

  /** js-yaml: plain and block scalar text must be printable (comments are not checked). */
  printable(start: number, end: number): void {
    const bad = nonPrintable(this.src, start, end);
    if (bad >= 0) this.fail('the stream contains non-printable characters', bad);
  }

  /** js-yaml: quoted text may hold any character but C0 controls other than tab. */
  printableQuoted(start: number, end: number): void {
    for (let i = start; i < end; i++) {
      const c = this.src.charCodeAt(i);
      if (c < SPACE && c !== TAB && c !== LF && c !== CR) {
        this.fail('expected valid JSON character', i);
      }
    }
  }

  skip(pos: number, limit: number): number {
    const s = this.src;
    while (pos < limit) {
      const c = s[pos];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
        pos++;
      } else if (c === '#' && (pos === this.start || RE_SPACE.test(s[pos - 1] ?? ''))) {
        pos = Math.min(lineEnd(s, pos), limit);
      } else {
        break;
      }
    }
    return pos;
  }

  // Entries of a flow collection are separated by exactly one comma, as js-yaml requires.
  entryStart(pos: number, separated: boolean): void {
    if (!separated) this.fail('missed comma between flow collection entries', pos);
    if (this.src[pos] === ',') this.fail("expected the node content, but found ','", pos);
  }

  /**
   * One entry of a flow collection at `pos` (a `key: value` pair of a mapping, or an item),
   * stored in `out`; `separated` when a `,` (or the opening bracket) comes before it. Returns
   * the offset after it. `out.key` holds the key once it is read.
   */
  flowEntry(
    isMap: boolean,
    out: FlowCollection,
    pos: number,
    limit: number,
    depth: number,
    separated: boolean
  ): number {
    const s = this.src;
    out.key = undefined;
    this.entryStart(pos, separated);
    if (!isMap) {
      let value: YamlValue;
      [value, pos] = this.flow(pos, limit, ',]', depth + 1);
      out.list.push(value);
      if (out.items) out.items.push(this.take(pos));
      return pos;
    }
    const keyAt = pos;
    let key: YamlValue;
    [key, pos] = this.flow(pos, limit, ':,}', depth + 1);
    const keyEnd = pos;
    const keyRange = this.node?.range;
    this.node = undefined;
    const name = String(key);
    if (keyRange) out.key = { key: name, keyRange };
    pos = this.skip(pos, limit);
    let value: YamlValue = null;
    if (s[pos] === ':') [value, pos] = this.flow(pos + 1, limit, ',}', depth + 1);
    if (this.assign(out.map, name, value, keyAt, keyEnd) && out.pairs && keyRange) {
      out.pairs.push({ key: name, keyRange, value: this.take(keyRange.end) });
    }
    return pos;
  }

  /** Tree mode: the node of a flow collection opening at `open`, ending at `end`. */
  flowNode(out: FlowCollection, open: number, end: number): void {
    const range = { start: open, end };
    this.node = out.pairs
      ? { kind: 'map', flow: true, pairs: out.pairs, range }
      : { kind: 'seq', flow: true, items: out.items ?? [], range };
  }

  /**
   * Tree mode, in a root flow document (#169): a flow collection at `open` that reads on after
   * an error in one of its entries. The entry's error is reported, a key it read stays without a
   * value (as in a block mapping), and the read goes on at the next `,` or closing bracket
   * outside nested collections and quotes. A collection that is never closed ends at the end of
   * the text, or at a closing bracket of an outer collection, with one error at its opener.
   * Every error position moves forward, so the read stays linear (R-PARSE-7).
   */
  flowRecovering(open: number, limit: number, depth: number): [YamlValue, number] {
    const s = this.src;
    const ch = s[open];
    const close = ch === '{' ? '}' : ']';
    const out = flowCollection(ch === '{', true);
    const value = ch === '{' ? out.map : out.list;
    const unclosed = () => {
      const message = `this \`${ch}\` is never closed with \`${close}\``;
      this.report(new YamlError('YAML_SYNTAX', message, open, open + 1));
    };
    let pos = open + 1;
    // Where an unclosed collection's range ends: after its last entry.
    let last = pos;
    let separated = true;
    for (;;) {
      pos = this.skip(pos, limit);
      if (pos >= limit) {
        unclosed();
        this.flowNode(out, open, last);
        return [value, limit];
      }
      if (s[pos] === close) {
        this.flowNode(out, open, pos + 1);
        return [value, pos + 1];
      }
      const entryAt = pos;
      try {
        pos = this.flowEntry(ch === '{', out, pos, limit, depth, separated);
        last = pos;
        pos = this.skip(pos, limit);
      } catch (err) {
        if (!(err instanceof YamlError)) throw err;
        this.report(err);
        this.node = undefined;
        // A key read before the error stays, without a value (a pair is stored only last).
        const key = out.key;
        if (out.pairs && key && !UNSAFE_KEYS.has(key.key)) out.pairs.push(key);
        pos = flowResync(s, Math.max(entryAt, err.start), limit, this.start);
        last = Math.max(last, trimBack(s, pos, entryAt));
        if (pos < limit && s[pos] !== ',' && s[pos] !== close) {
          // A closing bracket of an outer collection: this one ends here, unclosed.
          unclosed();
          this.flowNode(out, open, last);
          return [value, pos];
        }
      }
      separated = s[pos] === ',';
      if (separated) pos++;
    }
  }

  // Parses a flow value starting at `pos`, up to `limit`; returns the value and the offset after it.
  flow(pos: number, limit: number, stops: string, depth: number): [YamlValue, number] {
    const s = this.src;
    pos = this.skip(pos, limit);
    const ch = s[pos];
    const open = pos;
    if (pos < limit && (ch === '{' || ch === '[')) {
      this.depth(depth + 1, pos);
      if (this.rootFlow) return this.flowRecovering(pos, limit, depth);
      const close = ch === '{' ? '}' : ']';
      const out = flowCollection(ch === '{', this.tree);
      pos++;
      let separated = true;
      for (;;) {
        pos = this.skip(pos, limit);
        if (pos >= limit) {
          this.fail(`this \`${ch}\` is never closed with \`${close}\``, open);
        }
        if (s[pos] === close) {
          if (this.tree) this.flowNode(out, open, pos + 1);
          return [ch === '{' ? out.map : out.list, pos + 1];
        }
        pos = this.flowEntry(ch === '{', out, pos, limit, depth, separated);
        pos = this.skip(pos, limit);
        separated = s[pos] === ',';
        if (separated) pos++;
      }
    }
    if (ch === '"') {
      let end = pos + 1;
      while (end < limit && s[end] !== '"') end += s[end] === '\\' ? 2 : 1;
      if (end >= limit) this.fail('this double quoted value is never closed', open);
      this.printableQuoted(pos + 1, end);
      const value = this.unquoteDouble(s.slice(pos + 1, end), open);
      if (this.tree) this.leaf(value, open, end + 1, 'double');
      return [value, end + 1];
    }
    if (ch === "'") {
      let end = pos + 1;
      while (end < limit) {
        if (s[end] === "'") {
          if (s[end + 1] !== "'") break;
          end++;
        }
        end++;
      }
      if (end >= limit) this.fail('this single quoted value is never closed', open);
      this.printableQuoted(pos + 1, end);
      const value = fold(s.slice(pos + 1, end)).replace(/''/g, "'");
      if (this.tree) this.leaf(value, open, end + 1, 'single');
      return [value, end + 1];
    }
    let end = pos;
    // Inside a flow collection a plain value ends at any flow indicator (and in a mapping at
    // `: `), and
    // cannot start with a block indicator (js-yaml readPlainScalar).
    const inFlow = stops !== '';
    if (inFlow && (ch === '>' || ch === '|' || ch === '%')) {
      this.fail(`\`${ch}\` cannot start a plain value inside \`{…}\` or \`[…]\``, pos);
    }
    // `-` or `?` before a blank or flow indicator is no value to js-yaml (`?` + blank is an
    // explicit key, which is read as text here).
    if (inFlow && (ch === '-' || ch === '?')) {
      const next = s[pos + 1];
      if (
        pos + 1 >= limit ||
        RE_FLOW_INDICATOR.test(next ?? '') ||
        (ch === '-' && isSpaceOrBreak(next))
      ) {
        this.fail('missed comma between flow collection entries', pos);
      }
    }
    while (end < limit) {
      const c = s[end] ?? '';
      if (
        (stops.includes(c) ||
          (inFlow && ((c === ':' && stops.includes('}')) || RE_FLOW_INDICATOR.test(c)))) &&
        (c !== ':' || end + 1 >= limit || RE_FLOW_KEY_END.test(s[end + 1] ?? ''))
      ) {
        break;
      }
      if (c === '#' && end > pos && RE_SPACE.test(s[end - 1] ?? '')) {
        this.printable(pos, end);
        const value = this.scalar(fold(s.slice(pos, end).trim()), pos);
        if (this.tree) this.plainLeaf(value, pos, end);
        return [value, Math.min(lineEnd(s, end), limit)];
      }
      end++;
    }
    this.printable(pos, end);
    const value = this.scalar(fold(s.slice(pos, end).trim()), pos);
    if (this.tree) this.plainLeaf(value, pos, end);
    return [value, end];
  }

  /** Tree mode: a plain flow scalar in `[start, end)`, without the blanks around it. */
  plainLeaf(value: YamlValue, start: number, end: number): void {
    while (end > start && isSpaceOrBreak(this.src[end - 1])) end--;
    this.leaf(value, start, end, 'plain');
  }

  blockScalar(header: string, parentIndent: number): string {
    const folded = header.startsWith('>');
    let chomp = '';
    if (header.includes('-')) chomp = '-';
    else if (header.includes('+')) chomp = '+';
    const explicit = RE_INDENT_DIGIT.exec(header);
    let indent = explicit ? parentIndent + Number(explicit[0]) : -1;
    const out: string[] = [];
    while (this.i < this.lines.length) {
      const line = this.lines[this.i] ?? '';
      if (line.trim() === '') {
        out.push('');
        this.i++;
        continue;
      }
      const k = leading(line);
      if (indent === -1) {
        if (k <= parentIndent) break;
        indent = k;
      }
      if (k < indent) break;
      const lineAt = this.at[this.i] ?? 0;
      this.printable(lineAt, lineAt + line.length);
      out.push(line.slice(indent));
      this.i++;
    }
    let trailing = 0;
    while (out.length > 0 && out[out.length - 1] === '') {
      out.pop();
      trailing++;
    }
    let text: string;
    if (folded) {
      text = '';
      for (let i = 0; i < out.length; i++) {
        const cur = out[i] ?? '';
        if (i > 0) {
          const prev = out[i - 1] ?? '';
          if (cur === '') text += '\n';
          else if (prev !== '') {
            text += RE_LEADING_BLANK.test(prev) || RE_LEADING_BLANK.test(cur) ? '\n' : ' ';
          }
        }
        text += cur;
      }
    } else {
      text = out.join('\n');
    }
    if (out.length === 0) return chomp === '+' ? '\n'.repeat(trailing) : '';
    if (chomp === '-') return text;
    if (chomp === '+') return text + '\n'.repeat(trailing + 1);
    return text + '\n';
  }

  /** The value in `slot`, starting at offset `at`; line `this.i - 1` holds it. */
  inlineValue(rest: string, at: number, indent: number, depth: number, slot: ValueSlot): YamlValue {
    const first = rest[0];
    if ((first === '|' || first === '>') && RE_BLOCK_HEADER.test(rest)) {
      const header = this.i - 1;
      const value = this.blockScalar(rest, indent);
      if (this.tree) {
        // The range runs to the end of the last line with text (or of the header).
        let last = this.i - 1;
        while (last > header && (this.lines[last] ?? '').trim() === '') last--;
        const end =
          last > header
            ? (this.at[last] ?? 0) + (this.lines[last] ?? '').trimEnd().length
            : at + stripComment(rest).trimEnd().length;
        this.leaf(value, at, end, first === '|' ? 'literal' : 'folded');
      }
      return value;
    }
    if (first === '{' || first === '[' || first === '"' || first === "'") {
      // The value may continue on later lines: read it straight from the source.
      const [value, end] = this.flow(at, this.end, '', depth);
      const line = this.lineOf(end, this.i - 1);
      const tailEnd = Math.min(lineEnd(this.src, end), this.end);
      const tail = stripComment(this.src.slice(end, tailEnd));
      if (tail.trim() !== '') {
        const from = end + leading(tail);
        this.fail('unexpected content after a value', from, end + tail.trimEnd().length);
      }
      this.i = line + 1;
      return value;
    }
    const body = stripComment(rest);
    let text = body.trim();
    let textEnd = at + text.length;
    this.printable(at, textEnd);
    this.plainStart(text, at, slot);
    const indicator = mappingIndicator(text, true);
    // `k: a: b` or `k: a:` at a line end: js-yaml reads a second mapping entry and fails.
    if (indicator >= 0) this.fail('bad indentation of a mapping entry', at + indicator);
    // js-yaml: a comment ends a plain value; more of it after the comment is an error.
    let commented = body.length < rest.length;
    // Whether `text` ends in a kept line break; asking `text.endsWith` would flatten the
    // growing string on every line and make a long value quadratic (R-PARSE-7).
    let broken = false;
    while (this.i < this.lines.length) {
      const line = this.lines[this.i] ?? '';
      if (line.trim() === '') {
        let j = this.i;
        while (j < this.lines.length && (this.lines[j] ?? '').trim() === '') j++;
        if (j >= this.lines.length || leading(this.lines[j] ?? '') <= indent) break;
        text += '\n'.repeat(j - this.i);
        broken = true;
        this.i = j;
        continue;
      }
      if (leading(line) <= indent) break;
      const from = this.lineRange(this.i)[0];
      if (line.startsWith('\t'))
        this.fail('tab characters must not be used in indentation', from - 1);
      if (line.trimStart().startsWith('#')) {
        commented = true;
        this.i++;
        continue;
      }
      if (commented) this.fail('bad indentation of a mapping entry', from);
      const lineBody = stripComment(line);
      const more = lineBody.trim();
      if (lineBody.length < line.length) commented = true;
      const colon = mappingIndicator(more, false);
      if (colon >= 0) {
        // A `key:` line is reported from its start, other text at the `:`.
        const where = splitKey(more) !== null ? from : from + colon;
        this.fail('bad indentation of a mapping entry', where);
      }
      this.printable(from, from + more.length);
      text += (broken ? '' : ' ') + more;
      broken = false;
      textEnd = from + more.length;
      this.i++;
    }
    // Blank lines kept for a continuation that never came are not part of the value.
    let cut = text.length;
    while (cut > 0 && text.charCodeAt(cut - 1) === LF) cut--;
    text = text.slice(0, cut);
    const value = this.scalar(text, at);
    if (this.tree) this.leaf(value, at, textEnd, 'plain');
    return value;
  }

  block(minIndent: number, depth: number): YamlValue {
    this.node = undefined;
    this.skipBlank();
    if (this.i >= this.lines.length) return null;
    const indent = this.indent();
    if (indent < minIndent) return null;
    const lineAt = (this.at[this.i] ?? 0) + indent;
    this.depth(depth + 1, lineAt);
    const line = (this.lines[this.i] ?? '').slice(indent);

    if (isSeqItem(line)) {
      const out: YamlValue[] = [];
      const items: YamlNode[] | undefined = this.tree ? [] : undefined;
      let seqEnd = lineAt + 1;
      while (this.i < this.lines.length) {
        this.skipBlank();
        if (this.i >= this.lines.length) break;
        const itemLine = this.i;
        try {
          if (this.indent() !== indent) break;
          const cur = (this.lines[this.i] ?? '').slice(indent);
          if (!isSeqItem(cur)) break;
          const rest = cur.slice(1);
          const pad = leading(rest) + 1;
          const restAt = (this.at[this.i] ?? 0) + indent + pad;
          const body = stripComment(rest).trim();
          if (body === '') {
            this.i++;
            out.push(this.block(indent + 1, depth + 1));
          } else if (splitKey(body) !== null || isSeqItem(body)) {
            // `- key: value` and `- - x` open a collection at the column after `- `
            // (the rewritten line keeps its length, so offsets stay valid).
            this.lines[this.i] = ' '.repeat(indent + pad) + rest.trimStart();
            out.push(this.block(indent + pad, depth + 1));
          } else {
            this.i++;
            out.push(this.inlineValue(rest.trim(), restAt, indent, depth + 1, 'after-dash'));
          }
          if (items) {
            const node = this.take(restAt - pad + 1);
            items.push(node);
            seqEnd = Math.max(seqEnd, restAt - pad + 1, node.range.end);
          }
        } catch (err) {
          if (!this.tree || !(err instanceof YamlError)) throw err;
          const bad = this.report(err);
          this.resync(Math.max(this.i, bad + 1, itemLine + 1), indent);
        }
      }
      if (items) {
        this.node = { kind: 'seq', flow: false, items, range: { start: lineAt, end: seqEnd } };
      }
      return out;
    }

    if (splitKey(line) === null) {
      this.i++;
      // A plain scalar continues on any line indented more than its parent node.
      return this.inlineValue(line.trim(), lineAt, minIndent - 1, depth, 'alone');
    }

    const out: YamlMap = {};
    const pairs: YamlPair[] | undefined = this.tree ? [] : undefined;
    let mapEnd = lineAt;
    while (this.i < this.lines.length) {
      this.skipBlank();
      if (this.i >= this.lines.length) break;
      const entryLine = this.i;
      let keyAt = -1;
      let keyEnd = -1;
      let key: string | undefined;
      try {
        const k = this.indent();
        if (k < indent) break;
        if (k > indent) this.fail('bad indentation of a mapping entry', ...this.lineRange(this.i));
        const cur = (this.lines[this.i] ?? '').slice(indent);
        const km = splitKey(cur);
        if (!km) this.fail('can not read a block mapping entry', ...this.lineRange(this.i));
        keyAt = (this.at[this.i] ?? 0) + indent;
        keyEnd = keyAt + km.key.length;
        key = String(this.flow(keyAt, keyEnd, '', depth)[0]);
        const rest = cur.slice(km.length);
        const restAt = keyAt + km.length;
        this.i++;
        this.node = undefined;
        let value: YamlValue = null;
        if (stripComment(rest).trim() === '') {
          this.skipBlank();
          if (this.i < this.lines.length) {
            const next = this.indent();
            const seq = isSeqItem((this.lines[this.i] ?? '').slice(next));
            if (next > indent || (seq && next === indent)) {
              value = this.block(seq ? indent : indent + 1, depth + 1);
            }
          }
        } else {
          value = this.inlineValue(rest.trim(), restAt, indent, depth + 1, 'after-key');
        }
        const node = pairs ? this.take(restAt) : undefined;
        if (this.assign(out, key, value, keyAt, keyEnd) && pairs && node) {
          pairs.push({ key, keyRange: { start: keyAt, end: keyEnd }, value: node });
        }
        // A dropped key still counts towards the span of the mapping.
        if (node) mapEnd = Math.max(mapEnd, keyEnd + 1, node.range.end);
      } catch (err) {
        if (!pairs || !(err instanceof YamlError)) throw err;
        const bad = this.report(err);
        // The key stays (without a value) when it was read and is not a prototype key.
        if (key !== undefined && !UNSAFE_KEYS.has(key)) {
          pairs.push({ key, keyRange: { start: keyAt, end: keyEnd } });
        }
        mapEnd = Math.max(mapEnd, this.lineRange(entryLine)[1]);
        this.resync(Math.max(this.i, bad + 1, entryLine + 1), indent);
      }
    }
    if (pairs) {
      this.node = { kind: 'map', flow: false, pairs, range: { start: lineAt, end: mapEnd } };
    }
    return out;
  }

  read(): YamlValue {
    const from = this.skip(this.start, this.end);
    const ch = this.src[from];
    if (from < this.end && (ch === '{' || ch === '[')) {
      const errors = this.diagnostics.list.length;
      this.rootFlow = this.tree;
      const [value, end] = this.flow(from, this.end, '', 0);
      this.rootFlow = false;
      const rest = this.skip(end, this.end);
      if (rest >= this.end) return value;
      // Tree mode: a root flow document read with errors stays the root; the text after it is
      // one more error (else it is read again as a block, as the default mode does).
      if (this.tree && this.diagnostics.list.length > errors) {
        const [, to] = this.lineRange(this.lineOf(rest, 0));
        this.report(new YamlError('YAML_SYNTAX', END_EXPECTED, rest, to));
        return value;
      }
    }
    if (this.tree) return this.readTree();
    const value = this.block(0, 0);
    this.skipBlank();
    if (this.i < this.lines.length && (this.lines[this.i] ?? '').trim() !== '...') {
      this.fail(END_EXPECTED, ...this.lineRange(this.i));
    }
    return value;
  }

  /**
   * Tree mode: the root block, and after it ends early (a less indented line, or a mapping
   * after a sequence), each further block from the line where the last one stopped, with one
   * error for that line. The root is the first block that is a mapping (else the first block);
   * later mappings add their entries to it, and other later blocks are read only for their
   * errors.
   */
  readTree(): YamlValue {
    let first: [YamlValue, YamlNode | undefined] | undefined;
    let map: YamlMap | undefined;
    let root: YamlMapNode | undefined;
    for (;;) {
      this.skipBlank();
      if (this.i >= this.lines.length || (this.lines[this.i] ?? '').trim() === '...') break;
      const from = this.i;
      if (first) {
        const [at, to] = this.lineRange(from);
        this.report(new YamlError('YAML_SYNTAX', END_EXPECTED, at, Math.max(to, at)));
      }
      let value: YamlValue;
      try {
        value = this.block(0, 0);
      } catch (err) {
        if (!(err instanceof YamlError)) throw err;
        this.i = Math.max(this.i, this.report(err) + 1, from + 1);
        continue;
      }
      if (this.i === from) this.i++;
      const node = this.node;
      first ??= [value, node];
      if (node?.kind !== 'map') continue;
      // A block mapping node always comes with its YamlMap value.
      const entries = value as YamlMap;
      if (root && map) for (const pair of node.pairs) this.merge(map, root, pair, entries);
      else [root, map] = [node, entries];
    }
    this.node = root ?? first?.[1];
    return map ?? first?.[0] ?? null;
  }

  /** Tree mode: add `pair` of a later root mapping (values in `from`) to the root. */
  merge(map: YamlMap, root: YamlMapNode, pair: YamlPair, from: YamlMap): void {
    root.range.end = Math.max(root.range.end, pair.value?.range.end ?? pair.keyRange.end);
    if (Object.hasOwn(map, pair.key)) {
      const { start, end } = pair.keyRange;
      this.report(
        new YamlError('YAML_SYNTAX', `duplicated mapping key \`${pair.key}\``, start, end)
      );
      root.pairs.push({ key: pair.key, keyRange: pair.keyRange });
      return;
    }
    if (pair.value && Object.hasOwn(from, pair.key)) map[pair.key] = from[pair.key] ?? null;
    root.pairs.push(pair);
  }
}

/**
 * Read the YAML in `src` (or in `[options.start, options.end)` of it) with js-yaml's JSON
 * schema semantics. Never throws: errors come back as diagnostics with ranges into `src`.
 *
 * With `tree: true` (for editors) the result also has the node tree, with a range for every
 * key and value, and the read goes on after an error, with at most one error per line.
 */
export function parseYaml(src: string, options: YamlTreeOptions): YamlTreeResult;
export function parseYaml(src: string, options?: YamlOptions): YamlResult;
export function parseYaml(
  src: string,
  options: YamlOptions & { tree?: boolean } = {}
): YamlResult | YamlTreeResult {
  const start = options.start ?? 0;
  const end = options.end ?? src.length;
  const diagnostics = new Diagnostics();
  const tree = options.tree === true;
  const reader = new Reader(src, start, end, options.indent ?? '', diagnostics, tree);
  try {
    for (let i = start; i < end; i++) {
      if (src.charCodeAt(i) !== NUL) continue;
      const message = 'null byte is not allowed in input';
      if (tree) reader.report(new YamlError('YAML_SYNTAX', message, i, i + 1));
      else reader.fail(message, i);
    }
    const value = reader.read();
    if (!tree) return { value, diagnostics: diagnostics.list };
    // Errors of a flow collection can be reported after later ones (its own `never closed`).
    const list = [...diagnostics.list].sort((a, b) => a.range.start - b.range.start);
    return { value, root: reader.node ?? null, diagnostics: list };
  } catch (err) {
    if (!(err instanceof YamlError)) throw err;
    diagnostics.error(err.code, `Invalid YAML: ${err.message}.`, {
      start: err.start,
      end: err.end,
    });
    if (!tree) return { value: null, diagnostics: diagnostics.list };
    return { value: null, root: null, diagnostics: diagnostics.list };
  }
}

/** A YAML mapping (not null, an array or a scalar). */
export function isYamlMap(value: YamlValue | undefined): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
