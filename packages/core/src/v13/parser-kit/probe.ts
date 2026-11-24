/**
 * Probe mode (DESIGN §4.5 "Probe", R-LANG-7, D95): a parse that also records what the parser
 * would accept at one offset, for completion. Recovery and every other output stay as they
 * are; without a probe nothing here runs.
 *
 * The probed token: take the first significant token that ends at or after the offset; skip it
 * when it ends exactly at the offset and its kind is one the cursor follows rather than extends
 * (line breaks, blanks and the diagram's `follow` kinds: punctuation such as `:::`, `-->`, `[`),
 * or when the offset is in the blanks a token took after its text (links and `end` take them),
 * or past a line break inside a followed token (an empty line inside a run of line breaks is
 * after the separator). If that token is part of a word, the probed token is the word's first token: a word is a run
 * of adjacent tokens (no gap, no leading blank, no line break or trailing blank in an earlier
 * one) none of which has a followed kind, so
 * `café` lexed as `caf` + `é` or `my-` as `my` + `-` is one word. The prefix is the text from
 * the probed token's start (leading blanks dropped) to the offset.
 *
 * An offset inside a comment, directive or front matter is not in code: the parser marks it
 * with {@link outside}, `expected` stays empty and `mode` names where it is.
 */
import { isLineEnd, isSpace } from './chars.js';
import type { KindSet } from './cursor.js';
import type { Range } from './positions.js';
import { Kind } from './tokens.js';
import type { TokenKind, TokenStream } from './tokens.js';
import type { TokenView } from './view.js';

/** `ParseResult.probe`. */
export interface ProbeResult {
  offset: number;
  /** Kinds the parser tested or would accept at the probed token, first-tested first. */
  expected: TokenKind[];
  /**
   * The lexer's mode at the offset (flowchart: the jison start condition), or where the
   * offset is outside code (`comment`, `directive`, `frontMatter`); `''` if unset.
   */
  mode: string;
  /** What was typed of the probed word before the offset; empty at a token boundary. */
  prefix: Range;
}

const isBlankOrLineEnd = (c: number) => isSpace(c) || isLineEnd(c);

const NO_KINDS: KindSet = /* @__PURE__ */ new Uint8Array(0);

/** Collects the {@link ProbeResult} of one parse. Create one per parse. */
export class Probe {
  readonly offset: number;
  /** Set by the lexer through {@link lexed}. */
  mode = '';
  private kinds: TokenKind[] = [];
  private start = -1;
  private frozen = false;
  private modeSet = false;
  private off = false;
  // The probed index of the last view asked about. Views are immutable arrays made once per
  // lex, so the view object and its start offset identify the answer.
  private view: TokenView | undefined;
  private viewFrom = -1;
  private target = -1;

  /** `follow`: the diagram's kinds the cursor follows rather than extends (punctuation). */
  constructor(
    private readonly source: string,
    offset: number,
    private readonly follow: KindSet = NO_KINDS
  ) {
    // NaN and -Infinity give 0, Infinity the end; fractions are truncated.
    let o = 0;
    if (Number.isFinite(offset)) o = Math.trunc(offset);
    else if (offset > 0) o = source.length;
    this.offset = Math.max(0, Math.min(o, source.length));
  }

  private follows(kind: TokenKind): boolean {
    return kind === Kind.Newline || kind === Kind.Space || this.follow[kind] === 1;
  }

  /** Whether a token is the probed token or after it, before words are joined. */
  private covers(start: number, end: number, kind: TokenKind): boolean {
    const o = this.offset;
    if (end < o || start === end) return end >= o;
    const follows = this.follows(kind);
    // A token's text without the blanks it took after it (`end\n  `, ` --> `).
    let text = end;
    while (text > start && isBlankOrLineEnd(this.source.charCodeAt(text - 1))) text--;
    if (text > start) {
      // In those blanks the cursor is after the token; right after its text it extends a word
      // and follows anything else.
      if (text < o) return false;
      if (text === o) return !follows;
    } else if (end === o) return !follows;
    // Past a line break inside a followed token (a line-break run), the cursor is after it.
    if (follows)
      for (let i = start; i < o; i++) if (isLineEnd(this.source.charCodeAt(i))) return false;
    return true;
  }

  /** Whether `[from, to)` holds a line break, or ends with a blank. */
  private blankIn(from: number, to: number): boolean {
    if (to > from && isBlankOrLineEnd(this.source.charCodeAt(to - 1))) return true;
    for (let i = from; i < to; i++) if (isLineEnd(this.source.charCodeAt(i))) return true;
    return false;
  }

  /**
   * Index of the probed token in `view`, or -1. `from` is the source offset the view was lexed
   * from (a view lexed again mid-document holds no token before it); tokens of a kind in
   * `trivia` are skipped.
   */
  targetIn(view: TokenView, from = 0, trivia: KindSet = NO_KINDS): number {
    if (view === this.view && from === this.viewFrom) return this.target;
    this.view = view;
    this.viewFrom = from;
    this.target = -1;
    if (from > this.offset) return -1;
    const { kind, start, end } = view;
    let t = 0;
    while (
      t < view.length &&
      (trivia[kind[t] ?? 0] === 1 || !this.covers(start[t] ?? 0, end[t] ?? 0, kind[t] ?? 0))
    ) {
      t++;
    }
    if (t === view.length) return -1;
    const word = (j: number) => (start[j] ?? 0) < (end[j] ?? 0) && !this.follows(kind[j] ?? 0);
    if (word(t)) {
      for (let p = t - 1; p >= 0 && trivia[kind[p] ?? 0] !== 1; p--) {
        const s = start[t] ?? 0;
        if (!word(p) || end[p] !== s || isSpace(this.source.charCodeAt(s))) break;
        // Never across a line break or the blanks a token took after it (`end\n  A`).
        if (this.blankIn(start[p] ?? 0, s)) break;
        t = p;
      }
    }
    this.target = t;
    return t;
  }

  /** Whether token `i` of `view` is the probed token (see {@link targetIn}). */
  isAt(view: TokenView, i: number, from = 0): boolean {
    return i === this.targetIn(view, from);
  }

  /**
   * The offset is not in code (`mode`: `comment`, `directive`, `frontMatter`): nothing is
   * recorded and the lexer's mode is not taken.
   */
  outside(mode: string): void {
    this.off = true;
    this.mode = mode;
    this.modeSet = true;
  }

  /** {@link outside} when the offset is inside a comment or directive token of `tokens`. */
  trivia(tokens: TokenStream): void {
    const o = this.offset;
    for (let j = 0; j < tokens.length; j++) {
      const k = tokens.kind[j];
      if (k !== Kind.Comment && k !== Kind.Directive) continue;
      const end = tokens.end[j] ?? 0;
      // At the very end only if the token does not end with its line break.
      const inside = o < end || (o === end && !isLineEnd(this.source.charCodeAt(end - 1)));
      if ((tokens.start[j] ?? 0) < o && inside) {
        this.outside(k === Kind.Comment ? 'comment' : 'directive');
        return;
      }
    }
  }

  /** The parser tests the probed token, which starts at `start`, for `kinds`. */
  tested(kinds: TokenKind | readonly TokenKind[], start: number): void {
    if (this.frozen || this.off) return;
    if (this.start < 0) this.start = start;
    if (typeof kinds === 'number') {
      if (!this.kinds.includes(kinds)) this.kinds.push(kinds);
      return;
    }
    for (const k of kinds) if (!this.kinds.includes(k)) this.kinds.push(k);
  }

  /**
   * The parser recovers from an error. Once the probed token has been tested, later tests of
   * it come from recovery and are not expectations, so recording stops. With `always`, it
   * stops even if the token was never tested: recovery went past it.
   */
  freeze(always = false): void {
    if (always || this.start >= 0) this.frozen = true;
  }

  /** Forget what was recorded: the parser lexes the text around the offset again. */
  reset(): void {
    this.kinds = [];
    this.start = -1;
    this.frozen = false;
    if (!this.off) this.modeSet = false;
  }

  /**
   * The lexer read source `[start, end)` in `mode`. Call it for each step in order, then once
   * with the mode it ends in, at the end of the text. The mode at the offset is that of the
   * step whose text holds it, else of the first step at or after it.
   */
  lexed(start: number, end: number, mode: string): void {
    if (this.modeSet) return;
    const o = this.offset;
    if (start >= o || end > o) {
      this.mode = mode;
      this.modeSet = true;
    }
  }

  result(): ProbeResult {
    const o = this.offset;
    let start = this.start >= 0 && this.start < o ? this.start : o;
    while (start < o && isSpace(this.source.charCodeAt(start))) start++;
    return { offset: o, expected: [...this.kinds], mode: this.mode, prefix: { start, end: o } };
  }
}
